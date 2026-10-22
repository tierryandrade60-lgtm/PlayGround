/**
 * IronManRepulsor.ts
 * Independent Basic Attack Ability Module for Iron Man.
 * Fires alternating plasma repulsor bolts from palm nodes with high velocity and impact sparks.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeIronManConfig } from './IronManConfig';

export interface RepulsorBoltInstance {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  startPos: THREE.Vector3;
  maxRange: number;
  target: TargetDummy | null;
  homingStrength: number;
  isDead: boolean;
}

export class IronManRepulsor {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAimDestination: () => { pos: THREE.Vector3; target: TargetDummy | null };
  private onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void;
  private onShake: (amount: number) => void;
  public onRepulsorFired?: (hand: 'left' | 'right', aimPitch: number) => void;

  private currentHand: 'left' | 'right' = 'right';
  private bolts: RepulsorBoltInstance[] = [];

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
    const cfg = activeIronManConfig.repulsor;
    this.currentHand = this.currentHand === 'right' ? 'left' : 'right';
    const hand = this.currentHand;
    const handNode = hand === 'right' ? this.stickman.rightHand : this.stickman.leftHand;

    const handPos = new THREE.Vector3();
    handNode.getWorldPosition(handPos);

    const aim = this.getAimDestination();
    const dir = aim.pos.clone().sub(handPos).normalize();

    if (this.onRepulsorFired) {
      this.onRepulsorFired(hand, aimPitch);
    }

    const group = new THREE.Group();

    // Laser core cylinder
    const coreGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = Math.PI / 2;
    group.add(core);

    // Cyan plasma aura
    const auraGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10);
    const auraMat = new THREE.MeshBasicMaterial({
      color: cfg.beamColor,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.rotation.x = Math.PI / 2;
    group.add(aura);

    const light = new THREE.PointLight(cfg.beamColor, 3.0, 6.0);
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

    audioSystem.playRepulsor();
    this.onShake(0.02);

    return true;
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    const cfg = activeIronManConfig.repulsor;

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      if (bolt.isDead) {
        this.scene.remove(bolt.mesh);
        this.bolts.splice(i, 1);
        continue;
      }

      if (bolt.target && !bolt.target.isDead) {
        const toTarget = bolt.target.getCenter().sub(bolt.pos).normalize();
        bolt.vel.lerp(toTarget.multiplyScalar(cfg.speed), Math.min(1.0, dt * bolt.homingStrength));
      }

      bolt.pos.add(bolt.vel.clone().multiplyScalar(dt));
      bolt.mesh.position.copy(bolt.pos);
      bolt.mesh.lookAt(bolt.pos.clone().add(bolt.vel));

      if (bolt.pos.distanceTo(bolt.startPos) > bolt.maxRange || bolt.pos.y < -2.0) {
        bolt.isDead = true;
        this.scene.remove(bolt.mesh);
        this.bolts.splice(i, 1);
        continue;
      }

      for (const dummy of dummies) {
        if (dummy.isDead) continue;
        if (bolt.pos.distanceTo(dummy.getCenter()) < 1.35) {
          const knockback = bolt.vel.clone().normalize().multiplyScalar(5.0);
          knockback.y = 2.0;
          this.onDamageDealt(dummy, cfg.damage, bolt.pos.clone(), knockback);
          audioSystem.playImpact();
          this.onShake(0.03);
          bolt.isDead = true;
          this.scene.remove(bolt.mesh);
          this.bolts.splice(i, 1);
          break;
        }
      }
    }
  }

  public dispose(): void {
    for (const b of this.bolts) {
      this.scene.remove(b.mesh);
    }
    this.bolts = [];
  }
}
