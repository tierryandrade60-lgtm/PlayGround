/**
 * VisionHeadGrip.ts
 * Close-range cinematic grab: Vision validates a target in front of him,
 * anchors it in place, cradles its head with both hands and locks the pair
 * into a protected, immobile state for a configurable duration.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { worldCollision } from '../../systems/WorldCollision';
import { activeVisionConfig } from './VisionConfig';

type AimProvider = () => { pos: THREE.Vector3; target: TargetDummy | null };

const SOURCE = 'vision-head-grip';

export class VisionHeadGrip {
  private stickman: StickmanNodes;
  private getAim: AimProvider;
  private onShake: (amount: number) => void;

  private active = false;
  private elapsed = 0;
  private duration = 0;
  private forward = new THREE.Vector3(0, 0, -1);
  private target: TargetDummy | null = null;

  constructor(
    stickman: StickmanNodes,
    getAim: AimProvider,
    onShake: (amount: number) => void
  ) {
    this.stickman = stickman;
    this.getAim = getAim;
    this.onShake = onShake;
  }

  public get isActive(): boolean {
    return this.active;
  }

  public get grabbedTarget(): TargetDummy | null {
    return this.target;
  }

  public trigger(playerPos: THREE.Vector3, dummies: TargetDummy[]): boolean {
    if (this.active) return false;
    const config = activeVisionConfig.headGrip;
    const aim = this.getAim();
    const flatAim = aim.pos.clone().sub(playerPos);
    flatAim.y = 0;
    if (flatAim.lengthSq() < 0.0001) {
      flatAim.set(0, 0, -1).applyQuaternion(this.stickman.root.quaternion);
    }
    flatAim.normalize();
    const minDot = Math.cos(THREE.MathUtils.degToRad(config.facingAngle));

    let best: TargetDummy | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const eye = playerPos.clone().add(new THREE.Vector3(0, 1.45, 0));
    for (const dummy of dummies) {
      if (dummy.isDead || dummy.isGripped || dummy.isChoked) continue;
      const center = dummy.getCenter();
      const offset = center.clone().sub(playerPos);
      offset.y = 0;
      const distance = offset.length();
      if (distance > config.range || distance >= bestDistance) continue;
      if (offset.lengthSq() < 0.0001) continue;
      if (offset.normalize().dot(flatAim) < minDot) continue;
      if (worldCollision.isSegmentBlocked(eye, dummy.getThroatPosition(), 0.12)) continue;
      best = dummy;
      bestDistance = distance;
    }

    if (!best) return false;

    this.active = true;
    this.elapsed = 0;
    this.duration = Math.max(0.2, config.duration);
    this.forward.copy(flatAim);
    this.target = best;
    this.target.isGripped = true;
    this.target.gripProtected = config.targetProtection;
    this.target.rivalBeamActive = false;
    this.target.rivalCooldown = Math.max(this.target.rivalCooldown, 1.2);
    this.target.setHealthBarVisible(false);

    if (config.playerProtection) {
      gameplayRestrictions.applyRestriction('Invulnerable', SOURCE);
    }
    gameplayRestrictions.applyRestriction('NoMovement', SOURCE);
    gameplayRestrictions.applyRestriction('NoFlight', SOURCE);
    this.onShake(0.11);
    return true;
  }

  public cancel(): boolean {
    if (!this.active) return false;
    const target = this.target;
    this.active = false;
    this.elapsed = 0;
    this.duration = 0;
    this.target = null;
    if (target) {
      target.isGripped = false;
      target.gripProtected = false;
      target.setHealthBarVisible(true);
      const upper = target.group.getObjectByName('DummyUpper');
      if (upper) {
        upper.rotation.x = 0;
        upper.rotation.z = 0;
      }
    }
    gameplayRestrictions.clearRestrictionsBySource(SOURCE);
    this.onShake(0.05);
    return true;
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    if (!this.active || !this.target) return;
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.cancel();
      return;
    }
    if (this.target.isDead || !dummies.includes(this.target)) {
      this.cancel();
      return;
    }

    const config = activeVisionConfig.headGrip;
    const playerPos = this.stickman.root.position;
    const targetPos = playerPos.clone().addScaledVector(this.forward, config.forwardOffset);
    targetPos.y = config.targetLift;
    this.target.group.position.copy(targetPos);
    this.target.group.rotation.y = Math.atan2(-this.forward.x, -this.forward.z);

    const upper = this.target.group.getObjectByName('DummyUpper');
    if (upper) {
      const strain = Math.sin(this.elapsed * 11) * 0.025;
      upper.rotation.x = -0.2 + strain;
      upper.rotation.z = Math.cos(this.elapsed * 9) * 0.035;
    }

    const targetHead = this.target.getCenter().add(new THREE.Vector3(0, 0.55, 0));
    const toHead = targetHead.clone().sub(playerPos).normalize();
    if (toHead.lengthSq() > 0.0001) {
      this.stickman.root.rotation.y = Math.atan2(-toHead.x, -toHead.z);
    }
    this.stickman.root.updateMatrixWorld();
  }

  public dispose(): void {
    this.cancel();
  }
}
