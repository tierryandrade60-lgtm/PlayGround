import * as THREE from 'three';
import { createStickmanRig, StickmanNodes } from './StickmanRig';
import { AnimationController } from './AnimationController';
import { TargetDummy } from './TargetDummy';
import { roundDamage } from './DamageMath';
import { ProjectileSystem } from './ProjectileSystem';
import { IronManAbilities } from './IronManAbilities';
import { AgathaAbilities } from './AgathaAbilities';
import { VisionAbilities } from './VisionAbilities';
import { audioSystem } from './AudioSystem';
import { settingsManager, GameSettings, ReticlePosition } from './SettingsManager';
import { BuildModeManager } from './BuildModeManager';
import { liveConfigManager, LiveGameConfig } from './LiveConfigManager';
import { activeAgathaConfig } from './abilities/agatha/AgathaConfig';
import { activeIronManConfig } from './abilities/ironman/IronManConfig';
import { activeVisionConfig } from './abilities/vision/VisionConfig';
import { getCombatButtonProfile } from './systems/AbilityButtonSystem';
import { scriptRuntimeEngine } from './ScriptRuntimeEngine';
import { gameplayRestrictions } from './GameplayRestrictions';
import { DealDamageSystem } from './systems/DealDamageSystem';
import { flightSystem } from './systems/FlightSystem';
import {
  movementSystem,
  DEFAULT_BODY_HEIGHT,
  DEFAULT_STEP_HEIGHT,
} from './systems/MovementSystem';
import { worldCollision } from './systems/WorldCollision';

export interface JoystickState {
  x: number; // -1 to 1
  y: number; // -1 to 1
  active: boolean;
}

/** Downward acceleration applied while walking on foot (world units / s²). */
const PLAYER_GRAVITY = 26;
/** Terminal fall speed so long drops stay controllable. */
const PLAYER_MAX_FALL_SPEED = 22;
/** Clearance kept between a flying character and the surface it hovers over. */
const FLYING_SURFACE_CLEARANCE = 0.08;
/** Extra altitude gained while flying to clear a blocking obstacle. */
const FLYING_OBSTACLE_CLEARANCE = 0.55;

export interface TargetBracketInfo {
  visible: boolean;
  x: number; // screen px
  y: number; // screen px
  size: number; // box dimension px
}

export interface ProjectedDamageNumber {
  id: number;
  value: number;
  x: number;
  y: number;
  opacity: number;
  scale: number;
}

export class GameScene {
  private container: HTMLElement;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private stickman: StickmanNodes;
  private animController: AnimationController;
  private projectileSystem: ProjectileSystem;
  private dealDamageSystem!: DealDamageSystem;
  private flightSystem = flightSystem;
  private movementSystem = movementSystem;
  public ironManAbilities!: IronManAbilities;
  public agathaAbilities!: AgathaAbilities;
  public visionAbilities!: VisionAbilities;
  public currentPowerSet: 'ironman' | 'agatha' | 'vision' = 'ironman';
  private combatButtonProfileProvider: (powerSet: 'ironman' | 'agatha' | 'vision') => any =
    getCombatButtonProfile;

  // Dummies & Obstacles
  public dummies: TargetDummy[] = [];
  public structureBoxes: THREE.Box3[] = [];
  private baseplateMesh!: THREE.Mesh;

  // Build Mode System
  public isBuildMode: boolean = false;
  public buildModeManager!: BuildModeManager;
  private freeFlyInput = { x: 0, y: 0, active: false };
  public freeFlyVertical: number = 0;
  private unsubLiveConfig!: () => void;
  public buildFocusPoint: THREE.Vector3 = new THREE.Vector3(0, 1.5, 0);
  public buildCamYaw: number = 0;
  public buildCamPitch: number = 0.35;
  public buildCamDist: number = 14.0;

  public setFreeFlyInput(x: number, y: number, active: boolean): void {
    this.freeFlyInput = { x, y, active };
  }

  public setFreeFlyVertical(dir: number): void {
    this.freeFlyVertical = dir;
  }

  // Settings subscription
  private settings: GameSettings;
  private unsubSettings: () => void;

  private isRunning: boolean = false;
  private animFrameId: number = 0;
  private lastTime: number = 0;

  // Player movement state
  private playerPos: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private playerRotationY: number = 0;
  private targetRotationY: number = 0;
  private currentSpeed: number = 0;
  private groundMaxSpeed: number = 6.4;
  private flightMaxSpeed: number = 8.8;
  private playerCollisionRadius: number = 0.45;
  private playerBodyHeight: number = DEFAULT_BODY_HEIGHT;
  private playerStepHeight: number = DEFAULT_STEP_HEIGHT;
  private playerVelocityY: number = 0;
  private isGrounded: boolean = true;
  private flightObstacle: THREE.Box3 | null = null;

  // Player vitals. No enemy currently attacks the player, but this keeps the
  // damage/control pipeline honest for future enemies and for phasing.
  public playerMaxHealth: number = 100;
  public playerHealth: number = 100;

  // Camera configuration (live-tunable through LiveConfigManager)
  private cameraBaseFov: number = 50;
  private cameraDistance: number = 4.8;
  private cameraShoulderOffset: number = 0.9;
  private cameraHeightOffset: number = 1.85;
  private cameraSmoothness: number = 10;
  private cameraShakeScale: number = 1;
  private animationSpeed: number = 1;

  // Directional Dash State
  public isDashing: boolean = false;
  private dashTimer: number = 0;
  private dashDuration: number = 0.22;
  public dashCooldownRemaining: number = 0;
  public dashCooldownTotal: number = 2.2;
  private dashDir: THREE.Vector3 = new THREE.Vector3(0, 0, -1);
  private dashSpeed: number = 19.5;

  // Controlled Flight State
  public isFlying: boolean = false;
  private targetFlightY: number = 0;
  private currentFlightY: number = 0;
  private flightBankRoll: number = 0;
  // Free flight: vertical component of the look direction applied by the joystick
  private freeFlightClimb: number = 0;

  // Camera follow state
  private cameraOffset: THREE.Vector3 = new THREE.Vector3(0, 2.3, 5.0);
  private cameraTarget: THREE.Vector3 = new THREE.Vector3(0, 1.35, 0);
  private currentCameraPos: THREE.Vector3 = new THREE.Vector3(0, 2.3, 5.0);

  // Camera Orbit / Drag angle
  private camYaw: number = 0;
  private camPitch: number = 0;

  // Camera Shake
  private shakeIntensity: number = 0;
  private shakeDecay: number = 18.0;

  // Marvel Rivals-style Hit Confirmation
  public lastHitConfirmTime: number = 0;
  public triggerHitConfirm(): void {
    const now = performance.now();
    if (now - this.lastHitConfirmTime > 40) {
      this.lastHitConfirmTime = now;
    }
  }

  // Aim and Aim-assist
  private activeTarget: TargetDummy | null = null;
  private currentAimPoint: THREE.Vector3 = new THREE.Vector3();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private groundPlane: THREE.Plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Input state
  private joystick: JoystickState = { x: 0, y: 0, active: false };
  private keyState: { [key: string]: boolean } = {};

  // Lighting & Shadows
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;

  constructor(container: HTMLElement) {
    this.container = container;
    this.settings = settingsManager.get();

    // 1. Scene setup
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0xa1c3e6);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.Fog(skyColor, 40, 200);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 300);
    this.camera.position.set(0, 2.5, 5.5);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    container.appendChild(this.renderer.domElement);

    // 3b. Build Mode Manager Initialization
    this.buildModeManager = new BuildModeManager(this.scene, this.camera, this.renderer);
    this.buildModeManager.onCollisionBoxesChanged = (boxes) => {
      this.structureBoxes = boxes;
    };
    this.buildModeManager.onDummyCreated = (dummy) => {
      this.dummies.push(dummy);
    };
    this.buildModeManager.onDummyRemoved = (dummy) => {
      const idx = this.dummies.indexOf(dummy);
      if (idx !== -1) {
        this.dummies.splice(idx, 1);
      }
    };

    // 4. Lighting & Baseplate & Testing Structures
    this.setupLighting();
    this.buildModeManager.registerDefaultSunLight(this.dirLight);
    this.setupBaseplate();
    this.buildModeManager.registerDefaultBaseplate(this.baseplateMesh);
    this.setupTestingStructures();

    // 5. White Clay Stickman Rig
    this.stickman = createStickmanRig();
    this.scene.add(this.stickman.root);
    this.buildModeManager.registerDefaultStickman(this.stickman.root);
    this.animController = new AnimationController(this.stickman);

    // 6. Projectile System & centralized damage pipeline
    this.projectileSystem = new ProjectileSystem(this.scene, (isTargetHit: boolean) => {
      if (isTargetHit) {
        this.triggerHitConfirm();
        if (this.settings.cameraShake) {
          this.addCameraShake(0.04);
        }
      }
    });
    this.dealDamageSystem = new DealDamageSystem(this.projectileSystem, () => {
      this.triggerHitConfirm();
    });

    // 7. Target Dummies (Three stationary training dummies by default, #3 is Rival)
    this.setupDummies();

    // 8. Iron Man Abilities System
    this.ironManAbilities = new IronManAbilities(
      this.scene,
      this.stickman,
      () => {
        if (this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead) {
          return { pos: this.activeTarget.getCenter(), target: this.activeTarget };
        }
        return { pos: this.currentAimPoint.clone(), target: null };
      },
      (dummy, dmg, hitPos, kb) => {
        this.dealDamage(dummy, dmg, hitPos, kb);
      },
      (amt) => {
        if (this.settings.cameraShake) {
          this.addCameraShake(amt);
        }
      }
    );
    this.ironManAbilities.onRepulsorFired = (hand, aimPitch) => {
      this.animController.triggerRepulsor(hand, aimPitch);
    };

    // 8b. Agatha Harkness Dark Magic Abilities System
    this.agathaAbilities = new AgathaAbilities(
      this.scene,
      this.stickman,
      () => {
        if (this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead) {
          return { pos: this.activeTarget.getCenter(), target: this.activeTarget };
        }
        return { pos: this.currentAimPoint.clone(), target: null };
      },
      (dummy, dmg, hitPos, kb) => {
        let finalDmg = dmg;
        if (this.agathaAbilities?.runicWardState?.active) {
          finalDmg = dmg * 1.15;
        }
        this.dealDamage(dummy, finalDmg, hitPos, kb);
      },
      (amt) => {
        if (this.settings.cameraShake) {
          this.addCameraShake(amt);
        }
      }
    );
    this.agathaAbilities.onArcaneCast = (hand, aimPitch) => {
      this.animController.triggerRepulsor(hand, aimPitch);
    };

    // 8c. Vision (Mind Stone / solar / phasing / psionic flight)
    this.visionAbilities = this.createVisionAbilities();

    // 9. Apply initial graphics settings
    this.applyGraphicsSettings(this.settings.graphics);

    // 9. Subscribe to settings updates
    this.unsubSettings = settingsManager.subscribe((newSettings) => {
      if (newSettings.graphics !== this.settings.graphics) {
        this.applyGraphicsSettings(newSettings.graphics);
      }
      this.settings = newSettings;
    });

    // 9b. Subscribe to live configuration updates
    this.unsubLiveConfig = liveConfigManager.subscribe((cfg) => {
      this.applyLiveConfig(cfg);
    });

    // 9c. Load any saved user constructions from storage
    this.buildModeManager.loadFromStorage();

    // 9d. Register with script runtime engine for live execution
    scriptRuntimeEngine.setGameScene(this);

    // 9e. Automatically rehydrate and apply all saved scripts from localStorage
    scriptRuntimeEngine.applyAllSavedScripts(this);

    // 10. Event listeners
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    // Start loop
    this.start();
  }

  private setupLighting(): void {
    this.hemiLight = new THREE.HemisphereLight(0xd9e8f5, 0x647080, 0.75);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff7ea, 1.25);
    this.dirLight.position.set(16, 26, 14);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 2048;
    this.dirLight.shadow.mapSize.height = 2048;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 65;
    const d = 14;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0004;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);

    const rimLight = new THREE.DirectionalLight(0xb4d0ee, 0.45);
    rimLight.position.set(-14, 12, -18);
    this.scene.add(rimLight);
  }

  private setupBaseplate(): void {
    const planeGeo = new THREE.PlaneGeometry(800, 800);
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0x768291,
      roughness: 0.85,
      metalness: 0.05,
    });

    this.baseplateMesh = new THREE.Mesh(planeGeo, planeMat);
    this.baseplateMesh.rotation.x = -Math.PI / 2;
    this.baseplateMesh.position.y = 0;
    this.baseplateMesh.receiveShadow = true;
    this.scene.add(this.baseplateMesh);
  }

  private setupTestingStructures(): void {
    this.structureBoxes = [];
    const structMat = new THREE.MeshStandardMaterial({
      color: 0x8a929d,
      roughness: 0.75,
      metalness: 0.1,
    });

    // 1. Large block
    const largeBlockGeo = new THREE.BoxGeometry(4, 6, 4);
    const largeBlock = new THREE.Mesh(largeBlockGeo, structMat);
    largeBlock.position.set(-12, 3, -15);
    largeBlock.castShadow = true;
    largeBlock.receiveShadow = true;
    this.scene.add(largeBlock);
    this.structureBoxes.push(new THREE.Box3().setFromObject(largeBlock));
    this.buildModeManager.registerDefaultStructure(largeBlock, 'Large Block', 'default_struct_1');

    // 2. Wide platform
    const platformGeo = new THREE.BoxGeometry(14, 0.8, 8);
    const platform = new THREE.Mesh(platformGeo, structMat);
    platform.position.set(14, 0.4, -16);
    platform.castShadow = true;
    platform.receiveShadow = true;
    this.scene.add(platform);
    this.structureBoxes.push(new THREE.Box3().setFromObject(platform));
    this.buildModeManager.registerDefaultStructure(platform, 'Wide Platform', 'default_struct_2');

    // 3. Medium block
    const medBlockGeo = new THREE.BoxGeometry(3, 3, 3);
    const medBlock = new THREE.Mesh(medBlockGeo, structMat);
    medBlock.position.set(-8, 1.5, -25);
    medBlock.castShadow = true;
    medBlock.receiveShadow = true;
    this.scene.add(medBlock);
    this.structureBoxes.push(new THREE.Box3().setFromObject(medBlock));
    this.buildModeManager.registerDefaultStructure(medBlock, 'Medium Block', 'default_struct_3');

    // 4. Small block
    const smallBlockGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const smallBlock = new THREE.Mesh(smallBlockGeo, structMat);
    smallBlock.position.set(8, 0.75, -22);
    smallBlock.castShadow = true;
    smallBlock.receiveShadow = true;
    this.scene.add(smallBlock);
    this.structureBoxes.push(new THREE.Box3().setFromObject(smallBlock));
    this.buildModeManager.registerDefaultStructure(smallBlock, 'Small Block', 'default_struct_4');

    // 5. Thin wall
    const wallGeo = new THREE.BoxGeometry(0.6, 5, 6);
    const wall = new THREE.Mesh(wallGeo, structMat);
    wall.position.set(0, 2.5, -28);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.scene.add(wall);
    this.structureBoxes.push(new THREE.Box3().setFromObject(wall));
    this.buildModeManager.registerDefaultStructure(wall, 'Thin Wall', 'default_struct_5');
  }

  public getValidSpawnPosition(): THREE.Vector3 {
    let pos = new THREE.Vector3();
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 80) {
      attempts++;
      const angle = Math.random() * Math.PI * 2;
      const distance = 8 + Math.random() * 16;
      pos.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);

      // Avoid spawn point too close to player (0,0)
      if (pos.length() < 5) continue;

      // Keep the dummy footprint clear of every solid structure (XZ only,
      // matching the character collision model — no inflated vertical tests).
      const dummyRadius = 1.1;
      let intersects = false;
      for (const box of worldCollision.getMovementBoxes()) {
        if (!box || box.isEmpty()) continue;
        if (
          pos.x > box.min.x - dummyRadius &&
          pos.x < box.max.x + dummyRadius &&
          pos.z > box.min.z - dummyRadius &&
          pos.z < box.max.z + dummyRadius
        ) {
          intersects = true;
          break;
        }
      }

      if (!intersects) {
        valid = true;
      }
    }

    return pos;
  }

  private setupDummies(): void {
    const dummyPositions = [
      this.getValidSpawnPosition(),
      this.getValidSpawnPosition(),
      this.getValidSpawnPosition(),
    ];

    dummyPositions.forEach((pos, idx) => {
      const dummy = new TargetDummy(
        idx + 1,
        pos,
        (destroyPos) => {
          this.projectileSystem.emitDestructionParticles(destroyPos);
          if (this.settings.cameraShake) {
            this.addCameraShake(0.24);
          }
        },
        () => this.getValidSpawnPosition()
      );
      if (idx === 2) {
        dummy.setAsRival();
      }
      this.dummies.push(dummy);
      this.scene.add(dummy.group);
      this.buildModeManager.registerDefaultDummy(
        dummy,
        idx === 2 ? 'Rival Dummy (Beam Clash)' : `Training Dummy ${idx + 1}`,
        `default_dummy_${idx + 1}`
      );
    });
  }

  private applyGraphicsSettings(quality: 'low' | 'medium' | 'high'): void {
    if (quality === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1.0);
      this.dirLight.castShadow = false;
    } else if (quality === 'medium') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
      this.renderer.setPixelRatio(1.0);
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(1024, 1024);
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null as unknown as THREE.WebGLRenderTarget;
      }
    } else {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(2048, 2048);
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null as unknown as THREE.WebGLRenderTarget;
      }
    }
  }

  public addCameraDrag(deltaX: number, deltaY: number): void {
    const sens = (this.settings.cameraSensitivity || 1.0) * (this.settings.touchSensitivity || 1.0) * 0.0052;
    this.camYaw += deltaX * sens;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch - deltaY * sens, -0.45, 0.65);
  }

  public addCameraShake(intensity: number): void {
    if (!this.settings.cameraShake) return;
    this.shakeIntensity = Math.min(0.12, this.shakeIntensity + intensity * 0.35);
  }

  public setJoystickInput(x: number, y: number, active: boolean): void {
    this.joystick.x = x;
    this.joystick.y = y;
    this.joystick.active = active;
  }

  public getReticleScreenCoords(_position?: unknown): { x: number; y: number } {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    // Exactly at the center of the screen
    return { x: width * 0.50, y: height * 0.50 };
  }

  public orientCharacterToAim(): void {
    const toAimDir = this.currentAimPoint.clone().sub(this.playerPos);
    toAimDir.y = 0;
    if (toAimDir.lengthSq() > 0.05) {
      this.playerRotationY = Math.atan2(-toAimDir.x, -toAimDir.z);
      this.stickman.root.rotation.y = this.playerRotationY;
    }
  }

  public getMovementDirection(): THREE.Vector3 {
    let inputX = 0;
    let inputY = 0;
    if (this.joystick.active) {
      inputX = this.joystick.x;
      inputY = this.joystick.y;
    } else {
      if (this.keyState['KeyW'] || this.keyState['ArrowUp']) inputY -= 1;
      if (this.keyState['KeyS'] || this.keyState['ArrowDown']) inputY += 1;
      if (this.keyState['KeyA'] || this.keyState['ArrowLeft']) inputX -= 1;
      if (this.keyState['KeyD'] || this.keyState['ArrowRight']) inputX += 1;
    }

    const inputLen = Math.hypot(inputX, inputY);
    if (inputLen > 0.05) {
      const camForward = new THREE.Vector3();
      this.camera.getWorldDirection(camForward);
      camForward.y = 0;
      camForward.normalize();

      const camRight = new THREE.Vector3();
      camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

      return new THREE.Vector3()
        .addScaledVector(camRight, inputX / inputLen)
        .addScaledVector(camForward, -inputY / inputLen)
        .normalize();
    }
    return new THREE.Vector3(
      -Math.sin(this.playerRotationY),
      0,
      -Math.cos(this.playerRotationY)
    ).normalize();
  }

  public setPowerSet(set: 'ironman' | 'agatha' | 'vision'): void {
    this.currentPowerSet = set;
    this.animController.isAgatha = set === 'agatha';
    this.animController.isVision = set === 'vision';
    if (this.stickman.mindStone) {
      this.stickman.mindStone.visible = set === 'vision';
    }
    this.respawnPlayer();
  }

  public isPlayerPhasing(): boolean {
    return this.currentPowerSet === 'vision' && (
      !!this.visionAbilities?.isPhasing ||
      !!this.visionAbilities?.isPhasingDashActive
    );
  }

  /**
   * Applies damage to the player through the same rules used by enemy powers.
   * Phasing rejects the hit entirely (no damage, no control side effects).
   */
  public damagePlayer(amount: number): number {
    if (this.isPlayerPhasing() || gameplayRestrictions.hasRestriction('Invulnerable')) {
      return 0;
    }
    const damage = roundDamage(amount);
    if (damage <= 0) return 0;
    this.playerHealth = Math.max(0, this.playerHealth - damage);
    if (this.playerHealth <= 0) {
      this.playerHealth = this.playerMaxHealth;
      this.respawnPlayer();
    }
    return damage;
  }

  /**
   * Applies an enemy control effect unless Vision is currently intangible.
   * Returns false when the effect was fully rejected.
   */
  public applyPlayerControlEffect(
    type: 'NoPowers' | 'NoMovement' | 'NoFlight' | 'NoBasicAttack' | 'Anchored' | 'Stunned' | 'Silenced',
    duration: number,
    source: string = 'enemy-power'
  ): boolean {
    if (this.isPlayerPhasing()) return false;
    gameplayRestrictions.applyRestriction(type, source, duration);
    return true;
  }

  public respawnPlayer(): void {
    this.playerPos.set(0, 0, 0);
    this.playerRotationY = 0;
    this.targetRotationY = 0;
    this.currentSpeed = 0;
    this.stickman.root.position.copy(this.playerPos);
    this.stickman.root.rotation.y = this.playerRotationY;

    this.currentCameraPos.set(0.9, 2.2, 4.8);
    this.camYaw = 0;
    this.camPitch = 0;

    // Reset flight and dash
    this.isFlying = false;
    this.targetFlightY = 0;
    this.currentFlightY = 0;
    this.freeFlightClimb = 0;
    this.playerVelocityY = 0;
    this.isGrounded = true;
    this.flightObstacle = null;
    this.isDashing = false;
    this.dashTimer = 0;
    this.dashCooldownRemaining = 0;
    this.animController.isFlying = false;
    this.animController.isDashing = false;
    this.playerHealth = this.playerMaxHealth;

    // Reset abilities
    if (this.ironManAbilities) {
      this.ironManAbilities.stopDualBeam();
      this.ironManAbilities.stopSpinningLasers();
      this.ironManAbilities.customPowerColor = null;
    }
    if (this.agathaAbilities) {
      this.agathaAbilities.cancelDarkDrain();
      this.agathaAbilities.cancelArcaneChoke();
      this.agathaAbilities.isArcaneFlightActive = false;
    }
    if (this.visionAbilities) {
      this.visionAbilities.stopAll();
    }
    audioSystem.stopAllLoops();
    this.animController.dualBeamActive = false;
    this.animController.spinningLasersActive = false;
    this.animController.darkDrainActive = false;
    this.animController.arcaneChokeActive = false;
    this.animController.mindBeamActive = false;
    this.animController.phasingActive = false;
    this.animController.headGripActive = false;
    this.animController.isPhasingDash = false;

    if (this.stickman.mindStone) {
      this.stickman.mindStone.visible = this.currentPowerSet === 'vision';
    }

    this.stickman.thrusters.leftFoot.setIntensity(0);
    this.stickman.thrusters.rightFoot.setIntensity(0);
    this.stickman.thrusters.leftHand.setIntensity(0);
    this.stickman.thrusters.rightHand.setIntensity(0);

    // Particle spawn chime
    const spawnColor = this.currentPowerSet === 'agatha' ? 0xa855f7 : this.currentPowerSet === 'vision' ? 0xffd54a : 0x00f0ff;
    this.projectileSystem.emitImpactParticles(new THREE.Vector3(0, 1, 0), 25, spawnColor);
    if (this.currentPowerSet === 'agatha') {
      audioSystem.playShadowStep('arrive');
    } else {
      audioSystem.playRepulsor();
    }
  }

  public triggerAttack(): boolean {
    // Centralized gameplay restriction check
    if (
      gameplayRestrictions.hasRestriction('NoBasicAttack') ||
      gameplayRestrictions.hasRestriction('NoPowers') ||
      gameplayRestrictions.hasRestriction('Stunned')
    ) {
      return false;
    }
    if (this.currentPowerSet === 'vision' && (
      this.visionAbilities?.isHeadGripActive ||
      this.visionAbilities?.isPhasingDashActive
    )) {
      return false;
    }

    // Naturally orient character to aim direction when attacking
    this.orientCharacterToAim();

    if (this.currentPowerSet === 'agatha') {
      const aim = this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead
        ? { pos: this.activeTarget.getCenter() }
        : { pos: this.currentAimPoint.clone() };
      const handPos = new THREE.Vector3();
      this.stickman.rightHand.getWorldPosition(handPos);
      const toAim = aim.pos.clone().sub(handPos).normalize();
      const aimPitch = Math.asin(THREE.MathUtils.clamp(toAim.y, -0.99, 0.99));

      if (this.agathaAbilities) {
        if (typeof (this.agathaAbilities as any).triggerAttack === 'function') {
          return (this.agathaAbilities as any).triggerAttack(aimPitch);
        }
        if (typeof this.agathaAbilities.fireArcaneBlast === 'function') {
          this.agathaAbilities.fireArcaneBlast(aimPitch);
          return true;
        }
      }
      return false;
    }

    if (this.currentPowerSet === 'ironman') {
      const aim = this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead
        ? { pos: this.activeTarget.getCenter() }
        : { pos: this.currentAimPoint.clone() };
      const handPos = new THREE.Vector3();
      this.stickman.rightHand.getWorldPosition(handPos);
      const toAim = aim.pos.clone().sub(handPos).normalize();
      const aimPitch = Math.asin(THREE.MathUtils.clamp(toAim.y, -0.99, 0.99));
      if (this.ironManAbilities) {
        if (typeof (this.ironManAbilities as any).triggerAttack === 'function') {
          return (this.ironManAbilities as any).triggerAttack(aimPitch);
        }
        this.ironManAbilities.fireRepulsorShot(aimPitch);
        return true;
      }
      return false;
    }

    if (this.currentPowerSet === 'vision' && this.visionAbilities) {
      const aim = this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead
        ? { pos: this.activeTarget.getCenter() }
        : { pos: this.currentAimPoint.clone() };
      const stonePos = new THREE.Vector3();
      this.stickman.mindStone.getWorldPosition(stonePos);
      const toAim = aim.pos.clone().sub(stonePos).normalize();
      const aimPitch = Math.asin(THREE.MathUtils.clamp(toAim.y, -0.99, 0.99));
      if (this.visionAbilities.triggerAttack()) {
        this.animController.triggerAttack(aimPitch, () => {});
        return true;
      }
      return false;
    }

    return false;
  }

  public triggerAbility(id: number): boolean {
    // Centralized gameplay restriction check
    if (
      gameplayRestrictions.hasRestriction('NoPowers') ||
      gameplayRestrictions.hasRestriction('Silenced') ||
      gameplayRestrictions.hasRestriction('Stunned')
    ) {
      return false;
    }
    if (this.currentPowerSet === 'vision' && this.visionAbilities) {
      if (this.visionAbilities.isPhasingDashActive) return false;
      if (this.visionAbilities.isHeadGripActive && id !== 4) return false;
    }

    if (this.currentPowerSet === 'agatha' && this.agathaAbilities) {
      this.orientCharacterToAim();
      // 1. Dynamic triggerAbility hook if defined by custom script
      if (typeof (this.agathaAbilities as any).triggerAbility === 'function') {
        const handled = (this.agathaAbilities as any).triggerAbility(id, this.playerPos, this.dummies);
        if (handled !== undefined) return handled;
      }

      // 2. Standard independent ability dispatches
      if (id === 1) {
        if (typeof this.agathaAbilities.triggerDarkDrain === 'function') {
          return this.agathaAbilities.triggerDarkDrain(this.playerPos, this.dummies);
        }
      } else if (id === 2) {
        if (typeof this.agathaAbilities.fireChaosOrb === 'function') {
          return this.agathaAbilities.fireChaosOrb();
        }
      } else if (id === 3) {
        if (typeof this.agathaAbilities.triggerRunicWard === 'function') {
          return this.agathaAbilities.triggerRunicWard(this.playerPos, this.dummies);
        }
      } else if (id === 4) {
        if (typeof this.agathaAbilities.triggerArcaneChoke === 'function') {
          return this.agathaAbilities.triggerArcaneChoke(this.playerPos, this.dummies);
        }
      }
      return false;
    }

    if (this.currentPowerSet === 'ironman' && this.ironManAbilities) {
      this.orientCharacterToAim();
      if (typeof (this.ironManAbilities as any).triggerAbility === 'function') {
        const handled = (this.ironManAbilities as any).triggerAbility(id);
        if (handled !== undefined) return handled;
      }

      if (id === 1) {
        this.ironManAbilities.fireMissileVolley();
        return true;
      } else if (id === 2) {
        return this.ironManAbilities.toggleDualBeam();
      } else if (id === 3) {
        this.ironManAbilities.fireHeavyMissile();
        return true;
      } else if (id === 4) {
        if (this.ironManAbilities.isSpinningLasersActive) {
          this.ironManAbilities.stopSpinningLasers();
          return false;
        }
        this.ironManAbilities.triggerSpinningLasers(this.playerRotationY);
        return true;
      }
    }

    if (this.currentPowerSet === 'vision' && this.visionAbilities) {
      this.orientCharacterToAim();
      if (id === 1) return this.visionAbilities.triggerAbility(1);
      if (id === 2) return this.visionAbilities.triggerAbility(2);
      if (id === 3) return this.toggleFlight();
      if (id === 4) {
        const triggered = this.visionAbilities.triggerAbility(4, this.playerPos, this.dummies);
        if (triggered) {
          this.camera.fov = Math.max(30, this.cameraBaseFov - 4);
          this.camera.updateProjectionMatrix();
        }
        return triggered;
      }
      return false;
    }
    return false;
  }

  // ===== Ability Toggle System =====
  public isAbilityActive(id: number): boolean {
    if (this.currentPowerSet === 'agatha' && this.agathaAbilities) {
      if (id === 1) return !!this.agathaAbilities.isDarkDrainActive;
      if (id === 2) return false;
      if (id === 3) return !!this.agathaAbilities.runicWardState?.active;
      if (id === 4) return !!this.agathaAbilities.chokeState?.active;
    }
    if (this.currentPowerSet === 'ironman' && this.ironManAbilities) {
      if (id === 1) return false;
      if (id === 2) return !!this.ironManAbilities.isDualBeamActive;
      if (id === 3) return !!this.ironManAbilities.isChargingHeavyBlast;
      if (id === 4) return !!this.ironManAbilities.isSpinningLasersActive;
    }
    if (this.currentPowerSet === 'vision' && this.visionAbilities) {
      if (id === 1) return this.visionAbilities.isMindBeamActive;
      if (id === 2) return this.visionAbilities.isPhasing;
      if (id === 3) return this.isFlying;
      if (id === 4) return this.visionAbilities.isHeadGripActive;
    }
    return false;
  }

  public isAbilityToggle(id: number): boolean {
    const cfg = this.getAbilityToggleConfig(id);
    return !!cfg.toggle;
  }

  public getAbilityCancelDelay(id: number): number {
    const cfg = this.getAbilityToggleConfig(id);
    return typeof cfg.cancelDelay === 'number' ? cfg.cancelDelay : 0.5;
  }

  public getAbilityCooldownStartMode(id: number): 'activation' | 'cancelOrNaturalEnd' {
    const cfg = this.getAbilityToggleConfig(id);
    return (cfg.cooldownStart as any) || (cfg.toggle ? 'cancelOrNaturalEnd' : 'activation');
  }

  private getAbilityToggleConfig(id: number): { toggle: boolean; cancelDelay: number; cooldownStart: string } {
    if (this.currentPowerSet === 'agatha') {
      const map: Record<number, any> = {
        1: activeAgathaConfig.darkDrain,
        2: activeAgathaConfig.chaosOrb,
        3: activeAgathaConfig.runicWard,
        4: activeAgathaConfig.arcaneChoke,
      };
      const section = map[id];
      if (section) {
        return {
          toggle: section.toggle ?? (id === 1 || id === 3 || id === 4),
          cancelDelay: section.cancelDelay ?? 0.5,
          cooldownStart: section.cooldownStart ?? 'cancelOrNaturalEnd',
        };
      }
    }
    if (this.currentPowerSet === 'ironman') {
      const map: Record<number, any> = {
        1: activeIronManConfig.microMissiles,
        2: activeIronManConfig.dualBeams,
        3: activeIronManConfig.unibeam,
        4: activeIronManConfig.spinningLasers,
      };
      const section = map[id];
      if (section) {
        return {
          toggle: section.toggle ?? (id === 2 || id === 4),
          cancelDelay: section.cancelDelay ?? 0.5,
          cooldownStart: section.cooldownStart ?? 'cancelOrNaturalEnd',
        };
      }
    }
    if (this.currentPowerSet === 'vision') {
      const map: Record<number, any> = {
        1: activeVisionConfig.mindBeam,
        2: activeVisionConfig.phasing,
        3: { toggle: true, cancelDelay: 0.2, cooldownStart: 'activation' },
        4: activeVisionConfig.headGrip,
      };
      const section = map[id];
      if (section) {
        return {
          toggle: section.toggle ?? true,
          cancelDelay: section.cancelDelay ?? 0.4,
          cooldownStart: section.cooldownStart ?? 'activation',
        };
      }
    }
    // fallback static profile
    try {
      const profile = this.combatButtonProfileProvider(this.currentPowerSet);
      const def = profile?.abilities?.find((a: any) => a.id === id);
      if (def) {
        return {
          toggle: def.toggle ?? false,
          cancelDelay: def.cancelDelay ?? 0.5,
          cooldownStart: def.cooldownStart ?? 'activation',
        };
      }
    } catch { /* ignore */ }
    return { toggle: false, cancelDelay: 0.5, cooldownStart: 'activation' };
  }

  public cancelAbility(id: number): boolean {
    if (this.currentPowerSet === 'agatha' && this.agathaAbilities) {
      if (id === 1 && this.agathaAbilities.isDarkDrainActive) {
        this.agathaAbilities.cancelDarkDrain();
        return true;
      }
      if (id === 3 && this.agathaAbilities.runicWardState?.active) {
        this.agathaAbilities.runicWardModule?.cancel?.();
        this.agathaAbilities.runicWardState.active = false;
        return true;
      }
      if (id === 4 && this.agathaAbilities.chokeState?.active) {
        this.agathaAbilities.cancelArcaneChoke();
        return true;
      }
    }
    if (this.currentPowerSet === 'ironman' && this.ironManAbilities) {
      if (id === 2 && this.ironManAbilities.isDualBeamActive) {
        this.ironManAbilities.stopDualBeam();
        return true;
      }
      if (id === 4 && this.ironManAbilities.isSpinningLasersActive) {
        this.ironManAbilities.stopSpinningLasers();
        return true;
      }
    }
    if (this.currentPowerSet === 'vision' && this.visionAbilities) {
      if (id === 1) return this.visionAbilities.cancelAbility(1);
      if (id === 2) return this.visionAbilities.cancelAbility(2);
      if (id === 3 && this.isFlying) {
        this.toggleFlight();
        return true;
      }
      if (id === 4) return this.visionAbilities.cancelAbility(4);
    }
    return false;
  }

  public triggerDash(): boolean {
    if (this.dashCooldownRemaining > 0) return false;

    // Centralized gameplay restriction check
    if (
      gameplayRestrictions.hasRestriction('NoMovement') ||
      gameplayRestrictions.hasRestriction('Stunned') ||
      gameplayRestrictions.hasRestriction('Anchored')
    ) {
      return false;
    }

    if (this.currentPowerSet === 'vision' && this.visionAbilities) {
      if (this.visionAbilities.isHeadGripActive) return false;
      if (!this.visionAbilities.triggerPhasingDash(this.playerPos)) return false;
      const dir = this.visionAbilities.phasingDash.dashDirection;
      this.dashDir.copy(dir);
      this.isDashing = true;
      this.dashTimer = 0;
      this.dashCooldownRemaining = activeVisionConfig.phasingDash.cooldown;
      this.playerRotationY = Math.atan2(-dir.x, -dir.z);
      this.targetRotationY = this.playerRotationY;
      audioSystem.playThrusterDash();
      this.camera.fov = this.cameraBaseFov + 8;
      this.camera.updateProjectionMatrix();
      if (this.settings.cameraShake) this.addCameraShake(0.08);
      return true;
    }

    // Agatha Harkness uses Passo das Sombras for dash / evade
    if (this.currentPowerSet === 'agatha' && this.agathaAbilities) {
      if (typeof (this.agathaAbilities as any).triggerDash === 'function') {
        const customDash = (this.agathaAbilities as any).triggerDash(
          this.playerPos,
          this.getMovementDirection(),
          worldCollision.getMovementBoxes()
        );
        if (customDash) return true;
      }

      if (typeof this.agathaAbilities.triggerShadowStep === 'function') {
        const dir = this.getMovementDirection();
        const success = this.agathaAbilities.triggerShadowStep(
          this.playerPos,
          dir,
          worldCollision.getMovementBoxes(),
          (dest) => {
            this.playerPos.x = dest.x;
            this.playerPos.z = dest.z;
            this.stickman.root.position.x = dest.x;
            this.stickman.root.position.z = dest.z;
          }
        );
        if (success) {
          this.dashCooldownRemaining = this.dashCooldownTotal;
          return true;
        }
        return false;
      }
    }

    // Determine dash direction
    const dir = this.getMovementDirection();

    this.dashDir.copy(dir);
    this.isDashing = true;
    this.dashTimer = 0;
    this.dashCooldownRemaining = this.dashCooldownTotal;

    this.playerRotationY = Math.atan2(-dir.x, -dir.z);

    audioSystem.playThrusterDash();
    this.camera.fov = this.cameraBaseFov + 6;
    this.camera.updateProjectionMatrix();
    if (this.settings.cameraShake) {
      this.addCameraShake(0.06);
    }
    return true;
  }

  public toggleFlight(): boolean {
    // Centralized gameplay restriction check
    if (
      gameplayRestrictions.hasRestriction('NoFlight') ||
      gameplayRestrictions.hasRestriction('Stunned')
    ) {
      audioSystem.playError?.();
      return false;
    }

    this.isFlying = !this.isFlying;
    this.playerVelocityY = 0;
    this.flightObstacle = null;
    if (this.isFlying) {
      // Free flight take-off: start at the standard hover height, or hold the
      // current altitude when already airborne.
      this.targetFlightY = Math.max(
        this.playerPos.y,
        this.flightSystem.getTargetAltitude(true, this.currentPowerSet)
      );
    }
    if (this.currentPowerSet === 'agatha') {
      audioSystem.playArcaneFlight(this.isFlying);
      if (this.agathaAbilities) {
        this.agathaAbilities.isArcaneFlightActive = this.isFlying;
      }
    } else {
      audioSystem.playFlightToggle(this.isFlying);
    }
    return this.isFlying;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keyState[e.code] = true;
    if (e.code === 'Space' || e.code === 'KeyF') {
      this.triggerAttack();
    } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') {
      this.triggerDash();
    } else if (e.code === 'KeyE' || e.code === 'KeyC') {
      this.toggleFlight();
    } else if (e.code === 'Digit1') {
      this.triggerAbility(1);
    } else if (e.code === 'Digit2') {
      this.triggerAbility(2);
    } else if (e.code === 'Digit3') {
      this.triggerAbility(3);
    } else if (e.code === 'Digit4') {
      this.triggerAbility(4);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keyState[e.code] = false;
  };

  private onBlur = (): void => {
    this.keyState = {};
    this.joystick.active = false;
    this.joystick.x = 0;
    this.joystick.y = 0;
  };

  private onResize = (): void => {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  /**
   * Resolves the vertical position of the character against the real scene
   * geometry:
   * - On foot: gravity pulls the character down until it rests exactly on the
   *   highest walkable surface underneath (baseplate, platform or block top),
   *   so it never floats, never sinks and never shakes on contact.
   * - Flying / levitating: altitude is held above the surface below and clamped
   *   so solid geometry can never swallow the character.
   */
  /**
   * Hard ceiling of the active AgathaRunicWard: while the character is under
   * the roof (inside its footprint) the ascent is capped so nothing can pass
   * through the ceiling. Standing or walking on top of the roof is unaffected
   * because those positions are already at/above the roof plane.
   */
  private clampUnderWardCeiling(y: number): number {
    if (this.isPlayerPhasing()) return y;
    const ceiling = worldCollision.wardCeiling;
    if (!ceiling) return y;
    if (this.playerPos.y >= ceiling.min.y) return y;
    const radius = this.playerCollisionRadius;
    const insideFootprint =
      this.playerPos.x > ceiling.min.x - radius &&
      this.playerPos.x < ceiling.max.x + radius &&
      this.playerPos.z > ceiling.min.z - radius &&
      this.playerPos.z < ceiling.max.z + radius;
    if (!insideFootprint) return y;
    const maxY = ceiling.min.y - this.playerBodyHeight;
    return y > maxY ? maxY : y;
  }

  private resolveVerticalState(dt: number, chokeOffset: number): void {
    const radius = this.playerCollisionRadius;
    const stepHeight = this.playerStepHeight;

    // Vertical queries see every solid face, including the ward roof, so the
    // character can land on top of it instead of sinking through. While
    // phasing, only the arena floor remains solid.
    const verticalBoxes = this.isPlayerPhasing() ? [] : worldCollision.getBoxes();

    const support = this.movementSystem.getSupportHeight(
      this.playerPos.x,
      this.playerPos.z,
      this.playerPos.y,
      verticalBoxes,
      radius,
      stepHeight
    );

    if (this.isFlying || chokeOffset > 0.001) {
      let desiredY = 0;
      if (this.isFlying) {
        // Free flight: altitude is steered by the joystick impulse along the
        // look direction (ascend looking up, descend looking down).
        if (Math.abs(this.freeFlightClimb) > 0.001) {
          this.targetFlightY += this.freeFlightClimb * this.flightMaxSpeed * dt;
        }
        desiredY = this.targetFlightY;
        // Never sink into the surface being hovered over.
        const minY = support + FLYING_SURFACE_CLEARANCE;
        if (desiredY < minY) desiredY = minY;
        if (this.targetFlightY < minY) this.targetFlightY = minY;

        // Obstacles taller than the current altitude push the flight path up so
        // the character can clear them instead of being blocked forever. The
        // obstacle is remembered until the character is above it or has moved
        // away, which keeps the climb stable (no up/down oscillation).
        if (this.flightObstacle) {
          const obstacle = this.flightObstacle;
          const margin = radius + 0.05;
          const stillNearObstacle =
            this.playerPos.x > obstacle.min.x - margin &&
            this.playerPos.x < obstacle.max.x + margin &&
            this.playerPos.z > obstacle.min.z - margin &&
            this.playerPos.z < obstacle.max.z + margin;
          const climbedOverObstacle =
            this.playerPos.y >= obstacle.max.y + FLYING_OBSTACLE_CLEARANCE * 0.5;

          if (stillNearObstacle && !climbedOverObstacle) {
            const obstacleY = obstacle.max.y + FLYING_OBSTACLE_CLEARANCE;
            if (desiredY < obstacleY) desiredY = obstacleY;
            if (this.targetFlightY < obstacleY) this.targetFlightY = obstacleY;
          } else {
            this.flightObstacle = null;
          }
        }
      } else {
        this.flightObstacle = null;
      }
      // Levitating abilities use an absolute height above the floor below.
      if (chokeOffset > 0.001) {
        desiredY = Math.max(desiredY, support + chokeOffset);
      }

      // Never rise through the ward roof.
      desiredY = this.clampUnderWardCeiling(desiredY);

      const hoverBob = this.flightSystem.getHoverOffset(
        this.isFlying,
        this.currentPowerSet,
        performance.now()
      );

      this.targetFlightY = desiredY;
      this.currentFlightY = this.flightSystem.dampAltitude(
        this.playerPos.y,
        desiredY + hoverBob,
        this.currentPowerSet,
        dt
      );

      if (this.currentFlightY < support) {
        this.currentFlightY = support;
      }
      this.currentFlightY = this.clampUnderWardCeiling(this.currentFlightY);
      this.playerPos.y = this.currentFlightY;
      this.playerVelocityY = 0;
      this.isGrounded = Math.abs(this.playerPos.y - support) < 0.02;
      return;
    }

    // On foot: integrate gravity and land on the support surface below.
    this.playerVelocityY = Math.max(
      -PLAYER_MAX_FALL_SPEED,
      this.playerVelocityY - PLAYER_GRAVITY * dt
    );

    let nextY = this.playerPos.y + this.playerVelocityY * dt;
    const landingSupport = this.movementSystem.getSupportHeight(
      this.playerPos.x,
      this.playerPos.z,
      Math.max(nextY, this.playerPos.y),
      verticalBoxes,
      radius,
      stepHeight
    );

    if (nextY <= landingSupport) {
      nextY = landingSupport;
      this.playerVelocityY = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = nextY - landingSupport < 0.02;
    }

    this.playerPos.y = nextY;
    this.currentFlightY = nextY;
  }

  private start(): void {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.tick();
  }

  private tick = (): void => {
    if (!this.isRunning) return;
    this.animFrameId = requestAnimationFrame(this.tick);

    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(rawDt, 0.05);

    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number): void {
    audioSystem.setListenerPosition(this.playerPos);
    // Keep the shared collision world in sync with the live structure boxes
    // (test structures + Build Mode placements + Runic Ward registration).
    worldCollision.setStructureBoxes(this.structureBoxes);
    // When in Build Mode, suspend character gameplay movement and update editor camera & dummies
    if (this.isBuildMode) {
      this.currentSpeed = 0;
      this.stickman.root.position.copy(this.playerPos);
      this.stickman.root.rotation.y = this.playerRotationY;
      try {
        this.animController.update(dt * this.animationSpeed, 0);
      } catch (err: unknown) {
        console.warn('[GameScene] animController.update error in Build Mode:', err);
        this.fallbackAnimationController();
      }

      // Keep dummies updated
      for (const dummy of this.dummies) {
        dummy.update(dt);
      }

      // Smooth build camera orbit positioning around focus point
      const cosP = Math.cos(this.buildCamPitch);
      const sinP = Math.sin(this.buildCamPitch);
      const camDir = new THREE.Vector3(
        Math.sin(this.buildCamYaw) * cosP,
        sinP,
        Math.cos(this.buildCamYaw) * cosP
      ).normalize();

      const desiredPos = this.buildFocusPoint.clone().addScaledVector(camDir, this.buildCamDist);
      this.camera.position.lerp(desiredPos, 0.22);
      this.camera.lookAt(this.buildFocusPoint);
      return;
    }

    // Run active runtime scripts from ScriptRuntimeEngine
    scriptRuntimeEngine.updateRunningScripts(this, dt);

    // Update active timed gameplay restrictions
    gameplayRestrictions.update(dt);

    // 0. Update Dash Cooldown
    if (this.dashCooldownRemaining > 0) {
      this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - dt);
    }

    // 0b. Camera FOV Dynamic Recovery from Dash
    if (Math.abs(this.camera.fov - this.cameraBaseFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, this.cameraBaseFov, 6.5, dt);
      this.camera.updateProjectionMatrix();
    }

    // 1. Calculate directional input from joystick or keyboard
    let inputX = 0;
    let inputY = 0;

    if (this.joystick.active) {
      inputX = this.joystick.x;
      inputY = this.joystick.y;
    } else {
      if (this.keyState['KeyW'] || this.keyState['ArrowUp']) inputY -= 1;
      if (this.keyState['KeyS'] || this.keyState['ArrowDown']) inputY += 1;
      if (this.keyState['KeyA'] || this.keyState['ArrowLeft']) inputX -= 1;
      if (this.keyState['KeyD'] || this.keyState['ArrowRight']) inputX += 1;
    }

    // Centralized gameplay restriction check for movement
    const isRestrictedMovement =
      gameplayRestrictions.hasRestriction('NoMovement') ||
      gameplayRestrictions.hasRestriction('Stunned') ||
      gameplayRestrictions.hasRestriction('Anchored');

    if (isRestrictedMovement) {
      inputX = 0;
      inputY = 0;
    }

    const inputLen = Math.hypot(inputX, inputY);
    let normX = 0;
    let normY = 0;
    let normalizedMagnitude = 0;

    if (inputLen > 0.05 && !isRestrictedMovement) {
      normalizedMagnitude = Math.min(1.0, inputLen);
      normX = inputX / inputLen;
      normY = inputY / inputLen;
    }

    // 2. Camera-relative movement direction
    const camForward = new THREE.Vector3();
    this.camera.getWorldDirection(camForward);

    // Free flight: the joystick impulse follows the user's view direction,
    // including the camera pitch (looking up ascends, looking down descends).
    // On foot, movement remains horizontal.
    const lookPitch = camForward.y;
    const moveForward = new THREE.Vector3(
      camForward.x,
      this.isFlying ? lookPitch : 0,
      camForward.z
    );
    if (moveForward.lengthSq() > 1e-6) {
      moveForward.normalize();
    } else {
      moveForward.set(camForward.x, 0, camForward.z).normalize();
    }

    const camRight = new THREE.Vector3();
    camRight.crossVectors(moveForward, new THREE.Vector3(0, 1, 0));
    if (camRight.lengthSq() > 1e-6) {
      camRight.normalize();
    } else {
      camRight.set(-moveForward.z, 0, moveForward.x).normalize();
    }

    const moveDir = new THREE.Vector3();
    const effectiveMaxSpeed = this.movementSystem.getEffectiveSpeed(
      this.isFlying,
      this.groundMaxSpeed,
      this.flightMaxSpeed
    );

    if (normalizedMagnitude > 0) {
      moveDir.addScaledVector(camRight, normX);
      moveDir.addScaledVector(moveForward, -normY);
      moveDir.normalize();
      this.freeFlightClimb = this.isFlying ? moveDir.y : 0;

      const targetSpeed = normalizedMagnitude * effectiveMaxSpeed;
      this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, targetSpeed, 28.0, dt);

      // If spinning lasers are active, do not let movement direction override playerRotationY so spin continues uninterrupted
      if (!this.ironManAbilities || !this.ironManAbilities.isSpinningLasersActive) {
        this.targetRotationY = Math.atan2(-moveDir.x, -moveDir.z);
        let diff = this.targetRotationY - this.playerRotationY;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.playerRotationY += diff * Math.min(1.0, dt * 26.0);

        // Banking roll when turning into direction
        this.flightBankRoll = this.flightSystem.dampBank(
          this.flightBankRoll,
          diff,
          this.currentPowerSet,
          dt
        );
      }
    } else {
      this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, 0, 30.0, dt);
      if (this.currentSpeed < 0.005) {
        this.currentSpeed = 0;
      }
      this.freeFlightClimb = 0;
      this.flightBankRoll = this.flightSystem.dampLevelBank(
        this.flightBankRoll,
        this.currentPowerSet,
        dt
      );
    }

    // 3. Move player position horizontally with solid structure collision check
    const bodyProfile = {
      radius: this.playerCollisionRadius,
      height: this.playerBodyHeight,
      stepHeight: this.playerStepHeight,
    };

    let blockedBox: THREE.Box3 | null = null;
    const movementBoxes = this.isPlayerPhasing() ? [] : worldCollision.getMovementBoxes();
    if (this.currentPowerSet === 'vision' && this.visionAbilities?.isPhasingDashActive) {
      const dashStep = this.visionAbilities.advancePhasingDash(dt, this.playerPos);
      const dir = this.visionAbilities.phasingDash.dashDirection;
      const step = this.movementSystem.moveWithCollision(
        this.playerPos,
        dir,
        dashStep.distanceDelta,
        [],
        this.playerCollisionRadius,
        bodyProfile
      );
      this.playerPos.x = step.position.x;
      this.playerPos.z = step.position.z;
      const limit = Math.max(1, activeVisionConfig.phasingDash.arenaLimit);
      this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -limit, limit);
      this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, -limit, limit);
      blockedBox = null;

      if (dashStep.done) {
        this.finishVisionPhasingDash();
      }
    } else if (this.isDashing) {
      this.dashTimer += dt;
      const step = this.movementSystem.moveWithCollision(
        this.playerPos,
        this.dashDir,
        this.dashSpeed * dt,
        movementBoxes,
        this.playerCollisionRadius,
        bodyProfile
      );
      this.playerPos.x = step.position.x;
      this.playerPos.z = step.position.z;
      blockedBox = step.blockedBox;

      if (this.dashTimer >= this.dashDuration) {
        this.isDashing = false;
      }
    } else if (this.currentSpeed > 0) {
      const facingDir = this.movementSystem.facingDirection(this.playerRotationY);
      const step = this.movementSystem.moveWithCollision(
        this.playerPos,
        facingDir,
        this.currentSpeed * dt,
        movementBoxes,
        this.playerCollisionRadius,
        bodyProfile
      );
      this.playerPos.x = step.position.x;
      this.playerPos.z = step.position.z;
      blockedBox = step.blockedBox;
    }

    // While flying, remember the tallest obstacle that blocked horizontal
    // motion so the vertical resolution can climb over it.
    if (this.isFlying && blockedBox) {
      this.flightObstacle = blockedBox;
    } else if (!this.isFlying) {
      this.flightObstacle = null;
    }

    // 3b. Vertical resolution: gravity + walkable surfaces on foot, altitude
    // hold above the terrain while flying or levitating.
    const chokeOffset = (this.currentPowerSet === 'agatha' && this.agathaAbilities)
      ? this.agathaAbilities.chokeElevationOffset
      : 0;
    this.resolveVerticalState(dt, chokeOffset);

    // Interactive Jump Pad bounce detection
    const padHit = this.buildModeManager.checkJumpPads(this.playerPos);
    if (padHit && !this.isDashing) {
      this.isFlying = true;
      const bounce = this.clampUnderWardCeiling(
        Math.min(16, this.playerPos.y + padHit.bouncePower * 0.38)
      );
      this.playerPos.y = bounce;
      this.currentFlightY = bounce;
      this.targetFlightY = bounce;
      this.playerVelocityY = 0;
      audioSystem.playFlightToggle(true);
      this.projectileSystem.emitImpactParticles(this.playerPos.clone().add(new THREE.Vector3(0, 0.2, 0)), 22, 0x00f0ff);
      if (this.settings.cameraShake) {
        this.addCameraShake(0.06);
      }
    }

    this.stickman.root.position.copy(this.playerPos);
    this.stickman.root.rotation.y = this.playerRotationY;

    // Repulsor & Thruster Jet Flares (Disabled for Agatha Harkness who uses dark magic aura)
    if (this.currentPowerSet === 'agatha') {
      this.stickman.thrusters.leftFoot.setIntensity(0);
      this.stickman.thrusters.rightFoot.setIntensity(0);
      this.stickman.thrusters.leftHand.setIntensity(0);
      this.stickman.thrusters.rightHand.setIntensity(0);
    } else {
      const customCol = this.currentPowerSet === 'vision'
        ? '#ffd54a'
        : this.ironManAbilities?.customPowerColor;
      const thrusters = this.flightSystem.getThrusterLevels({
        powerSet: this.currentPowerSet,
        isFlying: this.isFlying,
        isDashing: this.isDashing,
        speed: this.currentSpeed,
        maxSpeed: this.flightMaxSpeed,
        color: customCol,
      });

      this.stickman.thrusters.leftFoot.setIntensity(thrusters.foot, customCol);
      this.stickman.thrusters.rightFoot.setIntensity(thrusters.foot, customCol);
      this.stickman.thrusters.leftHand.setIntensity(thrusters.hand, customCol);
      this.stickman.thrusters.rightHand.setIntensity(thrusters.hand, customCol);
    }

    // Follow lighting
    this.dirLight.position.set(
      this.playerPos.x + 16,
      this.playerPos.y + 26,
      this.playerPos.z + 14
    );
    this.dirLight.target.position.copy(this.playerPos);
    this.dirLight.target.updateMatrixWorld();

    // 4. Update animation controller
    this.animController.isFlying = this.isFlying;
    this.animController.isDashing = this.isDashing;
    this.animController.isPhasingDash = !!this.visionAbilities?.isPhasingDashActive;
    this.animController.flightRoll = this.flightBankRoll;
    try {
      this.animController.update(dt * this.animationSpeed, this.currentSpeed / effectiveMaxSpeed);
    } catch (err: unknown) {
      console.warn('[GameScene] animController.update error in Gameplay:', err);
      this.fallbackAnimationController();
    }

    // 5. Update Target Dummies
    for (const dummy of this.dummies) {
      dummy.update(dt);
    }

    // 6. Update Projectiles & Particles
    this.projectileSystem.update(dt, this.dummies);

    // 6b. Update Iron Man Abilities (Missiles, Dual Beam, Beam Clash, Spinning Lasers)
    if (this.ironManAbilities) {
      this.animController.dualBeamActive = this.ironManAbilities.isDualBeamActive;
      this.animController.dualBeamPitch = this.camPitch;
      this.animController.spinningLasersActive = this.ironManAbilities.isSpinningLasersActive;

      // When dual beam is active, continuously orient character naturally toward aim
      if (this.ironManAbilities.isDualBeamActive) {
        this.orientCharacterToAim();
      }

      this.ironManAbilities.update(dt, this.dummies, this.playerRotationY, (newRy) => {
        this.playerRotationY = newRy;
      });
    }

    // 6c. Update Agatha Harkness Abilities
    if (this.agathaAbilities) {
      try {
        if (typeof this.agathaAbilities.update === 'function') {
          this.agathaAbilities.update(dt, this.playerPos, this.dummies);
        }
        if (this.animController) {
          this.animController.darkDrainActive = !!this.agathaAbilities.isDarkDrainActive;
          this.animController.arcaneChokeActive = !!this.agathaAbilities.chokeState?.active;
        }

        // When choking or channeling dark drain, lock gaze naturally on targets
        if (
          this.currentPowerSet === 'agatha' &&
          (this.agathaAbilities.chokeState?.active || this.agathaAbilities.isDarkDrainActive)
        ) {
          this.orientCharacterToAim();
        }
      } catch (err) {
        console.warn('Error in AgathaAbilities update loop:', err);
      }
    }

    // 6c-2. Update Vision (solar bolts, Mind Stone beam, phasing, flight aura)
    if (this.visionAbilities) {
      this.animController.mindBeamActive = this.visionAbilities.isMindBeamActive;
      this.animController.mindBeamPitch = this.camPitch;
      this.animController.phasingActive = this.visionAbilities.isPhasing;
      this.animController.headGripActive = this.visionAbilities.isHeadGripActive;
      if (this.visionAbilities.isMindBeamActive) {
        this.orientCharacterToAim();
      }
      this.visionAbilities.update(
        dt,
        this.dummies,
        this.isFlying && this.currentPowerSet === 'vision'
      );
      if (this.currentPowerSet === 'vision' && this.visionAbilities.isHeadGripActive) {
        this.playerRotationY = this.stickman.root.rotation.y;
      }
    }

    // 6d. Handle Build Mode Camera (Free-Fly navigation & Orbit around focus point)
    if (this.isBuildMode) {
      this.updateFreeFlyCamera(dt);

      const cosPitch = Math.cos(this.buildCamPitch);
      const sinPitch = Math.sin(this.buildCamPitch);
      const theta = this.buildCamYaw;

      const camOffset = new THREE.Vector3(
        -Math.sin(theta) * cosPitch * this.buildCamDist,
        sinPitch * this.buildCamDist,
        -Math.cos(theta) * cosPitch * this.buildCamDist
      );

      const targetCamPos = this.buildFocusPoint.clone().add(camOffset);
      this.currentCameraPos.lerp(targetCamPos, Math.min(1.0, dt * 16.0));
      this.camera.position.copy(this.currentCameraPos);
      this.camera.lookAt(this.buildFocusPoint);
      return;
    }

    // 7. Marvel Rivals-style over-the-shoulder follow camera
    const theta = this.camYaw;
    const rightHoriz = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));

    // Over-the-shoulder offset: camera shifted to the right so character is to the left of the central reticle
    const shoulderSideOffset = this.cameraShoulderOffset;
    const shoulderHeightOffset = this.cameraHeightOffset;
    const camDist = this.cameraDistance;

    const cosPitch = Math.cos(this.camPitch);
    const sinPitch = Math.sin(this.camPitch);
    const viewDir = new THREE.Vector3(
      -Math.sin(theta) * cosPitch,
      sinPitch,
      -Math.cos(theta) * cosPitch
    ).normalize();

    // The shoulder anchor on the character
    const shoulderAnchor = new THREE.Vector3(
      this.playerPos.x,
      this.playerPos.y + shoulderHeightOffset,
      this.playerPos.z
    ).addScaledVector(rightHoriz, shoulderSideOffset);

    // Camera sits behind the shoulder anchor along viewDir
    const desiredCameraPos = shoulderAnchor.clone().addScaledVector(viewDir, -camDist);
    // Camera looks forward along viewDir
    const desiredTarget = shoulderAnchor.clone().addScaledVector(viewDir, 25.0);

    const camSmooth = this.cameraSmoothness;
    this.currentCameraPos.x = THREE.MathUtils.damp(this.currentCameraPos.x, desiredCameraPos.x, camSmooth, dt);
    this.currentCameraPos.y = THREE.MathUtils.damp(this.currentCameraPos.y, desiredCameraPos.y, camSmooth, dt);
    this.currentCameraPos.z = THREE.MathUtils.damp(this.currentCameraPos.z, desiredCameraPos.z, camSmooth, dt);

    if (this.currentCameraPos.y < 0.55) {
      this.currentCameraPos.y = 0.55;
    }

    this.cameraTarget.x = THREE.MathUtils.damp(this.cameraTarget.x, desiredTarget.x, 12.0, dt);
    this.cameraTarget.y = THREE.MathUtils.damp(this.cameraTarget.y, desiredTarget.y, 12.0, dt);
    this.cameraTarget.z = THREE.MathUtils.damp(this.cameraTarget.z, desiredTarget.z, 12.0, dt);

    // Apply Camera Shake (ONLY when enabled, restrained intensity)
    let shakeOffset = new THREE.Vector3();
    if (this.settings.cameraShake && this.shakeIntensity > 0.001) {
      const shake = this.shakeIntensity * this.cameraShakeScale;
      shakeOffset.set(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake
      );
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, this.shakeDecay, dt);
    }

    this.camera.position.copy(this.currentCameraPos).add(shakeOffset);
    this.camera.lookAt(this.cameraTarget);

    // 8. Update Reticle Raycasting and Aim Assist Detection from exact screen center
    this.updateAimAndAimAssist();
  }

  private updateAimAndAimAssist(): void {
    // Reticle is precisely at the center of the screen (0, 0 in NDC)
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const ray = this.raycaster.ray;

    // Determine default 3D aim point at virtual plane or ground
    const groundHit = new THREE.Vector3();
    if (ray.intersectPlane(this.groundPlane, groundHit)) {
      this.currentAimPoint.copy(groundHit);
    } else {
      this.currentAimPoint.copy(ray.origin).addScaledVector(ray.direction, 32);
    }

    // Aim Assist target detection
    if (!this.settings.aimAssist) {
      this.activeTarget = null;
      return;
    }

    let bestTarget: TargetDummy | null = null;
    let minAngle = 0.28; // ~16 degrees tight angular tolerance to prevent pulling toward distant invalid targets
    const maxAimDistance = 30; // max distance from player

    for (const dummy of this.dummies) {
      if (dummy.isDead) continue;
      const dummyCenter = dummy.getCenter();
      const distFromPlayer = dummyCenter.distanceTo(this.playerPos);

      if (distFromPlayer > maxAimDistance) continue;

      // Ray direction vs direction to dummy from camera
      const toDummy = dummyCenter.clone().sub(ray.origin).normalize();
      const dot = ray.direction.dot(toDummy);
      const angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));

      if (angle < minAngle) {
        minAngle = angle;
        bestTarget = dummy;
      }
    }

    this.activeTarget = bestTarget;
    if (this.activeTarget) {
      this.currentAimPoint.copy(this.activeTarget.getCenter());
    }
  }

  public getActiveTargetBracket(): TargetBracketInfo {
    if (!this.settings.aimAssist || !this.activeTarget || this.activeTarget.isDead) {
      return { visible: false, x: 0, y: 0, size: 0 };
    }

    const center = this.activeTarget.getCenter();
    const proj = center.clone().project(this.camera);

    // Check if behind camera
    if (proj.z > 1.0) {
      return { visible: false, x: 0, y: 0, size: 0 };
    }

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const screenX = ((proj.x + 1) / 2) * width;
    const screenY = ((-proj.y + 1) / 2) * height;

    // Scale bracket size inversely with distance
    const dist = center.distanceTo(this.camera.position);
    const size = THREE.MathUtils.clamp(320 / Math.max(1, dist), 42, 110);

    return {
      visible: true,
      x: screenX,
      y: screenY,
      size,
    };
  }

  public getProjectedDamageNumbers(): ProjectedDamageNumber[] {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    return this.projectileSystem.damageNumbers.map((dn) => {
      const proj = dn.worldPos.clone().project(this.camera);
      const screenX = ((proj.x + 1) / 2) * width;
      const screenY = ((-proj.y + 1) / 2) * height;

      const progress = dn.age / dn.maxAge;
      const opacity = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1.0;
      const scale = progress < 0.2 ? 0.7 + (progress / 0.2) * 0.4 : 1.1 - progress * 0.1;

      return {
        id: dn.id,
        value: dn.value,
        x: screenX,
        y: screenY,
        opacity,
        scale,
      };
    });
  }

  public dealDamage(
    dummy: TargetDummy,
    damage: number,
    hitPosition: THREE.Vector3,
    knockback?: THREE.Vector3
  ): number {
    const result = this.dealDamageSystem.deal(dummy, roundDamage(damage), hitPosition, knockback);
    return roundDamage(result.actualDamage);
  }

  public updateDealDamageSystem(NewClass: any): void {
    this.dealDamageSystem = new NewClass(this.projectileSystem, () => this.triggerHitConfirm());
  }

  public setCustomPowerColor(colorHex: string | null): void {
    if (this.ironManAbilities) {
      this.ironManAbilities.customPowerColor = colorHex;
    }
  }

  public setBuildMode(enabled: boolean): void {
    if (this.isBuildMode === enabled) return;
    this.isBuildMode = enabled;

    if (enabled) {
      // Suspend gameplay input
      this.joystick.active = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
      this.keyState = {};
      this.currentSpeed = 0;
      this.isDashing = false;
      if (this.ironManAbilities?.isDualBeamActive) {
        this.ironManAbilities.stopDualBeam();
      }
      if (this.agathaAbilities?.isDarkDrainActive) {
        this.agathaAbilities.isDarkDrainActive = false;
      }

      // Initialize build camera around player or selected object
      const selectedData = this.buildModeManager.getSelectedData();
      if (selectedData) {
        this.buildFocusPoint.set(selectedData.position[0], selectedData.position[1], selectedData.position[2]);
      } else {
        this.buildFocusPoint.copy(this.playerPos).add(new THREE.Vector3(0, 1.5, 0));
      }
      this.buildCamYaw = this.camYaw;
      this.buildCamPitch = 0.45;
      this.buildCamDist = 12.0;

      const cosPitch = Math.cos(this.buildCamPitch);
      const sinPitch = Math.sin(this.buildCamPitch);
      const theta = this.buildCamYaw;
      const camOffset = new THREE.Vector3(
        -Math.sin(theta) * cosPitch * this.buildCamDist,
        sinPitch * this.buildCamDist,
        -Math.cos(theta) * cosPitch * this.buildCamDist
      );
      this.currentCameraPos.copy(this.buildFocusPoint).add(camOffset);
      this.camera.position.copy(this.currentCameraPos);
      this.camera.lookAt(this.buildFocusPoint);

      this.buildModeManager.updateSelectionBox();
    } else {
      // Restoring Play Mode: hide selection box, smooth camera return
      this.buildModeManager.selectObject(null);
      this.currentCameraPos.copy(this.camera.position);
      this.camYaw = this.buildCamYaw;
    }
  }

  public addBuildCameraOrbit(deltaX: number, deltaY: number): void {
    const sens = 0.0055;
    this.buildCamYaw += deltaX * sens;
    this.buildCamPitch = THREE.MathUtils.clamp(this.buildCamPitch - deltaY * sens, 0.05, 1.45);
  }

  public addBuildCameraPan(deltaX: number, deltaY: number): void {
    const camForward = new THREE.Vector3();
    this.camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();

    const camRight = new THREE.Vector3();
    camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

    const panSpeed = this.buildCamDist * 0.0022;
    this.buildFocusPoint.addScaledVector(camRight, -deltaX * panSpeed);
    this.buildFocusPoint.addScaledVector(camForward, deltaY * panSpeed);
  }

  public addBuildCameraZoom(deltaZoom: number): void {
    this.buildCamDist = THREE.MathUtils.clamp(this.buildCamDist + deltaZoom, 3.0, 60.0);
  }

  public focusCameraOnObject(objId: string): void {
    const selected = this.buildModeManager.getSelectedData();
    if (selected) {
      this.buildFocusPoint.set(selected.position[0], selected.position[1], selected.position[2]);
    }
  }

  public applyLiveConfig(cfg: LiveGameConfig): void {
    this.groundMaxSpeed = cfg.groundMaxSpeed;
    this.flightMaxSpeed = cfg.flightMaxSpeed;
    this.dashSpeed = cfg.dashSpeed;
    this.dashCooldownTotal = cfg.dashCooldown;
    this.dashDuration = cfg.dashDuration;
    this.playerCollisionRadius = cfg.playerCollisionRadius;

    this.cameraBaseFov = cfg.cameraFov;
    this.cameraDistance = cfg.cameraDistance;
    this.cameraShoulderOffset = cfg.cameraShoulderOffset;
    this.cameraHeightOffset = cfg.cameraHeightOffset;
    this.cameraSmoothness = cfg.cameraSmoothness;
    this.cameraShakeScale = cfg.cameraShakeScale;
    this.animationSpeed = cfg.animationSpeed;

    if (!this.isDashing && Math.abs(this.camera.fov - this.cameraBaseFov) > 0.01) {
      this.camera.fov = this.cameraBaseFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.dirLight) {
      this.dirLight.intensity = cfg.sunLightIntensity;
    }

    if (this.scene) {
      (this.scene.background as THREE.Color).set(cfg.skyColor);
      if (this.scene.fog) {
        (this.scene.fog as THREE.Fog).color.set(cfg.skyColor);
        (this.scene.fog as THREE.Fog).near = cfg.fogNear;
        (this.scene.fog as THREE.Fog).far = cfg.fogFar;
      }
    }

    if (this.baseplateMesh && this.baseplateMesh.material instanceof THREE.MeshStandardMaterial) {
      this.baseplateMesh.material.color.set(cfg.baseplateColor);
    }
  }

  public getDummies(): TargetDummy[] {
    return this.dummies;
  }

  private updateFreeFlyCamera(dt: number): void {
    if (!this.freeFlyInput.active && this.freeFlyVertical === 0) return;
    const speed = 18.0;
    const forward = new THREE.Vector3(-Math.sin(this.buildCamYaw), 0, -Math.cos(this.buildCamYaw)).normalize();
    const right = new THREE.Vector3(Math.cos(this.buildCamYaw), 0, -Math.sin(this.buildCamYaw)).normalize();

    const move = new THREE.Vector3();
    if (this.freeFlyInput.active) {
      move.addScaledVector(right, this.freeFlyInput.x * speed * dt);
      move.addScaledVector(forward, -this.freeFlyInput.y * speed * dt);
    }
    if (this.freeFlyVertical !== 0) {
      move.y += this.freeFlyVertical * 14.0 * dt;
    }
    this.buildFocusPoint.add(move);
    this.buildFocusPoint.y = THREE.MathUtils.clamp(this.buildFocusPoint.y, -4.0, 100.0);
  }

  private createVisionAbilities(): VisionAbilities {
    const getAim = () => {
      if (this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead) {
        return { pos: this.activeTarget.getCenter(), target: this.activeTarget };
      }
      return { pos: this.currentAimPoint.clone(), target: null };
    };

    return new VisionAbilities(
      this.scene,
      this.stickman,
      getAim,
      (dummy, dmg, hitPos, kb) => {
        this.dealDamage(dummy, dmg, hitPos, kb);
      },
      (position, color) => {
        this.projectileSystem.emitImpactParticles(position, 14, color);
      },
      (amt) => {
        if (this.settings.cameraShake) {
          this.addCameraShake(amt);
        }
      },
      (active) => {
        if (!active) this.resolveVisionPhasingExit();
      }
    );
  }

  private finishVisionPhasingDash(): void {
    if (!this.visionAbilities) return;
    this.visionAbilities.finishPhasingDash();
    this.isDashing = false;
    this.dashTimer = 0;
    this.animController.isPhasingDash = false;
    if (!this.visionAbilities.isPhasing) {
      this.resolveVisionPhasingExit();
    }
  }

  private resolveVisionPhasingExit(): void {
    if (!this.visionAbilities || this.visionAbilities.isPhasing) return;
    const resolved = this.movementSystem.resolvePenetration(
      this.playerPos.x,
      this.playerPos.z,
      this.playerPos.y,
      worldCollision.getMovementBoxes(),
      this.playerCollisionRadius,
      this.playerStepHeight,
      this.playerBodyHeight
    );
    if (resolved.x !== this.playerPos.x || resolved.z !== this.playerPos.z) {
      this.playerPos.x = resolved.x;
      this.playerPos.z = resolved.z;
      this.stickman.root.position.x = resolved.x;
      this.stickman.root.position.z = resolved.z;
    }
  }

  // ==========================================
  // DYNAMIC SCRIPT RUNTIME HOT-SWAPPING
  // ==========================================
  public updateIronManAbilities(NewClass: any): void {
    if (this.ironManAbilities) {
      this.ironManAbilities.dispose();
    }
    this.ironManAbilities = new NewClass(
      this.scene,
      this.stickman,
      () => {
        if (this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead) {
          return { pos: this.activeTarget.getCenter(), target: this.activeTarget };
        }
        return { pos: this.currentAimPoint.clone(), target: null };
      },
      (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, kb?: THREE.Vector3) => {
        this.dealDamage(dummy, dmg, hitPos, kb);
      },
      (amt: number) => {
        if (this.settings.cameraShake) {
          this.addCameraShake(amt);
        }
      }
    );
    this.ironManAbilities.onRepulsorFired = (hand: 'left' | 'right', aimPitch: number) => {
      this.animController.triggerRepulsor(hand, aimPitch);
    };
  }

  /**
   * Installs (or clears) one of Iron Man's independent ability modules.
   * The controller falls back to its built-in implementation when `null` is
   * passed, which is how "Restaurar original" returns to factory behaviour.
   */
  public installIronManAbilityModule(
    kind: 'repulsor' | 'micro-missiles' | 'unibeam' | 'dual-beams' | 'spinning-lasers',
    ModuleClass: any | null
  ): void {
    if (!this.ironManAbilities) {
      throw new Error('Controlador do Homem de Ferro ainda não inicializado.');
    }

    const getAim = () => {
      if (this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead) {
        return { pos: this.activeTarget.getCenter(), target: this.activeTarget };
      }
      return { pos: this.currentAimPoint.clone(), target: null };
    };

    const onDamage = (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, kb?: THREE.Vector3) => {
      this.dealDamage(dummy, dmg, hitPos, kb);
    };

    const onShake = (amt: number) => {
      if (this.settings.cameraShake) {
        this.addCameraShake(amt);
      }
    };

    const onExplosion = (position: THREE.Vector3, radius: number, color?: number) => {
      this.ironManAbilities.createExplosion(position, radius, color);
    };

    if (!ModuleClass) {
      if (kind === 'repulsor') this.ironManAbilities.setRepulsorModule(null);
      if (kind === 'micro-missiles') this.ironManAbilities.setMicroMissilesModule(null);
      if (kind === 'unibeam') this.ironManAbilities.setUnibeamModule(null);
      if (kind === 'dual-beams') this.ironManAbilities.setDualBeamsModule(null);
      if (kind === 'spinning-lasers') this.ironManAbilities.setSpinningLasersModule(null);
      return;
    }

    if (kind === 'repulsor') {
      const module = new ModuleClass(this.scene, this.stickman, getAim, onDamage, onShake);
      this.ironManAbilities.setRepulsorModule(module);
    } else if (kind === 'micro-missiles') {
      const module = new ModuleClass(this.scene, this.stickman, onDamage, onShake);
      this.ironManAbilities.setMicroMissilesModule(module);
    } else if (kind === 'unibeam') {
      const module = new ModuleClass(this.scene, this.stickman, onDamage, onShake);
      this.ironManAbilities.setUnibeamModule(module);
    } else if (kind === 'dual-beams') {
      const module = new ModuleClass(
        this.scene,
        this.stickman,
        getAim,
        onDamage,
        onShake,
        onExplosion,
        this.ironManAbilities.clashState
      );
      this.ironManAbilities.setDualBeamsModule(module);
    } else if (kind === 'spinning-lasers') {
      const module = new ModuleClass(
        this.scene,
        this.stickman,
        onDamage,
        onShake,
        (rotation: number) => {
          this.playerRotationY = rotation;
        },
        onExplosion
      );
      this.ironManAbilities.setSpinningLasersModule(module);
    }
  }

  /**
   * Replaces the centralized restrictions singleton by grafting the modified
   * prototype methods onto it. Active restrictions are preserved.
   */
  public installGameplayRestrictionsClass(NewClass: any): void {
    if (typeof NewClass !== 'function') {
      throw new Error('Classe de restrições inválida.');
    }
    const proto = NewClass.prototype;
    if (!proto) throw new Error('A classe de restrições não possui protótipo.');
    const names = Object.getOwnPropertyNames(proto).filter(
      (name) => name !== 'constructor' && typeof proto[name] === 'function'
    );
    if (names.length === 0) {
      throw new Error('A classe de restrições não expõe métodos utilizáveis.');
    }
    for (const name of names) {
      (gameplayRestrictions as any)[name] = proto[name];
    }
  }

  /** Installs an edited FlightSystem class. Throws before committing if invalid. */
  public installFlightSystem(NewClass: any): void {
    if (typeof NewClass !== 'function') {
      throw new Error('Classe de FlightSystem inválida.');
    }
    const candidate = new NewClass();
    const required = ['getProfile', 'getTargetAltitude', 'getHoverOffset', 'dampAltitude', 'dampBank', 'dampLevelBank', 'getThrusterLevels', 'getBankLimit'];
    for (const method of required) {
      if (typeof candidate[method] !== 'function') {
        throw new Error(`FlightSystem editado não implementa "${method}".`);
      }
    }
    // Smoke-test the contract with the active power set before committing.
    candidate.getProfile(this.currentPowerSet);
    this.flightSystem = candidate;
  }

  /** Installs an edited MovementSystem class. */
  public installMovementSystem(NewClass: any): void {
    if (typeof NewClass !== 'function') {
      throw new Error('Classe de MovementSystem inválida.');
    }
    const candidate = new NewClass();
    const required = ['getEffectiveSpeed', 'getSupportHeight', 'moveWithCollision', 'facingDirection'];
    for (const method of required) {
      if (typeof candidate[method] !== 'function') {
        throw new Error(`MovementSystem editado não implementa "${method}".`);
      }
    }
    candidate.facingDirection(this.playerRotationY);
    this.movementSystem = candidate;
  }

  /** Installs an edited CombatButton profile provider used by gameplay logic. */
  public installCombatButtonProfileProvider(provider: any): void {
    if (typeof provider !== 'function') {
      throw new Error('getCombatButtonProfile editado não é uma função.');
    }
    provider(this.currentPowerSet);
    this.combatButtonProfileProvider = provider;
  }

  /** Installs an edited BuildModeManager class, preserving editor callbacks/state. */
  public installBuildModeManager(NewClass: any): void {
    if (typeof NewClass !== 'function') {
      throw new Error('Classe de BuildModeManager inválida.');
    }
    const next = new NewClass(this.scene, this.camera, this.renderer);
    const required = ['registerDefaultSunLight', 'registerDefaultBaseplate', 'registerDefaultStickman', 'exportSceneJson'];
    for (const method of required) {
      if (typeof next[method] !== 'function') {
        throw new Error(`BuildModeManager editado não implementa "${method}".`);
      }
    }
    next.onCollisionBoxesChanged = (boxes: THREE.Box3[]) => {
      this.structureBoxes = boxes;
    };
    next.onDummyCreated = (dummy: TargetDummy) => {
      this.dummies.push(dummy);
    };
    next.onDummyRemoved = (dummy: TargetDummy) => {
      const idx = this.dummies.indexOf(dummy);
      if (idx !== -1) this.dummies.splice(idx, 1);
    };
    next.registerDefaultSunLight(this.dirLight);
    next.registerDefaultBaseplate(this.baseplateMesh);
    next.registerDefaultStickman(this.stickman.root);

    // Preserve objects, history, selection and snapping from the running editor
    // instead of reloading storage (which would duplicate the saved scene).
    const previous: any = this.buildModeManager;
    const nextAny: any = next;
    if (previous) {
      nextAny.objectsMap = previous.objectsMap;
      nextAny.undoStack = previous.undoStack;
      nextAny.redoStack = previous.redoStack;
      nextAny.selectedId = previous.selectedId;
      nextAny.gridSnap = previous.gridSnap;
      nextAny.rotateSnap = previous.rotateSnap;
      nextAny.showCollisionHelpers = previous.showCollisionHelpers;
      nextAny.isFreeFlyMode = previous.isFreeFlyMode;
      nextAny.collisionHelpers = previous.collisionHelpers;
      // Detach shared maps so dispose() does not clear the transferred state.
      previous.objectsMap = new Map();
      previous.collisionHelpers = new Map();
      previous.listeners?.clear?.();
    }
    this.buildModeManager = next;
    try {
      previous?.dispose?.();
    } catch {
      // Old editor state is disposable.
    }
  }

  public updateAgathaAbilities(NewClass: any, options?: { selectCharacter?: boolean }): void {
    if (this.agathaAbilities) {
      try {
        this.agathaAbilities.dispose();
      } catch (err) {
        console.warn('Error disposing previous agathaAbilities instance:', err);
      }
    }

    const getAim = () => {
      if (this.settings.aimAssist && this.activeTarget && !this.activeTarget.isDead) {
        return { pos: this.activeTarget.getCenter(), target: this.activeTarget };
      }
      return { pos: this.currentAimPoint.clone(), target: null };
    };

    const onDamage = (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, kb?: THREE.Vector3) => {
      this.dealDamage(dummy, dmg, hitPos, kb);
    };

    const onShake = (amt: number) => {
      if (this.settings.cameraShake) {
        this.addCameraShake(amt);
      }
    };

    try {
      if (typeof NewClass === 'function') {
        try {
          this.agathaAbilities = new NewClass(this.scene, this.stickman, getAim, onDamage, onShake);
        } catch {
          this.agathaAbilities = (NewClass as any)(this.scene, this.stickman, getAim, onDamage, onShake);
        }
      } else if (typeof NewClass === 'object' && NewClass !== null) {
        this.agathaAbilities = NewClass;
      }
    } catch (err) {
      console.error('Error instantiating updated AgathaAbilities:', err);
      this.agathaAbilities = new AgathaAbilities(this.scene, this.stickman, getAim, (dummy, dmg, hitPos, kb) => {
        let finalDmg = dmg;
        if (this.agathaAbilities?.runicWardState?.active) {
          finalDmg = dmg * 1.15;
        }
        this.dealDamage(dummy, finalDmg, hitPos, kb);
      }, onShake);
    }

    if (this.agathaAbilities) {
      this.agathaAbilities.onArcaneCast = (hand: 'left' | 'right', aimPitch: number) => {
        this.animController.triggerRepulsor(hand, aimPitch);
      };
    }

    // Automatically align power set to Agatha so play test immediately executes
    // Agatha. Structural rebuilds pass selectCharacter:false to keep the
    // currently active hero untouched.
    if (options?.selectCharacter !== false) {
      this.currentPowerSet = 'agatha';
      this.animController.isAgatha = true;
    }
  }

  public updateAnimationController(NewClass: any): void {
    try {
      if (typeof NewClass !== 'function') {
        throw new Error('Classe de AnimationController inválida.');
      }
      const testController = new NewClass(this.stickman);
      testController.isFlying = this.isFlying;
      testController.isAgatha = this.currentPowerSet === 'agatha';
      testController.isVision = this.currentPowerSet === 'vision';
      // Execute test update to ensure no runtime errors like "fingers is not iterable" occur!
      testController.update(0.016, 0);

      this.animController = testController;
    } catch (e: unknown) {
      console.error('[GameScene] Falha ao instanciar ou executar novo AnimationController:', e);
      this.fallbackAnimationController();
      throw e;
    }
  }

  public fallbackAnimationController(): void {
    try {
      this.animController = new AnimationController(this.stickman);
      this.animController.isFlying = this.isFlying;
      this.animController.isAgatha = this.currentPowerSet === 'agatha';
      this.animController.isVision = this.currentPowerSet === 'vision';
      scriptRuntimeEngine.markScriptExecutionError(
        'animation-controller',
        'Erro em tempo de execução no AnimationController. Revertido com segurança para o controlador estável.'
      );
    } catch (fallbackErr) {
      console.error('[GameScene] Fallback AnimationController falhou:', fallbackErr);
    }
  }

  public updateProjectileSystem(NewClass: any): void {
    if (this.projectileSystem) {
      this.projectileSystem.dispose();
    }
    this.projectileSystem = new NewClass(this.scene, (isTargetHit: boolean) => {
      if (isTargetHit) {
        this.triggerHitConfirm();
        if (this.settings.cameraShake) {
          this.addCameraShake(0.04);
        }
      }
    });
  }

  public updateStickmanRig(rigFactory: () => StickmanNodes): void {
    if (typeof rigFactory !== 'function') {
      throw new Error('Fábrica de StickmanRig inválida.');
    }
    const previousAgatha = this.currentPowerSet === 'agatha';
    const candidate = rigFactory();
    if (
      !candidate ||
      !candidate.root ||
      !candidate.thrusters ||
      !candidate.leftHand ||
      !candidate.rightHand
    ) {
      throw new Error('StickmanRig editado não expõe os nós obrigatórios (root/thrusters/mãos).');
    }
    if (this.stickman) {
      this.scene.remove(this.stickman.root);
    }
    this.stickman = candidate;
    this.scene.add(this.stickman.root);
    this.stickman.root.position.copy(this.playerPos);
    this.stickman.root.rotation.y = this.playerRotationY;
    this.buildModeManager?.registerDefaultStickman?.(this.stickman.root);
    this.animController = new AnimationController(this.stickman);
    this.animController.isFlying = this.isFlying;
    this.animController.isAgatha = previousAgatha;
    this.animController.isVision = this.currentPowerSet === 'vision';
    if (this.stickman.mindStone) {
      this.stickman.mindStone.visible = this.currentPowerSet === 'vision';
    }
    if (this.visionAbilities) {
      this.visionAbilities.dispose();
    }
    this.visionAbilities = this.createVisionAbilities();
  }

  public updateTargetDummyClass(NewClass: any): void {
    const oldDummies = [...this.dummies];
    this.dummies = [];
    oldDummies.forEach((oldD) => {
      this.scene.remove(oldD.group);
      const newD = new NewClass(
        oldD.id,
        oldD.group.position.clone(),
        (destroyPos: THREE.Vector3) => {
          this.projectileSystem.emitDestructionParticles(destroyPos);
          if (this.settings.cameraShake) {
            this.addCameraShake(0.24);
          }
        },
        () => this.getValidSpawnPosition()
      );
      if (oldD.isRival) {
        newD.setAsRival();
      }
      this.dummies.push(newD);
      this.scene.add(newD.group);
    });
  }

  /**
   * Raycasts into the 3D scene from screen coordinates to identify the clicked element
   * for the direct "Select in Preview" feature.
   */
  public raycastInspectPreview(screenX: number, screenY: number): string | null {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const ndcX = (screenX / width) * 2 - 1;
    const ndcY = -(screenY / height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const stickHits = this.raycaster.intersectObject(this.stickman.root, true);
    if (stickHits.length > 0) {
      return 'stickman';
    }

    for (const d of this.dummies) {
      const dHits = this.raycaster.intersectObject(d.group, true);
      if (dHits.length > 0) {
        return 'dummy';
      }
    }

    const baseHits = this.raycaster.intersectObject(this.baseplateMesh, false);
    if (baseHits.length > 0) {
      return 'scene';
    }

    return null;
  }

  public dispose(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.animFrameId);
    this.unsubSettings();
    if (this.unsubLiveConfig) {
      this.unsubLiveConfig();
    }
    if (this.buildModeManager) {
      this.buildModeManager.dispose();
    }

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);

    this.projectileSystem.dispose();
    if (this.ironManAbilities) {
      this.ironManAbilities.dispose();
    }
    if (this.agathaAbilities) {
      this.agathaAbilities.dispose();
    }
    if (this.visionAbilities) {
      this.visionAbilities.dispose();
    }
    audioSystem.stopAllLoops();

    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
