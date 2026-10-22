import * as THREE from 'three';
import { TargetDummy } from './TargetDummy';
import { StickmanNodes } from './StickmanRig';
import { audioSystem } from './AudioSystem';
import { activeIronManConfig } from './abilities/ironman/IronManConfig';
import {
  IronManDualBeams,
  BeamClashState,
} from './abilities/ironman/IronManDualBeams';
import { IronManSpinningLasers } from './abilities/ironman/IronManSpinningLasers';

export interface ExplosionFx {
  pos: THREE.Vector3;
  radius: number;
  maxRadius: number;
  age: number;
  maxAge: number;
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  ringMesh?: THREE.Mesh;
}

export interface BezierMissile {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  p3: THREE.Vector3;
  target: TargetDummy | null;
  targetPos: THREE.Vector3;
  t: number;
  duration: number;
  mesh: THREE.Group;
  trailTimer: number;
  isDead: boolean;
  isHeavy: boolean;
}

export interface RepulsorBolt {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  startPos: THREE.Vector3;
  maxRange: number;
  target: TargetDummy | null;
  homingStrength: number;
  isDead: boolean;
}

export type { BeamClashState } from './abilities/ironman/IronManDualBeams';

export class IronManAbilities {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAimDestination: () => { pos: THREE.Vector3; target: TargetDummy | null };
  private onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void;
  private onShake: (amount: number) => void;
  public onRepulsorFired?: (hand: 'left' | 'right', aimPitch: number) => void;
  private currentRepulsorHand: 'left' | 'right' = 'right';

  // Active projectiles & effects
  private repulsors: RepulsorBolt[] = [];
  private missiles: BezierMissile[] = [];
  private explosions: ExplosionFx[] = [];
  public hitStopTimer: number = 0;
  public customPowerColor: string | null = null;

  // Concentrated Energy Blast (Unibeam / Heavy Blast) state
  public isChargingHeavyBlast: boolean = false;
  private heavyBlastChargeTimer: number = 0;
  private heavyBlastChargeDuration: number = 0.30;
  private chargeMesh: THREE.Mesh | null = null;
  private chargeLight: THREE.PointLight | null = null;

  // Dual Beam state
  public isDualBeamActive: boolean = false;
  private dualBeamTimer: number = 0;
  private dualBeamMaxDuration: number = 4.0;
  private dualBeamDamageTimer: number = 0;
  private leftBeamMesh: THREE.Line | null = null;
  private rightBeamMesh: THREE.Line | null = null;
  private leftBeamGlow: THREE.Mesh | null = null;
  private rightBeamGlow: THREE.Mesh | null = null;
  private rivalBeamMesh: THREE.Line | null = null;
  private rivalBeamGlow: THREE.Mesh | null = null;
  private clashSphere: THREE.Mesh | null = null;
  private clashLight: THREE.PointLight | null = null;

  // Beam Clash
  public clashState: BeamClashState = {
    active: false,
    rival: null,
    progress: 0.5,
    clashPoint: new THREE.Vector3(),
    duration: 0,
    maxDuration: 6.0,
    lastTapTime: 0,
  };

  // Spinning Lasers state
  public isSpinningLasersActive: boolean = false;
  private spinningLaserTimer: number = 0;
  private spinningLaserDuration: number = 1.5;
  private spinningAngle: number = 0;
  private spinningLaserDamageTimers: Map<number, number> = new Map();
  private slicedDummiesThisCast: Set<number> = new Set();
  private leftLaserMesh: THREE.Mesh | null = null;
  private rightLaserMesh: THREE.Mesh | null = null;

  // Particles
  private smokeParticles: { pos: THREE.Vector3; vel: THREE.Vector3; age: number; maxAge: number; size: number }[] = [];
  private smokeInstancedMesh: THREE.InstancedMesh;
  private dummyMatrix = new THREE.Matrix4();

  // Optional modules installed by ScriptRuntimeEngine. When a module is present
  // it is the single source of truth for that ability; otherwise the built-in
  // implementation below remains the stable fallback.
  private repulsorModule: any = null;
  private microMissilesModule: any = null;
  private unibeamModule: any = null;
  private dualBeamsModule: IronManDualBeams | null = null;
  private spinningLasersModule: IronManSpinningLasers | null = null;

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    getAimDestination: () => { pos: THREE.Vector3; target: TargetDummy | null },
    onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void,
    onShake: (amount: number) => void
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.getAimDestination = getAimDestination;
    this.onDamageDealt = onDamageDealt;
    this.onShake = onShake;

    // Pooled smoke particles
    const smokeGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const smokeMat = new THREE.MeshBasicMaterial({ color: 0x99a2ad, transparent: true, opacity: 0.5 });
    this.smokeInstancedMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, 150);
    this.smokeInstancedMesh.count = 0;
    this.scene.add(this.smokeInstancedMesh);

    this.initBeamMeshes();
    this.initLaserMeshes();
    this.initChargeMeshes();
    this.syncConfigTimings();
  }

  private syncConfigTimings(): void {
    const cfg = activeIronManConfig;
    this.heavyBlastChargeDuration = Math.max(0, cfg.unibeam.chargeTime);
    this.dualBeamMaxDuration = Math.max(0.1, cfg.dualBeams.maxDuration);
    this.spinningLaserDuration = Math.max(0.1, cfg.spinningLasers.duration);
  }

  public setRepulsorModule(module: any | null): void {
    if (this.repulsorModule && this.repulsorModule !== module) {
      try { this.repulsorModule.dispose?.(); } catch { /* ignore */ }
    }
    this.repulsorModule = module;
    for (const r of this.repulsors) this.scene.remove(r.mesh);
    this.repulsors = [];
    if (module) {
      module.onRepulsorFired = (hand: 'left' | 'right', aimPitch: number) => {
        this.onRepulsorFired?.(hand, aimPitch);
      };
    }
  }

  public setMicroMissilesModule(module: any | null): void {
    if (this.microMissilesModule && this.microMissilesModule !== module) {
      try { this.microMissilesModule.dispose?.(); } catch { /* ignore */ }
    }
    this.microMissilesModule = module;
  }

  public setUnibeamModule(module: any | null): void {
    if (this.unibeamModule && this.unibeamModule !== module) {
      try { this.unibeamModule.dispose?.(); } catch { /* ignore */ }
    }
    this.unibeamModule = module;
    if (!module) {
      this.isChargingHeavyBlast = false;
      if (this.chargeMesh) this.chargeMesh.visible = false;
      if (this.chargeLight) this.chargeLight.intensity = 0;
    }
  }

  public getInstalledModules(): {
    repulsor: unknown;
    microMissiles: unknown;
    unibeam: unknown;
    dualBeams: unknown;
    spinningLasers: unknown;
  } {
    return {
      repulsor: this.repulsorModule,
      microMissiles: this.microMissilesModule,
      unibeam: this.unibeamModule,
      dualBeams: this.dualBeamsModule,
      spinningLasers: this.spinningLasersModule,
    };
  }

  public setDualBeamsModule(module: IronManDualBeams | null): void {
    if (this.dualBeamsModule && this.dualBeamsModule !== module) {
      this.dualBeamsModule.dispose();
    }
    this.dualBeamsModule = module;
    this.isDualBeamActive = false;
    this.resetClashState();
  }

  public setSpinningLasersModule(module: IronManSpinningLasers | null): void {
    if (this.spinningLasersModule && this.spinningLasersModule !== module) {
      this.spinningLasersModule.dispose();
    }
    this.spinningLasersModule = module;
    this.isSpinningLasersActive = false;
  }

  private resetClashState(): void {
    const rival = this.clashState.rival;
    if (rival) rival.rivalBeamActive = false;
    this.clashState.active = false;
    this.clashState.rival = null;
    this.clashState.progress = 0.5;
    this.clashState.duration = 0;
    if (this.clashSphere) this.clashSphere.visible = false;
    if (this.clashLight) this.clashLight.intensity = 0;
    if (this.rivalBeamMesh) this.rivalBeamMesh.visible = false;
    if (this.rivalBeamGlow) this.rivalBeamGlow.visible = false;
  }

  private initChargeMeshes(): void {
    const chargeGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const chargeMat = new THREE.MeshBasicMaterial({
      color: 0xff3b00,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.chargeMesh = new THREE.Mesh(chargeGeo, chargeMat);
    this.chargeMesh.visible = false;
    this.scene.add(this.chargeMesh);

    this.chargeLight = new THREE.PointLight(0xff3b00, 0, 6);
    this.scene.add(this.chargeLight);
  }

  private initBeamMeshes(): void {
    // Dual Beam line geometries
    const beamMat = new THREE.LineBasicMaterial({ color: 0xffea00, linewidth: 3 });
    const geomL = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const geomR = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.leftBeamMesh = new THREE.Line(geomL, beamMat);
    this.rightBeamMesh = new THREE.Line(geomR, beamMat);
    this.leftBeamMesh.visible = false;
    this.rightBeamMesh.visible = false;
    this.scene.add(this.leftBeamMesh);
    this.scene.add(this.rightBeamMesh);

    // Glowing beam envelopes (Cylinder)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const glowGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 12, 1, true);
    this.leftBeamGlow = new THREE.Mesh(glowGeo, glowMat);
    this.rightBeamGlow = new THREE.Mesh(glowGeo, glowMat);
    this.leftBeamGlow.visible = false;
    this.rightBeamGlow.visible = false;
    this.scene.add(this.leftBeamGlow);
    this.scene.add(this.rightBeamGlow);

    // Rival Opposing Beam (Cyan/Magenta plasma)
    const rivalMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 3 });
    const rivalGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.rivalBeamMesh = new THREE.Line(rivalGeom, rivalMat);
    this.rivalBeamMesh.visible = false;
    this.scene.add(this.rivalBeamMesh);

    const rivalGlowMat = new THREE.MeshBasicMaterial({
      color: 0xaa00ff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.rivalBeamGlow = new THREE.Mesh(glowGeo, rivalGlowMat);
    this.rivalBeamGlow.visible = false;
    this.scene.add(this.rivalBeamGlow);

    // Beam Clash Sphere
    const clashGeo = new THREE.SphereGeometry(0.55, 16, 16);
    const clashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    this.clashSphere = new THREE.Mesh(clashGeo, clashMat);
    this.clashSphere.visible = false;
    this.clashLight = new THREE.PointLight(0xffaa00, 3, 8);
    this.clashSphere.add(this.clashLight);
    this.scene.add(this.clashSphere);
  }

  private initLaserMeshes(): void {
    // 7.5-meter cutting lasers for Spinning Lasers
    const laserGeo = new THREE.CylinderGeometry(0.07, 0.07, 7.5, 12);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xff1133 });
    this.leftLaserMesh = new THREE.Mesh(laserGeo, laserMat);
    this.rightLaserMesh = new THREE.Mesh(laserGeo, laserMat);
    this.leftLaserMesh.visible = false;
    this.rightLaserMesh.visible = false;
    this.scene.add(this.leftLaserMesh);
    this.scene.add(this.rightLaserMesh);
  }

  // ==========================================
  // 1. BASIC ATTACK: DUAL REPULSOR SHOT (8 DMG, rapid CD)
  // ==========================================
  public fireRepulsorShot(aimPitch: number = 0): void {
    if (this.repulsorModule) {
      this.repulsorModule.fire(aimPitch);
      return;
    }
    const repulsorCfg = activeIronManConfig.repulsor;
    // Alternate between right and left hand for dual repulsor feel
    this.currentRepulsorHand = this.currentRepulsorHand === 'right' ? 'left' : 'right';
    const hand = this.currentRepulsorHand;
    const handNode = hand === 'right' ? this.stickman.rightHand : this.stickman.leftHand;

    const handPos = new THREE.Vector3();
    handNode.getWorldPosition(handPos);

    const aim = this.getAimDestination();
    const dir = aim.pos.clone().sub(handPos).normalize();

    // Trigger fast responsive arm raise animation
    if (this.onRepulsorFired) {
      this.onRepulsorFired(hand, aimPitch);
    }

    const group = new THREE.Group();
    // Sleek red cylindrical energy bolt with increased visual thickness
    const coreGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.75, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = Math.PI / 2;
    group.add(core);

    const glowColorHex = this.customPowerColor ? parseInt(this.customPowerColor.replace('#', ''), 16) : 0xff1a2a;
    const glowGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.95, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: glowColorHex,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = Math.PI / 2;
    group.add(glow);

    const lightColorHex = this.customPowerColor ? parseInt(this.customPowerColor.replace('#', ''), 16) : 0xff1122;
    const light = new THREE.PointLight(lightColorHex, 2.8, 4.5);
    group.add(light);

    group.position.copy(handPos);
    group.lookAt(handPos.clone().add(dir));
    this.scene.add(group);

    this.repulsors.push({
      mesh: group,
      pos: handPos,
      vel: dir.multiplyScalar(repulsorCfg.speed),
      startPos: handPos.clone(),
      maxRange: repulsorCfg.maxRange,
      target: aim.target,
      homingStrength: aim.target ? repulsorCfg.homingStrength : 0,
      isDead: false,
    });

    audioSystem.playRepulsor();
    this.onShake(0.015);
  }

  // ==========================================
  // 2. ABILITY 1: SIX-MISSILE CURVED VOLLEY (12 DMG EA, 4 RADIUS AOE, 8s CD)
  // ==========================================
  public fireMissileVolley(): void {
    const aim = this.getAimDestination();
    if (this.microMissilesModule) {
      this.microMissilesModule.fire(aim.target, aim.pos);
      return;
    }
    const missileCfg = activeIronManConfig.microMissiles;
    const dest = aim.pos.clone();
    const target = aim.target;

    const shoulderL = new THREE.Vector3();
    const shoulderR = new THREE.Vector3();
    this.stickman.leftShoulder.getWorldPosition(shoulderL);
    this.stickman.rightShoulder.getWorldPosition(shoulderR);

    audioSystem.playMissileLaunch();
    this.onShake(0.05);

    // 3 missiles left, 3 missiles right with coordinated Bézier arcs
    const volleyCount = Math.max(1, Math.round(missileCfg.volleyCount));
    for (let i = 0; i < volleyCount; i++) {
      const isLeft = i < Math.ceil(volleyCount / 2);
      const indexInSide = i % Math.ceil(volleyCount / 2);
      const start = isLeft ? shoulderL.clone() : shoulderR.clone();
      const sideSign = isLeft ? -1 : 1;

      // Arc control points: curve outward and upward, then converge smoothly to destination
      const arcWidth = 2.4 + indexInSide * 1.6;
      const arcHeight = 2.2 + indexInSide * 0.9;

      const p0 = start;
      const p1 = start.clone().add(new THREE.Vector3(sideSign * arcWidth, arcHeight, -3));
      const p2 = dest.clone().add(new THREE.Vector3(sideSign * (arcWidth * 0.5), arcHeight * 0.4, 4));
      const p3 = dest.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        0.5,
        (Math.random() - 0.5) * 1.2
      ));

      // Build 3D procedural missile model with increased visible size
      const mGroup = this.createMissileModel(0.7, 0xbdc3c7);
      mGroup.position.copy(p0);
      this.scene.add(mGroup);

      // Stagger start delay slightly by setting initial negative t
      const delay = i * 0.05;
      this.missiles.push({
        p0,
        p1,
        p2,
        p3,
        target,
        targetPos: dest,
        t: -delay,
        duration: 0.85 + indexInSide * 0.08,
        mesh: mGroup,
        trailTimer: 0,
        isDead: false,
        isHeavy: false,
      });
    }
  }

  // ==========================================
  // 3. ABILITY 2: DUAL-HAND BEAM & BEAM CLASH (6 DMG/S, 20 RANGE, 4s DURATION, 10s CD)
  // ==========================================
  public toggleDualBeam(): boolean {
    if (this.dualBeamsModule) {
      const active = this.dualBeamsModule.toggle();
      this.isDualBeamActive = active;
      return active;
    }
    if (this.isDualBeamActive) {
      this.stopDualBeam();
      return false; // deactivated
    } else {
      this.isDualBeamActive = true;
      this.dualBeamTimer = 0;
      this.dualBeamDamageTimer = 0;
      audioSystem.playBeamBurst();
      return true; // activated
    }
  }

  public stopDualBeam(): void {
    if (this.dualBeamsModule) {
      this.dualBeamsModule.stop();
      this.isDualBeamActive = false;
      return;
    }
    this.isDualBeamActive = false;
    this.leftBeamMesh!.visible = false;
    this.rightBeamMesh!.visible = false;
    this.leftBeamGlow!.visible = false;
    this.rightBeamGlow!.visible = false;
    this.resolveClash(false);
  }

  // Tap button during active beam clash to push beam forward!
  public onClashTap(): void {
    if (this.dualBeamsModule) {
      this.dualBeamsModule.onClashTap();
      return;
    }
    if (!this.clashState.active) return;
    this.clashState.progress = Math.min(1.0, this.clashState.progress + 0.15);
    this.clashState.lastTapTime = performance.now();
    audioSystem.playBeamClash();
    this.onShake(0.1);

    if (this.clashState.progress >= 1.0) {
      this.resolveClash(true);
    }
  }

  private resolveClash(playerWon: boolean): void {
    if (!this.clashState.active) return;
    const rival = this.clashState.rival;

    if (playerWon && rival && !rival.isDead) {
      // Massive victory burst at target position! (80 bonus damage as requested)
      const finishPos = rival.getCenter();
      this.createExplosion(finishPos, 5.0, 0xffaa00);
      const fling = new THREE.Vector3(0, 4.0, -18);
      this.onDamageDealt(rival, 80, finishPos, fling);
      audioSystem.playExplosion();
      this.onShake(0.42);
      rival.rivalCooldown = 10.0; // 10s recovery
    }

    this.clashState.active = false;
    this.clashSphere!.visible = false;
    this.rivalBeamMesh!.visible = false;
    this.rivalBeamGlow!.visible = false;
    if (rival) {
      rival.rivalBeamActive = false;
    }
  }

  // ==========================================
  // 4. ABILITY 3: CONCENTRATED UNIBEAM BLAST (65 DMG, 5.5m AOE, 8s CD, 0.3s PREP)
  // ==========================================
  public fireHeavyMissile(): void {
    if (this.unibeamModule) {
      this.unibeamModule.fire(this.getAimDestination());
      return;
    }
    if (this.isChargingHeavyBlast) return;
    this.isChargingHeavyBlast = true;
    this.heavyBlastChargeTimer = 0;
    this.heavyBlastChargeDuration = Math.max(0, activeIronManConfig.unibeam.chargeTime);

    if (this.chargeMesh && this.chargeLight) {
      const chargeCol = this.customPowerColor ? parseInt(this.customPowerColor.replace('#', ''), 16) : 0xff3b00;
      (this.chargeMesh.material as THREE.MeshBasicMaterial).color.setHex(chargeCol);
      this.chargeLight.color.setHex(chargeCol);
      this.chargeMesh.visible = true;
      this.chargeLight.intensity = 1.0;
    }

    audioSystem.playUnibeamCharge();
    this.onShake(0.04);
  }

  private launchConcentratedBlast(): void {
    const aim = this.getAimDestination();
    const dest = aim.pos.clone();
    const target = aim.target;

    const chestPos = new THREE.Vector3();
    this.stickman.upperTorso.getWorldPosition(chestPos);

    const p0 = chestPos.clone().add(new THREE.Vector3(0, 0.2, -0.4));
    const p1 = p0.clone().add(new THREE.Vector3(0, 1.2, -4));
    const p2 = dest.clone().add(new THREE.Vector3(0, 0.6, 3));
    const p3 = dest.clone();

    const blastCol = this.customPowerColor ? parseInt(this.customPowerColor.replace('#', ''), 16) : 0xff3b00;
    const heavyModel = this.createHeavyEnergyBlastModel(blastCol);
    heavyModel.position.copy(p0);
    this.scene.add(heavyModel);

    this.missiles.push({
      p0,
      p1,
      p2,
      p3,
      target,
      targetPos: dest,
      t: 0,
      duration: 0.72,
      mesh: heavyModel,
      trailTimer: 0,
      isDead: false,
      isHeavy: true,
    });

    audioSystem.playMissileLaunch();
    this.onShake(0.12);
  }

  private createHeavyEnergyBlastModel(color: number): THREE.Group {
    const grp = new THREE.Group();
    // High-energy core capsule
    const coreGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.2, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = Math.PI / 2;
    grp.add(core);

    // Outer plasma aura capsule
    const glowGeo = new THREE.CylinderGeometry(0.36, 0.36, 1.4, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = Math.PI / 2;
    grp.add(glow);

    // Rotating energy ring
    const ringGeo = new THREE.TorusGeometry(0.44, 0.045, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.y = Math.PI / 4;
    grp.add(ring);

    const light = new THREE.PointLight(color, 4.5, 9);
    grp.add(light);
    return grp;
  }

  // ==========================================
  // 5. ABILITY 4: DUAL-HAND SPINNING LASERS (60 DMG SLICE, 360° SPIN, 12s CD)
  // ==========================================
  public triggerSpinningLasers(currentRy: number = 0): void {
    if (this.spinningLasersModule) {
      this.spinningLasersModule.trigger(currentRy);
      this.isSpinningLasersActive = this.spinningLasersModule.isActive;
      return;
    }
    this.isSpinningLasersActive = true;
    this.spinningLaserTimer = 0;
    this.spinningLaserDuration = Math.max(0.1, activeIronManConfig.spinningLasers.duration);
    this.spinningAngle = currentRy;
    this.spinningLaserDamageTimers.clear();
    this.slicedDummiesThisCast.clear();
    this.leftLaserMesh!.visible = true;
    this.rightLaserMesh!.visible = true;
    audioSystem.playLaserSpin();
    this.onShake(0.06);
  }

  public stopSpinningLasers(): void {
    if (this.spinningLasersModule) {
      this.spinningLasersModule.stop();
    }
    this.isSpinningLasersActive = false;
    if (this.leftLaserMesh) this.leftLaserMesh.visible = false;
    if (this.rightLaserMesh) this.rightLaserMesh.visible = false;
  }

  private createMissileModel(scale: number, color: number): THREE.Group {
    const grp = new THREE.Group();
    // Fuselage cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.7 * scale, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    grp.add(body);

    // Nose cone
    const coneGeo = new THREE.ConeGeometry(0.085 * scale, 0.25 * scale, 12);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.5, roughness: 0.3 });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.z = -0.45 * scale;
    cone.rotation.x = -Math.PI / 2;
    grp.add(cone);

    // Engine exhaust flame
    const flameGeo = new THREE.ConeGeometry(0.07 * scale, 0.3 * scale, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.z = 0.45 * scale;
    flame.rotation.x = Math.PI / 2;
    grp.add(flame);

    return grp;
  }

  public createExplosion(pos: THREE.Vector3, radius: number, color: number = 0xff6600): void {
    if (this.customPowerColor) {
      color = parseInt(this.customPowerColor.replace('#', ''), 16);
    }
    const geo = new THREE.SphereGeometry(radius * 0.4, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    const light = new THREE.PointLight(color, 4, radius * 2.5);
    light.position.copy(pos);
    this.scene.add(light);

    // Shockwave expansion ring
    const ringGeo = new THREE.RingGeometry(radius * 0.1, radius * 0.35, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.copy(pos);
    ringMesh.position.y += 0.08;
    this.scene.add(ringMesh);

    this.explosions.push({
      pos: pos.clone(),
      radius: radius * 0.4,
      maxRadius: radius,
      age: 0,
      maxAge: 0.5,
      mesh,
      light,
      ringMesh,
    });

    // Particle burst
    for (let i = 0; i < 25; i++) {
      this.smokeParticles.push({
        pos: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * radius * 0.5,
          (Math.random() - 0.5) * radius * 0.5,
          (Math.random() - 0.5) * radius * 0.5
        )),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          Math.random() * 6 + 2,
          (Math.random() - 0.5) * 8
        ),
        age: 0,
        maxAge: 0.6 + Math.random() * 0.4,
        size: 0.2 + Math.random() * 0.25,
      });
    }
  }

  // ==========================================
  // FRAME UPDATE LOOP
  // ==========================================
  public update(
    dt: number,
    dummies: TargetDummy[],
    playerRotationY: number,
    setPlayerRotationY: (ry: number) => void
  ): void {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }

    // Process Concentrated Blast Charging
    if (this.isChargingHeavyBlast) {
      this.heavyBlastChargeTimer += dt;
      const chestPos = new THREE.Vector3();
      this.stickman.upperTorso.getWorldPosition(chestPos);
      const chestForward = new THREE.Vector3(-Math.sin(playerRotationY), 0, -Math.cos(playerRotationY));
      const auraPos = chestPos.clone().add(new THREE.Vector3(0, 0.2, 0)).addScaledVector(chestForward, 0.35);

      if (this.chargeMesh && this.chargeLight) {
        this.chargeMesh.position.copy(auraPos);
        this.chargeLight.position.copy(auraPos);
        const p = this.heavyBlastChargeTimer / this.heavyBlastChargeDuration;
        const scale = 0.25 + p * 0.70 + (Math.random() - 0.5) * 0.08;
        this.chargeMesh.scale.set(scale, scale, scale);
        this.chargeLight.intensity = p * 4.5;
      }

      if (this.heavyBlastChargeTimer >= this.heavyBlastChargeDuration) {
        this.isChargingHeavyBlast = false;
        if (this.chargeMesh) this.chargeMesh.visible = false;
        if (this.chargeLight) this.chargeLight.intensity = 0;
        this.launchConcentratedBlast();
      }
    }

    const activeColor = this.customPowerColor ? new THREE.Color(this.customPowerColor) : null;
    if (activeColor) {
      if (this.leftBeamMesh) (this.leftBeamMesh.material as THREE.LineBasicMaterial).color.copy(activeColor);
      if (this.rightBeamMesh) (this.rightBeamMesh.material as THREE.LineBasicMaterial).color.copy(activeColor);
      if (this.leftBeamGlow) (this.leftBeamGlow.material as THREE.MeshBasicMaterial).color.copy(activeColor);
      if (this.rightBeamGlow) (this.rightBeamGlow.material as THREE.MeshBasicMaterial).color.copy(activeColor);
      if (this.leftLaserMesh) (this.leftLaserMesh.material as THREE.MeshBasicMaterial).color.copy(activeColor);
      if (this.rightLaserMesh) (this.rightLaserMesh.material as THREE.MeshBasicMaterial).color.copy(activeColor);
    }

    // 0. Update externally installed ability modules
    if (this.repulsorModule && typeof this.repulsorModule.update === 'function') {
      try {
        this.repulsorModule.update(dt, dummies);
      } catch (err) {
        console.warn('[IronManAbilities] repulsor module update failed:', err);
      }
    }

    if (this.dualBeamsModule) {
      try {
        this.dualBeamsModule.update(dt, dummies);
        this.isDualBeamActive = this.dualBeamsModule.isActive;
      } catch (err) {
        console.warn('[IronManAbilities] dual beam module update failed:', err);
      }
    }

    if (this.spinningLasersModule) {
      try {
        this.spinningLasersModule.update(dt, dummies);
        this.isSpinningLasersActive = this.spinningLasersModule.isActive;
      } catch (err) {
        console.warn('[IronManAbilities] spinning lasers module update failed:', err);
      }
    }

    // 1. Update Repulsors
    for (let i = this.repulsors.length - 1; i >= 0; i--) {
      const r = this.repulsors[i];
      if (r.target && !r.target.isDead && r.homingStrength > 0) {
        const dest = r.target.getCenter();
        const dir = dest.clone().sub(r.pos).normalize();
        r.vel.lerp(dir.multiplyScalar(activeIronManConfig.repulsor.speed), dt * r.homingStrength);
      }

      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      r.mesh.lookAt(r.pos.clone().add(r.vel));

      // Hit check against dummies
      let hit = false;
      for (const d of dummies) {
        if (d.isDead) continue;
        if (r.pos.distanceTo(d.getCenter()) <= d.radius + 0.3) {
          hit = true;
          this.onDamageDealt(d, activeIronManConfig.repulsor.damage, r.pos.clone());
          this.createExplosion(r.pos, 1.2, 0xff2233);
          audioSystem.playImpact();
          break;
        }
      }

      if (!hit && (r.pos.y <= 0.05 || r.pos.distanceTo(r.startPos) > r.maxRange)) {
        hit = true;
        this.createExplosion(r.pos, 0.8, 0xff3344);
        audioSystem.playImpact();
      }

      if (hit) {
        this.scene.remove(r.mesh);
        this.repulsors.splice(i, 1);
      }
    }

    // 2. Update Bézier Missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t += dt / m.duration;

      if (m.t < 0) continue; // Waiting start delay

      if (m.t >= 1.0) {
        // Impact!
        const hitPos = m.p3.clone();
        hitPos.y = Math.max(0.2, hitPos.y);

        if (m.isHeavy) {
          // Bunker-Buster / Smart Heavy Missile: 55 AoE damage in 5m blast radius (compact & proportional)
          const aoeRadius = 5.0;
          this.createExplosion(hitPos, aoeRadius, 0xff4500);
          audioSystem.playExplosion();
          this.onShake(0.18);
          this.hitStopTimer = 0.055; // 55ms impact hit-stop

          const damagedSet = new Set<number>();
          for (const d of dummies) {
            if (d.isDead || damagedSet.has(d.id)) continue;
            const dist = d.getCenter().distanceTo(hitPos);
            if (dist <= aoeRadius) {
              damagedSet.add(d.id);
              const kbDir = d.getCenter().sub(hitPos).normalize().multiplyScalar(10);
              kbDir.y = 2.5;
              this.onDamageDealt(d, activeIronManConfig.unibeam.damage, d.getCenter(), kbDir);
            }
          }
        } else {
          // Curved Volley Missile: 12 damage in 4 radius AoE
          const aoeRadius = 4.0;
          this.createExplosion(hitPos, aoeRadius, 0xff7700);
          audioSystem.playExplosion();
          this.onShake(0.12);

          const hitDummies = new Set<number>();
          for (const d of dummies) {
            if (d.isDead || hitDummies.has(d.id)) continue;
            if (d.getCenter().distanceTo(hitPos) <= aoeRadius) {
              hitDummies.add(d.id);
              const kbDir = d.getCenter().sub(hitPos).normalize().multiplyScalar(6);
              kbDir.y = 1.5;
              this.onDamageDealt(d, activeIronManConfig.microMissiles.damagePerMissile, d.getCenter(), kbDir);
            }
          }
        }

        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
        continue;
      }

      // Cubic Bézier curve evaluation: B(t) = (1-t)³ P0 + 3(1-t)²t P1 + 3(1-t)t² P2 + t³ P3
      const u = m.t;
      const invU = 1 - u;
      const pos = new THREE.Vector3()
        .addScaledVector(m.p0, invU * invU * invU)
        .addScaledVector(m.p1, 3 * invU * invU * u)
        .addScaledVector(m.p2, 3 * invU * u * u)
        .addScaledVector(m.p3, u * u * u);

      // Tangent direction for orientation
      const tangent = new THREE.Vector3()
        .addScaledVector(m.p1.clone().sub(m.p0), 3 * invU * invU)
        .addScaledVector(m.p2.clone().sub(m.p1), 6 * invU * u)
        .addScaledVector(m.p3.clone().sub(m.p2), 3 * u * u)
        .normalize();

      m.mesh.position.copy(pos);
      m.mesh.lookAt(pos.clone().add(tangent));

      // Smoke trail
      m.trailTimer += dt;
      if (m.trailTimer > 0.04) {
        m.trailTimer = 0;
        this.smokeParticles.push({
          pos: pos.clone(),
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.5, (Math.random() - 0.5) * 0.4),
          age: 0,
          maxAge: 0.45,
          size: m.isHeavy ? 0.35 : 0.16,
        });
      }
    }

    // 3. Update Dual Beam & Beam Clash
    if (this.isDualBeamActive && !this.dualBeamsModule) {
      this.dualBeamTimer += dt;
      if (this.dualBeamTimer >= this.dualBeamMaxDuration) {
        this.stopDualBeam();
      } else {
        const leftHandPos = new THREE.Vector3();
        const rightHandPos = new THREE.Vector3();
        this.stickman.leftHand.getWorldPosition(leftHandPos);
        this.stickman.rightHand.getWorldPosition(rightHandPos);

        const aim = this.getAimDestination();
        const maxRange = activeIronManConfig.dualBeams.range;

        let endPoint = aim.pos.clone();
        const midHand = leftHandPos.clone().add(rightHandPos).multiplyScalar(0.5);
        if (midHand.distanceTo(endPoint) > maxRange) {
          const dir = endPoint.clone().sub(midHand).normalize();
          endPoint = midHand.clone().addScaledVector(dir, maxRange);
        }

        // Check if aiming at any target dummy / enemy to initiate Beam Clash!
        let clashTarget: TargetDummy | null = null;
        for (const d of dummies) {
          if (!d.isDead && d.rivalCooldown <= 0) {
            const dCenter = d.getCenter();
            if (midHand.distanceTo(dCenter) <= maxRange) {
              const segDist = this.distPointToSegment(dCenter, midHand, endPoint);
              if (segDist <= d.radius + 1.2 || (aim.target && aim.target.id === d.id)) {
                clashTarget = d;
                break;
              }
            }
          }
        }

        if (clashTarget) {
          if (!this.clashState.active) {
            // Initiate BEAM CLASH!
            this.clashState.active = true;
            this.clashState.rival = clashTarget;
            this.clashState.progress = 0.5;
            this.clashState.duration = 0;
            clashTarget.rivalBeamActive = true;
            this.clashSphere!.visible = true;
            this.rivalBeamMesh!.visible = true;
            this.rivalBeamGlow!.visible = true;
            audioSystem.playBeamClash();
          }

          // Beam Clash active update
          this.clashState.duration += dt;
          // Target pushes back steadily
          this.clashState.progress = Math.max(0, this.clashState.progress - dt * 0.09);

          // Shared clash point interpolated along the distance
          const rivalHandPos = clashTarget.getCenter();
          this.clashState.clashPoint.lerpVectors(midHand, rivalHandPos, 1 - this.clashState.progress);

          endPoint.copy(this.clashState.clashPoint);

          // Update Rival Beam
          this.updateBeamMesh(this.rivalBeamMesh!, this.rivalBeamGlow!, rivalHandPos, this.clashState.clashPoint, 0.18);

          // Update Clash sphere
          this.clashSphere!.position.copy(this.clashState.clashPoint);
          const pulse = 0.55 + Math.sin(performance.now() * 0.02) * 0.15;
          this.clashSphere!.scale.set(pulse, pulse, pulse);
          this.onShake(0.04);

          if (this.clashState.duration >= this.clashState.maxDuration) {
            this.resolveClash(this.clashState.progress > 0.5);
          }
        } else if (this.clashState.active) {
          this.resolveClash(false);
        }

        // Render player dual beams
        this.leftBeamMesh!.visible = true;
        this.rightBeamMesh!.visible = true;
        this.leftBeamGlow!.visible = true;
        this.rightBeamGlow!.visible = true;

        this.updateBeamMesh(this.leftBeamMesh!, this.leftBeamGlow!, leftHandPos, endPoint, 0.12);
        this.updateBeamMesh(this.rightBeamMesh!, this.rightBeamGlow!, rightHandPos, endPoint, 0.12);

        // Apply sustained tick damage: 5 damage every 0.25 seconds to target/closest dummy only (others do not react)
        this.dualBeamDamageTimer += dt;
        if (this.dualBeamDamageTimer >= 0.25) {
          this.dualBeamDamageTimer = 0;
          let targetDummy: TargetDummy | null = null;
          if (aim.target && !aim.target.isDead) {
            const dist = this.distPointToSegment(aim.target.getCenter(), midHand, endPoint);
            if (dist <= aim.target.radius + 0.6) {
              targetDummy = aim.target;
            }
          }
          if (!targetDummy) {
            let minDist = Infinity;
            for (const d of dummies) {
              if (d.isDead) continue;
              const dist = this.distPointToSegment(d.getCenter(), midHand, endPoint);
              if (dist <= d.radius + 0.5 && dist < minDist) {
                minDist = dist;
                targetDummy = d;
              }
            }
          }
          if (targetDummy) {
            this.onDamageDealt(targetDummy, activeIronManConfig.dualBeams.dps * 0.25, targetDummy.getCenter());
          }
        }
      }
    }

    // 4. Update Spinning Lasers (Dual cutting lasers sweep full 360° independently of movement)
    if (this.isSpinningLasersActive && !this.spinningLasersModule) {
      this.spinningLaserTimer += dt;
      if (this.spinningLaserTimer >= this.spinningLaserDuration) {
        this.isSpinningLasersActive = false;
        this.leftLaserMesh!.visible = false;
        this.rightLaserMesh!.visible = false;
      } else {
        // Continuous character spin rotation (independent of movement vector, duration 1.5s)
        const spinSpeed = (Math.PI * 4.0) / this.spinningLaserDuration;
        this.spinningAngle += spinSpeed * dt;
        setPlayerRotationY(this.spinningAngle);

        const leftHandPos = new THREE.Vector3();
        const rightHandPos = new THREE.Vector3();
        this.stickman.leftHand.getWorldPosition(leftHandPos);
        this.stickman.rightHand.getWorldPosition(rightHandPos);

        // Character right & left direction vectors in world space based on independent spinningAngle
        const leftDir = new THREE.Vector3(-Math.cos(this.spinningAngle), 0, Math.sin(this.spinningAngle)).normalize();
        const rightDir = leftDir.clone().negate();

        // Laser starts slightly offset outward from each hand tip ("distante da mão / ponta da mão")
        const laserStartOffset = 0.45;
        const leftStart = leftHandPos.clone().addScaledVector(leftDir, laserStartOffset);
        const rightStart = rightHandPos.clone().addScaledVector(rightDir, laserStartOffset);

        const laserLength = activeIronManConfig.spinningLasers.radius;
        const leftEnd = leftStart.clone().addScaledVector(leftDir, laserLength);
        const rightEnd = rightStart.clone().addScaledVector(rightDir, laserLength);

        // Align laser cylinders
        this.orientLaser(this.leftLaserMesh!, leftStart, leftEnd);
        this.orientLaser(this.rightLaserMesh!, rightStart, rightEnd);

        // Slice each dummy within radius for 18 damage (reduced damage per hit) with cutting impact effects
        for (const d of dummies) {
          if (d.isDead) continue;
          if (this.slicedDummiesThisCast.has(d.id)) continue;

          const dCenter = d.getCenter();
          const distL = this.distPointToSegment(dCenter, leftStart, leftEnd);
          const distR = this.distPointToSegment(dCenter, rightStart, rightEnd);

          if (distL <= d.radius + 0.4 || distR <= d.radius + 0.4) {
            this.slicedDummiesThisCast.add(d.id);
            const kb = dCenter.clone().sub(leftHandPos).normalize().multiplyScalar(6);
            kb.y = 1.2;
            this.onDamageDealt(d, activeIronManConfig.spinningLasers.damage, dCenter, kb);
            this.createExplosion(dCenter, 1.2, 0xff0044);
            audioSystem.playImpact();
            this.onShake(0.04);
          }
        }
      }
    }

    // 5. Update Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.age += dt;
      const progress = exp.age / exp.maxAge;
      if (progress >= 1.0) {
        this.scene.remove(exp.mesh);
        this.scene.remove(exp.light);
        if (exp.ringMesh) this.scene.remove(exp.ringMesh);
        this.explosions.splice(i, 1);
      } else {
        const curRadius = exp.radius + (exp.maxRadius - exp.radius) * Math.sin(progress * Math.PI * 0.5);
        exp.mesh.scale.set(curRadius, curRadius, curRadius);
        (exp.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.8;
        exp.light.intensity = (1 - progress) * 5;

        if (exp.ringMesh) {
          const rScale = 1.0 + progress * 2.6;
          exp.ringMesh.scale.set(rScale, rScale, rScale);
          (exp.ringMesh.material as THREE.MeshBasicMaterial).opacity = (1 - progress) * 0.85;
        }
      }
    }

    // 6. Update Smoke Particles
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.smokeParticles.splice(i, 1);
      } else {
        p.pos.addScaledVector(p.vel, dt);
      }
    }

    const sCount = Math.min(this.smokeParticles.length, 150);
    this.smokeInstancedMesh.count = sCount;
    for (let i = 0; i < sCount; i++) {
      const p = this.smokeParticles[i];
      const scale = (1 - p.age / p.maxAge) * p.size;
      this.dummyMatrix.makeTranslation(p.pos.x, p.pos.y, p.pos.z);
      this.dummyMatrix.scale(new THREE.Vector3(scale, scale, scale));
      this.smokeInstancedMesh.setMatrixAt(i, this.dummyMatrix);
    }
    if (sCount > 0) {
      this.smokeInstancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  private updateBeamMesh(
    line: THREE.Line,
    glow: THREE.Mesh,
    start: THREE.Vector3,
    end: THREE.Vector3,
    thickness: number
  ): void {
    const geom = line.geometry as THREE.BufferGeometry;
    geom.setFromPoints([start, end]);

    const dist = start.distanceTo(end);
    const mid = start.clone().add(end).multiplyScalar(0.5);

    glow.position.copy(mid);
    glow.scale.set(thickness, dist, thickness);
    glow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  }

  private orientLaser(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3): void {
    const dist = start.distanceTo(end);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mesh.position.copy(mid);
    mesh.scale.set(1, dist / 14, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  }

  private distPointToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const ab = b.clone().sub(a);
    const ap = p.clone().sub(a);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
    const closest = a.clone().addScaledVector(ab, t);
    return closest.distanceTo(p);
  }

  public dispose(): void {
    this.setRepulsorModule(null);
    this.setMicroMissilesModule(null);
    this.setUnibeamModule(null);
    this.setDualBeamsModule(null);
    this.setSpinningLasersModule(null);
    for (const r of this.repulsors) this.scene.remove(r.mesh);
    this.repulsors = [];
    for (const m of this.missiles) this.scene.remove(m.mesh);
    this.missiles = [];
    for (const e of this.explosions) {
      this.scene.remove(e.mesh);
      this.scene.remove(e.light);
      if (e.ringMesh) this.scene.remove(e.ringMesh);
    }
    this.explosions = [];
    this.smokeParticles = [];
    if (this.chargeMesh) this.scene.remove(this.chargeMesh);
    if (this.chargeLight) this.scene.remove(this.chargeLight);
    if (this.leftBeamMesh) this.scene.remove(this.leftBeamMesh);
    if (this.rightBeamMesh) this.scene.remove(this.rightBeamMesh);
    if (this.leftBeamGlow) this.scene.remove(this.leftBeamGlow);
    if (this.rightBeamGlow) this.scene.remove(this.rightBeamGlow);
    if (this.rivalBeamMesh) this.scene.remove(this.rivalBeamMesh);
    if (this.rivalBeamGlow) this.scene.remove(this.rivalBeamGlow);
    if (this.clashSphere) this.scene.remove(this.clashSphere);
    if (this.leftLaserMesh) this.scene.remove(this.leftLaserMesh);
    if (this.rightLaserMesh) this.scene.remove(this.rightLaserMesh);
    this.scene.remove(this.smokeInstancedMesh);
    this.clashState.active = false;
    this.isDualBeamActive = false;
    this.isSpinningLasersActive = false;
    this.isChargingHeavyBlast = false;
  }
}
