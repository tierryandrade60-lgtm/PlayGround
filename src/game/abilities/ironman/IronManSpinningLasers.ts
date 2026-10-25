/**
 * IronManSpinningLasers.ts
 * Modular 360-degree dual cutting laser ability.
 *
 * Duration, radius, damage and one-hit-per-cast behaviour match the previous
 * implementation exactly.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { soundSystem } from '../../systems/SoundSystem';
import { activeIronManConfig } from './IronManConfig';
import { worldCollision } from '../../systems/WorldCollision';

export class IronManSpinningLasers {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private onDamageDealt: (
    dummy: TargetDummy,
    damage: number,
    hitPosition: THREE.Vector3,
    knockback?: THREE.Vector3
  ) => void;
  private onShake: (amount: number) => void;
  private setPlayerRotationY: (rotation: number) => void;
  private onImpact: (position: THREE.Vector3, radius: number, color?: number) => void;

  private active = false;
  private timer = 0;
  private duration = 1.5;
  private angle = 0;
  private sliced = new Set<number>();

  private leftLaser: THREE.Mesh;
  private rightLaser: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    onDamageDealt: (
      dummy: TargetDummy,
      damage: number,
      hitPosition: THREE.Vector3,
      knockback?: THREE.Vector3
    ) => void,
    onShake: (amount: number) => void,
    setPlayerRotationY: (rotation: number) => void,
    onImpact: (position: THREE.Vector3, radius: number, color?: number) => void
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.onDamageDealt = onDamageDealt;
    this.onShake = onShake;
    this.setPlayerRotationY = setPlayerRotationY;
    this.onImpact = onImpact;

    const geometry = new THREE.CylinderGeometry(0.045, 0.045, 14, 8, 1, true);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.leftLaser = new THREE.Mesh(geometry, material);
    this.rightLaser = new THREE.Mesh(geometry.clone(), material.clone());
    this.leftLaser.visible = false;
    this.rightLaser.visible = false;
    this.scene.add(this.leftLaser, this.rightLaser);
  }

  public get isActive(): boolean {
    return this.active;
  }

  public trigger(currentRotationY: number): void {
    this.active = true;
    this.timer = 0;
    this.duration = Math.max(0.1, activeIronManConfig.spinningLasers.duration);
    this.angle = currentRotationY;
    this.sliced.clear();
    this.leftLaser.visible = true;
    this.rightLaser.visible = true;
    soundSystem.playLaserSpin();
    this.onShake(0.06);
  }

  public stop(): void {
    this.active = false;
    soundSystem.stopLaserSpin?.();
    this.leftLaser.visible = false;
    this.rightLaser.visible = false;
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    if (!this.active) return;

    this.timer += dt;
    if (this.timer >= this.duration) {
      this.stop();
      return;
    }

    const spinSpeed = (Math.PI * 4) / this.duration;
    this.angle += spinSpeed * dt;
    this.setPlayerRotationY(this.angle);

    const leftHand = new THREE.Vector3();
    const rightHand = new THREE.Vector3();
    this.stickman.leftHand.getWorldPosition(leftHand);
    this.stickman.rightHand.getWorldPosition(rightHand);

    const leftDirection = new THREE.Vector3(
      -Math.cos(this.angle),
      0,
      Math.sin(this.angle)
    ).normalize();
    const rightDirection = leftDirection.clone().negate();

    const startOffset = 0.45;
    const leftStart = leftHand.clone().addScaledVector(leftDirection, startOffset);
    const rightStart = rightHand.clone().addScaledVector(rightDirection, startOffset);

    const config = activeIronManConfig.spinningLasers;
    const length = config.radius;
    let leftEnd = leftStart.clone().addScaledVector(leftDirection, length);
    let rightEnd = rightStart.clone().addScaledVector(rightDirection, length);

    if (config.collideWithWorld !== false) {
      const leftHit = worldCollision.segmentHit(leftStart, leftEnd, 0.12);
      if (leftHit) leftEnd = leftHit.point.clone();
      const rightHit = worldCollision.segmentHit(rightStart, rightEnd, 0.12);
      if (rightHit) rightEnd = rightHit.point.clone();
    }

    this.orientLaser(this.leftLaser, leftStart, leftEnd);
    this.orientLaser(this.rightLaser, rightStart, rightEnd);

    for (const dummy of dummies) {
      if (dummy.isDead || this.sliced.has(dummy.id)) continue;
      const center = dummy.getCenter();
      const leftDistance = this.distanceToSegment(center, leftStart, leftEnd);
      const rightDistance = this.distanceToSegment(center, rightStart, rightEnd);

      if (leftDistance <= dummy.radius + 0.4 || rightDistance <= dummy.radius + 0.4) {
        this.sliced.add(dummy.id);
        const knockback = center.clone().sub(leftHand).normalize().multiplyScalar(6);
        knockback.y = 1.2;
        this.onDamageDealt(
          dummy,
          activeIronManConfig.spinningLasers.damage,
          center,
          knockback
        );
        this.onImpact(center, 1.2, 0xff0044);
        soundSystem.playImpact();
        this.onShake(0.04);
      }
    }
  }

  private orientLaser(mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3): void {
    const distance = start.distanceTo(end);
    const middle = start.clone().add(end).multiplyScalar(0.5);
    mesh.position.copy(middle);
    mesh.scale.set(1, distance / 14, 1);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.clone().sub(start).normalize()
    );
  }

  private distanceToSegment(
    point: THREE.Vector3,
    start: THREE.Vector3,
    end: THREE.Vector3
  ): number {
    const segment = end.clone().sub(start);
    const offset = point.clone().sub(start);
    const lengthSq = segment.lengthSq();
    if (lengthSq <= 0.000001) return point.distanceTo(start);
    const t = THREE.MathUtils.clamp(offset.dot(segment) / lengthSq, 0, 1);
    return start.clone().addScaledVector(segment, t).distanceTo(point);
  }

  public dispose(): void {
    this.stop();
    this.scene.remove(this.leftLaser, this.rightLaser);
    this.leftLaser.geometry.dispose();
    this.rightLaser.geometry.dispose();
    (this.leftLaser.material as THREE.Material).dispose();
    (this.rightLaser.material as THREE.Material).dispose();
  }
}
