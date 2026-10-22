import * as THREE from 'three';
import { audioSystem } from './AudioSystem';
import { gameplayRestrictions } from './GameplayRestrictions';

export interface FloatingDamageText {
  id: number;
  text: string;
  pos: THREE.Vector3;
  worldPos: THREE.Vector3;
  age: number;
  maxAge: number;
  screenX: number;
  screenY: number;
  opacity: number;
  scale: number;
}

export class TargetDummy {
  public group: THREE.Group;
  public id: number;
  public maxHealth: number = 100;
  public health: number = 100;
  public isDead: boolean = false;
  public radius: number = 0.75;
  public height: number = 2.1;

  // Visual meshes
  private bodyMesh: THREE.Mesh;
  private headMesh: THREE.Mesh;
  private standPole: THREE.Mesh;
  private standBase: THREE.Mesh;
  private targetDecal: THREE.Mesh;
  private healthSprite: THREE.Sprite;
  private healthCanvas: HTMLCanvasElement;
  private healthCtx: CanvasRenderingContext2D;
  private healthTexture: THREE.CanvasTexture;

  // Materials
  private normalMaterial: THREE.MeshStandardMaterial;
  private hitMaterial: THREE.MeshStandardMaterial;
  private isHitFlashing: boolean = false;
  private hitFlashTimer: number = 0;

  // Recoil physics & knockback
  private recoilAngle: number = 0;
  private recoilVel: number = 0;
  private knockbackVel: THREE.Vector3 = new THREE.Vector3();

  // Rival Beam Clash capabilities
  public isRival: boolean = false;
  public rivalBeamActive: boolean = false;
  public rivalCooldown: number = 0;
  public rivalBeamTargetPos: THREE.Vector3 = new THREE.Vector3();

  // Agatha Harkness Arcane Choke state
  public isChoked: boolean = false;
  public chokeElevation: number = 0;

  public applyImpulse(impulse: THREE.Vector3): void {
    this.knockbackVel.add(impulse);
  }

  // Respawn state
  private respawnTimer: number = 0;
  private readonly respawnDelay: number = 3.0; // seconds

  // Destruction particles hook
  private onDestructionCallback: (pos: THREE.Vector3) => void;
  private getSpawnPosition?: () => THREE.Vector3;

  constructor(
    id: number,
    initialPos: THREE.Vector3,
    onDestruction: (pos: THREE.Vector3) => void,
    getSpawnPosition?: () => THREE.Vector3
  ) {
    this.id = id;
    this.onDestructionCallback = onDestruction;
    this.getSpawnPosition = getSpawnPosition;
    this.group = new THREE.Group();
    this.group.position.copy(initialPos);

    // Normal clay training dummy material
    this.normalMaterial = new THREE.MeshStandardMaterial({
      color: 0xdee2e6,
      roughness: 0.62,
      metalness: 0.05,
    });

    // Red flash hit material
    this.hitMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3b4e,
      emissive: 0xcc1122,
      emissiveIntensity: 0.6,
      roughness: 0.3,
    });

    // 1. Heavy circular steel/wood base
    const baseGeo = new THREE.CylinderGeometry(0.55, 0.6, 0.08, 24);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.7 });
    this.standBase = new THREE.Mesh(baseGeo, baseMat);
    this.standBase.position.y = 0.04;
    this.standBase.receiveShadow = true;
    this.group.add(this.standBase);

    // 2. Central support pole
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 16);
    this.standPole = new THREE.Mesh(poleGeo, baseMat);
    this.standPole.position.y = 0.45;
    this.standPole.castShadow = true;
    this.group.add(this.standPole);

    // 3. Humanoid Clay Dummy Body (Pivoted for recoil)
    const dummyUpper = new THREE.Group();
    dummyUpper.position.y = 0.9;
    dummyUpper.name = 'DummyUpper';

    // Torso capsule
    const torsoGeo = new THREE.CapsuleGeometry(0.24, 0.55, 20, 24);
    this.bodyMesh = new THREE.Mesh(torsoGeo, this.normalMaterial);
    this.bodyMesh.position.y = 0.38;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    dummyUpper.add(this.bodyMesh);

    // Red target rings decal on chest
    const decalCanvas = document.createElement('canvas');
    decalCanvas.width = 128;
    decalCanvas.height = 128;
    const dctx = decalCanvas.getContext('2d')!;
    dctx.clearRect(0, 0, 128, 128);
    // Outer red ring
    dctx.fillStyle = '#e63946';
    dctx.beginPath();
    dctx.arc(64, 64, 56, 0, Math.PI * 2);
    dctx.fill();
    // Middle white ring
    dctx.fillStyle = '#ffffff';
    dctx.beginPath();
    dctx.arc(64, 64, 38, 0, Math.PI * 2);
    dctx.fill();
    // Bullseye center
    dctx.fillStyle = '#e63946';
    dctx.beginPath();
    dctx.arc(64, 64, 20, 0, Math.PI * 2);
    dctx.fill();

    const decalTexture = new THREE.CanvasTexture(decalCanvas);
    const decalGeo = new THREE.PlaneGeometry(0.34, 0.34);
    const decalMat = new THREE.MeshBasicMaterial({
      map: decalTexture,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.targetDecal = new THREE.Mesh(decalGeo, decalMat);
    this.targetDecal.position.set(0, 0.44, 0.25);
    dummyUpper.add(this.targetDecal);

    // Head sphere
    const headGeo = new THREE.SphereGeometry(0.24, 28, 24);
    this.headMesh = new THREE.Mesh(headGeo, this.normalMaterial);
    this.headMesh.position.y = 0.88;
    this.headMesh.castShadow = true;
    this.headMesh.receiveShadow = true;
    dummyUpper.add(this.headMesh);

    this.group.add(dummyUpper);

    // 4. Billboarded Health Bar Sprite above head
    this.healthCanvas = document.createElement('canvas');
    this.healthCanvas.width = 160;
    this.healthCanvas.height = 28;
    this.healthCtx = this.healthCanvas.getContext('2d')!;
    this.healthTexture = new THREE.CanvasTexture(this.healthCanvas);

    const spriteMat = new THREE.SpriteMaterial({
      map: this.healthTexture,
      depthTest: false,
      transparent: true,
    });
    this.healthSprite = new THREE.Sprite(spriteMat);
    this.healthSprite.scale.set(1.2, 0.22, 1);
    this.healthSprite.position.set(0, 2.25, 0);
    this.group.add(this.healthSprite);

    this.updateHealthBar();
  }

  public setAsRival(): void {
    this.isRival = true;
    this.maxHealth = 150;
    this.health = 150;
    this.updateHealthBar();

    // Add energetic cyan aura ring
    const auraGeo = new THREE.RingGeometry(0.18, 0.26, 24);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.position.set(0, 1.34, 0.28);
    this.group.add(aura);
  }

  private updateHealthBar(): void {
    const ctx = this.healthCtx;
    const w = this.healthCanvas.width;
    const h = this.healthCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // Dark rounded background
    ctx.fillStyle = 'rgba(20, 22, 28, 0.85)';
    this.roundRect(ctx, 4, 4, w - 8, h - 8, 6);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Health fill percentage
    const pct = Math.max(0, Math.min(1, this.health / this.maxHealth));
    const barWidth = (w - 12) * pct;

    if (barWidth > 0) {
      // Color gradient: green -> yellow -> red
      const grad = ctx.createLinearGradient(6, 6, w - 6, 6);
      if (pct > 0.5) {
        grad.addColorStop(0, '#2ec4b6');
        grad.addColorStop(1, '#48cae4');
      } else if (pct > 0.25) {
        grad.addColorStop(0, '#ffd166');
        grad.addColorStop(1, '#ff9f1c');
      } else {
        grad.addColorStop(0, '#e63946');
        grad.addColorStop(1, '#d90429');
      }
      ctx.fillStyle = grad;
      this.roundRect(ctx, 6, 6, barWidth, h - 12, 4);
      ctx.fill();
    }

    this.healthTexture.needsUpdate = true;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  public takeDamage(
    amount: number,
    hitWorldPos: THREE.Vector3,
    knockback?: THREE.Vector3
  ): { killed: boolean; actualDamage: number } {
    if (this.isDead) return { killed: false, actualDamage: 0 };

    // Invulnerability check
    if (gameplayRestrictions.hasRestriction('Invulnerable')) {
      return { killed: false, actualDamage: 0 };
    }

    let actualDamage = amount;
    // Shield check (mitigates 50% damage)
    if (gameplayRestrictions.hasRestriction('IsShield')) {
      actualDamage = Math.max(1, Math.round(amount * 0.5));
    }

    this.health = Math.max(0, this.health - actualDamage);
    this.updateHealthBar();

    // Hit flash
    this.isHitFlashing = true;
    this.hitFlashTimer = 0.09;
    this.bodyMesh.material = this.hitMaterial;
    this.headMesh.material = this.hitMaterial;

    // Recoil impulse based on hit unless Anchored
    if (!gameplayRestrictions.hasRestriction('Anchored')) {
      this.recoilVel = -5.5;
      if (knockback) {
        this.knockbackVel.add(knockback);
      }
    }

    audioSystem.playHit();

    if (this.health <= 0) {
      this.die();
      return { killed: true, actualDamage };
    }

    return { killed: false, actualDamage };
  }

  private die(): void {
    this.isDead = true;
    this.respawnTimer = this.respawnDelay;
    this.group.visible = false;

    // Play destruction sound and emit destruction effect
    const centerPos = this.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.onDestructionCallback(centerPos);
    audioSystem.playDestroy();
  }

  private respawn(): void {
    if (this.getSpawnPosition) {
      this.group.position.copy(this.getSpawnPosition());
    } else {
      // Fallback position
      const angle = Math.random() * Math.PI * 2;
      const distance = 10 + Math.random() * 14;
      this.group.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    }

    // Reset health & state
    this.health = this.maxHealth;
    this.isDead = false;
    this.recoilAngle = 0;
    this.recoilVel = 0;
    this.isHitFlashing = false;
    this.bodyMesh.material = this.normalMaterial;
    this.headMesh.material = this.normalMaterial;
    this.updateHealthBar();
    this.group.visible = true;
  }

  public update(dt: number): void {
    if (this.isDead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawn();
      }
      return;
    }

    // Hit flash countdown
    if (this.isHitFlashing) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0) {
        this.isHitFlashing = false;
        this.bodyMesh.material = this.normalMaterial;
        this.headMesh.material = this.normalMaterial;
      }
    }

    // Damped recoil spring physics
    const stiffness = 85.0;
    const damping = 12.0;
    const springForce = -stiffness * this.recoilAngle;
    const dampingForce = -damping * this.recoilVel;
    const accel = springForce + dampingForce;
    this.recoilVel += accel * dt;
    this.recoilAngle += this.recoilVel * dt;

    // Apply knockback movement
    if (this.knockbackVel.lengthSq() > 0.001) {
      this.group.position.addScaledVector(this.knockbackVel, dt);
      this.group.position.y = 0; // maintain on floor
      this.knockbackVel.multiplyScalar(Math.max(0, 1 - dt * 6.0));
    }

    if (this.rivalCooldown > 0) {
      this.rivalCooldown -= dt;
    }

    const dummyUpper = this.group.getObjectByName('DummyUpper');
    if (dummyUpper) {
      if (this.isChoked) {
        // Frantic choking struggle wobble and strain backward without breaking the rig
        const chokeWobble = Math.sin(performance.now() * 0.03) * 0.12 - 0.22;
        dummyUpper.rotation.x = chokeWobble;
        dummyUpper.rotation.z = Math.cos(performance.now() * 0.025) * 0.08;
      } else {
        dummyUpper.rotation.x = this.recoilAngle;
        dummyUpper.rotation.z = 0;
      }
    }
  }

  public getCenter(): THREE.Vector3 {
    return this.group.position.clone().add(new THREE.Vector3(0, 1.25, 0));
  }

  public getThroatPosition(): THREE.Vector3 {
    return this.group.position.clone().add(new THREE.Vector3(0, 1.55, 0));
  }
}
