/**
 * AgathaChaosOrb.ts
 * Ability 2 Module for Agatha Harkness: Chaos Orb / Runic Detonation.
 * Launches a high-damage slow-moving occult sphere that explodes on contact or max range,
 * inflicting radial area-of-effect damage to all nearby target dummies.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeAgathaConfig } from './AgathaConfig';

export interface ChaosOrbInstance {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  startPos: THREE.Vector3;
  maxRange: number;
  target: TargetDummy | null;
  homingStrength: number;
  isDead: boolean;
}

export class AgathaChaosOrb {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAimDestination: () => { pos: THREE.Vector3; target: TargetDummy | null };
  private onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void;
  private onShake: (amount: number) => void;

  private orbs: ChaosOrbInstance[] = [];

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
  }

  public fire(): boolean {
    const cfg = activeAgathaConfig.chaosOrb;

    const handPos = new THREE.Vector3();
    this.stickman.rightHand.getWorldPosition(handPos);

    const aim = this.getAimDestination();
    const dir = aim.pos.clone().sub(handPos).normalize();

    const group = new THREE.Group();

    // Central pulsing dark magic core
    const coreGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x7e22ce });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Glowing ethereal corona
    const coronaGeo = new THREE.SphereGeometry(0.75, 16, 16);
    const coronaMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    });
    const corona = new THREE.Mesh(coronaGeo, coronaMat);
    group.add(corona);

    // Orbiting dark runes
    const ringGeo = new THREE.TorusGeometry(0.85, 0.05, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b0764 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    group.add(ring);

    const light = new THREE.PointLight(0xa855f7, 4.0, 8.0);
    group.add(light);

    group.position.copy(handPos);
    this.scene.add(group);

    this.orbs.push({
      mesh: group,
      pos: handPos,
      vel: dir.multiplyScalar(cfg.speed),
      startPos: handPos.clone(),
      maxRange: cfg.maxRange,
      target: aim.target,
      homingStrength: aim.target ? cfg.homingStrength : 0,
      isDead: false,
    });

    audioSystem.playAttackCast?.();
    this.onShake(cfg.shakeAmount);
    return true;
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    const cfg = activeAgathaConfig.chaosOrb;

    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      if (orb.isDead) {
        this.scene.remove(orb.mesh);
        this.orbs.splice(i, 1);
        continue;
      }

      // Smooth tracking towards target
      if (orb.target && !orb.target.isDead) {
        const toTarget = orb.target.getCenter().sub(orb.pos).normalize();
        orb.vel.lerp(toTarget.multiplyScalar(cfg.speed), Math.min(1.0, dt * orb.homingStrength));
      }

      orb.pos.add(orb.vel.clone().multiplyScalar(dt));
      orb.mesh.position.copy(orb.pos);
      orb.mesh.rotation.y += dt * 3.0;

      // Distance expiration triggers detonation
      if (orb.pos.distanceTo(orb.startPos) > orb.maxRange || orb.pos.y < -1.5) {
        this.detonate(orb, dummies);
        continue;
      }

      // Direct impact check
      for (const dummy of dummies) {
        if (dummy.isDead) continue;
        if (orb.pos.distanceTo(dummy.getCenter()) < 1.6) {
          this.detonate(orb, dummies, dummy);
          break;
        }
      }
    }
  }

  private detonate(orb: ChaosOrbInstance, dummies: TargetDummy[], directHitTarget?: TargetDummy): void {
    const cfg = activeAgathaConfig.chaosOrb;
    orb.isDead = true;
    this.scene.remove(orb.mesh);

    // Visual shockwave ring
    const blastGeo = new THREE.RingGeometry(0.2, cfg.splashRadius, 24);
    const blastMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    const blastMesh = new THREE.Mesh(blastGeo, blastMat);
    blastMesh.rotation.x = Math.PI / 2;
    blastMesh.position.copy(orb.pos);
    this.scene.add(blastMesh);

    // Fade out blast mesh
    let age = 0;
    const fadeBlast = () => {
      age += 0.04;
      blastMesh.scale.addScalar(0.08);
      blastMat.opacity = Math.max(0, 0.9 - age * 2.0);
      if (age < 0.45) {
        requestAnimationFrame(fadeBlast);
      } else {
        this.scene.remove(blastMesh);
        blastGeo.dispose();
        blastMat.dispose();
      }
    };
    fadeBlast();

    audioSystem.playImpact?.();
    this.onShake(0.06);

    // Splash damage to all dummies within radius
    for (const dummy of dummies) {
      if (dummy.isDead) continue;
      const dCenter = dummy.getCenter();
      const dist = orb.pos.distanceTo(dCenter);
      if (dist <= cfg.splashRadius) {
        const falloff = 1.0 - dist / cfg.splashRadius;
        const dmg = Math.round(cfg.splashDamage * falloff + (dummy === directHitTarget ? cfg.directDamage : 0));
        const kbDir = dCenter.clone().sub(orb.pos).normalize();
        kbDir.y += 0.6;
        const knockback = kbDir.multiplyScalar(6.0 * falloff);
        this.onDamageDealt(dummy, dmg, dCenter, knockback);
      }
    }
  }

  public dispose(): void {
    for (const orb of this.orbs) {
      this.scene.remove(orb.mesh);
    }
    this.orbs = [];
  }
}
