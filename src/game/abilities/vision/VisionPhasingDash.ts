/**
 * VisionPhasingDash.ts
 * A horizontal intangibility burst: Vision accelerates through solid geometry
 * for a short interval, leaving yellow speed streaks, then restores collision.
 * The gameplay loop owns the actual movement and destination validation.
 */

import * as THREE from 'three';
import { StickmanNodes } from '../../StickmanRig';
import { activeVisionConfig } from './VisionConfig';

type AimProvider = () => { pos: THREE.Vector3; target: unknown | null };

const UP = new THREE.Vector3(0, 1, 0);

export interface PhasingDashStep {
  distanceDelta: number;
  progress: number;
  done: boolean;
}

export class VisionPhasingDash {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAim: AimProvider;

  private active = false;
  private elapsed = 0;
  private travelled = 0;
  private cooldownRemaining = 0;
  private direction = new THREE.Vector3(0, 0, -1);

  private visual = new THREE.Group();
  private streaks: THREE.Mesh[] = [];
  private streakMaterial: THREE.MeshBasicMaterial;
  private light: THREE.PointLight;

  constructor(scene: THREE.Scene, stickman: StickmanNodes, getAim: AimProvider) {
    this.scene = scene;
    this.stickman = stickman;
    this.getAim = getAim;

    const config = activeVisionConfig.phasingDash;
    this.streakMaterial = new THREE.MeshBasicMaterial({
      color: config.streakColor,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new THREE.CylinderGeometry(0.012, 0.012, 1.8, 6, 1, true);
    for (let i = 0; i < Math.max(4, config.streakCount); i++) {
      const streak = new THREE.Mesh(geometry, this.streakMaterial);
      streak.position.set(
        THREE.MathUtils.randFloatSpread(1.15),
        THREE.MathUtils.randFloat(-2.2, 0.2),
        THREE.MathUtils.randFloatSpread(0.9)
      );
      this.streaks.push(streak);
      this.visual.add(streak);
    }
    this.light = new THREE.PointLight(config.streakColor, 0, 4.2, 2);
    this.light.position.y = 1.0;
    this.visual.add(this.light);
    this.visual.visible = false;
    this.scene.add(this.visual);
  }

  public get isActive(): boolean {
    return this.active;
  }

  public get cooldown(): number {
    return this.cooldownRemaining;
  }

  public get dashDirection(): THREE.Vector3 {
    return this.direction.clone();
  }

  public trigger(playerPos: THREE.Vector3): boolean {
    if (this.active || this.cooldownRemaining > 0) return false;
    const config = activeVisionConfig.phasingDash;
    const aim = this.getAim();
    const flat = aim.pos.clone().sub(playerPos);
    flat.y = 0;
    if (flat.lengthSq() < 0.0001) {
      flat.set(0, 0, -1).applyQuaternion(this.stickman.root.quaternion);
    }
    this.direction.copy(flat.normalize());
    this.active = true;
    this.elapsed = 0;
    this.travelled = 0;
    this.cooldownRemaining = Math.max(0.2, config.cooldown);
    this.visual.visible = true;
    this.light.intensity = 1.2;
    return true;
  }

  public advance(dt: number, playerPos: THREE.Vector3): PhasingDashStep {
    if (!this.active) return { distanceDelta: 0, progress: 1, done: true };
    const config = activeVisionConfig.phasingDash;
    this.elapsed += dt;
    const progress = THREE.MathUtils.clamp(this.elapsed / Math.max(0.05, config.duration), 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const targetDistance = config.distance * eased;
    const distanceDelta = Math.max(0, targetDistance - this.travelled);
    this.travelled = targetDistance;
    this.updateVisual(playerPos, progress, config.streakColor, dt);
    return { distanceDelta, progress, done: progress >= 1 };
  }

  public complete(): void {
    this.active = false;
    this.elapsed = 0;
    this.travelled = 0;
    this.visual.visible = false;
    this.light.intensity = 0;
  }

  public updateCooldown(dt: number): void {
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
  }

  public resetCooldown(): void {
    this.cooldownRemaining = 0;
  }

  private updateVisual(playerPos: THREE.Vector3, progress: number, color: number, dt: number): void {
    const config = activeVisionConfig.phasingDash;
    this.streakMaterial.color.setHex(color);
    this.light.color.setHex(color);
    this.visual.position.copy(playerPos).add(new THREE.Vector3(0, 1.0, 0));
    this.visual.quaternion.setFromUnitVectors(UP, this.direction);
    const pulse = 0.45 + Math.sin(progress * Math.PI) * 0.35;
    this.streakMaterial.opacity = pulse;
    this.light.intensity = 0.8 + Math.sin(progress * Math.PI) * 0.9;
    const speed = THREE.MathUtils.lerp(
      Math.max(1, config.minSpeed),
      Math.max(config.minSpeed, config.maxSpeed),
      0.35 + 0.65 * Math.sin(progress * Math.PI)
    );
    this.streaks.forEach((streak, index) => {
      streak.position.y -= speed * dt * (0.8 + (index % 4) * 0.08);
      if (streak.position.y < -2.8) {
        streak.position.y = 0.5 + (index % 3) * 0.25;
        streak.position.x = THREE.MathUtils.randFloatSpread(1.15);
        streak.position.z = THREE.MathUtils.randFloatSpread(0.9);
      }
    });
  }

  public dispose(): void {
    this.complete();
    this.scene.remove(this.visual);
    for (const streak of this.streaks) {
      streak.geometry.dispose();
    }
    this.streakMaterial.dispose();
  }
}
