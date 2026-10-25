/**
 * AgathaArcaneBlast.ts
 * Independent Basic Attack Ability Module for Agatha Harkness.
 * Fires rapid occult bolts of dark energy alternating between hands with homing physics.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeAgathaConfig } from './AgathaConfig';

export interface ArcaneBoltInstance {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  startPos: THREE.Vector3;
  maxRange: number;
  target: TargetDummy | null;
  homingStrength: number;
  isDead: boolean;
}

export class AgathaArcaneBlast {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAimDestination: () => { pos: THREE.Vector3; target: TargetDummy | null };
  private onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void;
  private onShake: (amount: number) => void;
  public onArcaneCast?: (hand: 'left' | 'right', aimPitch: number) => void;

  private currentHand: 'left' | 'right' = 'right';
  private bolts: ArcaneBoltInstance[] = [];

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

  public fire(aimPitch: number = 0): boolean {
    const cfg = activeAgathaConfig.arcaneBlast;
    this.currentHand = this.currentHand === 'right' ? 'left' : 'right';
    const hand = this.currentHand;
    const handNode = hand === 'right' ? this.stickman.rightHand : this.stickman.leftHand;

    const handPos = new THREE.Vector3();
    handNode.getWorldPosition(handPos);

    const aim = this.getAimDestination();
    const dir = aim.pos.clone().sub(handPos).normalize();

    if (this.onArcaneCast) {
      this.onArcaneCast(hand, aimPitch);
    }

    const group = new THREE.Group();

    // 1. Inner white-violet core line
    const coreGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.8, 10);
    const coreMat = new THREE.MeshBasicMaterial({ color: cfg.coreColor });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = Math.PI / 2;
    group.add(core);

    // 2. Deep glowing violet plasma capsule
    const glowGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.05, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: cfg.glowColor,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = Math.PI / 2;
    group.add(glow);

    // 3. Trailing dark energy ring
    const ringGeo = new THREE.TorusGeometry(0.28, 0.04, 6, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: cfg.ringColor,
      transparent: true,
      opacity: 0.9,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.y = Math.PI / 4;
    group.add(ring);

    // 4. Casting PointLight
    const light = new THREE.PointLight(cfg.lightColor, 3.2, 5.5);
    group.add(light);

    group.position.copy(handPos);
    group.lookAt(handPos.clone().add(dir));
    this.scene.add(group);

    this.bolts.push({
      mesh: group,
      pos: handPos,
      vel: dir.multiplyScalar(cfg.speed),
      startPos: handPos.clone(),
      maxRange: cfg.maxRange,
      target: aim.target,
      homingStrength: aim.target ? cfg.homingStrength : 0,
      isDead: false,
    });

    audioSystem.playArcaneBlast();
    this.onShake(cfg.shakeAmount);

    return true;
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    const cfg = activeAgathaConfig.arcaneBlast;

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      if (bolt.isDead) {
        this.scene.remove(bolt.mesh);
        this.bolts.splice(i, 1);
        continue;
      }

      // Homing toward target dummy
      if (bolt.target && !bolt.target.isDead) {
        const toTarget = bolt.target.getCenter().sub(bolt.pos).normalize();
        bolt.vel.lerp(toTarget.multiplyScalar(cfg.speed), Math.min(1.0, dt * bolt.homingStrength));
      }

      const step = bolt.vel.clone().multiplyScalar(dt);
      bolt.pos.add(step);
      bolt.mesh.position.copy(bolt.pos);
      bolt.mesh.lookAt(bolt.pos.clone().add(bolt.vel));

      // Range check
      if (bolt.pos.distanceTo(bolt.startPos) > bolt.maxRange || bolt.pos.y < -2.0) {
        bolt.isDead = true;
        this.scene.remove(bolt.mesh);
        this.bolts.splice(i, 1);
        continue;
      }

      // Collision detection with dummies
      let hit = false;
      for (const dummy of dummies) {
        if (dummy.isDead) continue;
        const dCenter = dummy.getCenter();
        if (bolt.pos.distanceTo(dCenter) < 1.35) {
          const knockback = bolt.vel.clone().normalize().multiplyScalar(4.5);
          knockback.y = 2.5;
          this.onDamageDealt(dummy, cfg.damage, bolt.pos.clone(), knockback);
          audioSystem.playImpact();
          this.onShake(0.04);
          bolt.isDead = true;
          hit = true;
          break;
        }
      }

      if (hit) {
        this.scene.remove(bolt.mesh);
        this.bolts.splice(i, 1);
      }
    }
  }

  public dispose(): void {
    for (const bolt of this.bolts) {
      this.scene.remove(bolt.mesh);
    }
    this.bolts = [];
  }
}
