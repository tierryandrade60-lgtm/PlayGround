/**
 * VisionSolarBlast.ts
 * Vision's basic attack: a short Mind Stone charge at the forehead, then a
 * compact yellow solar bolt. Projectiles are real fast-moving objects with
 * segment collision against the world and training dummies.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { worldCollision, WorldCollision } from '../../systems/WorldCollision';
import { activeVisionConfig } from './VisionConfig';

type AimProvider = () => { pos: THREE.Vector3; target: TargetDummy | null };
type DamageHandler = (
  dummy: TargetDummy,
  damage: number,
  hitPosition: THREE.Vector3,
  knockback?: THREE.Vector3
) => void;
type ImpactHandler = (position: THREE.Vector3, color: number) => void;

const UP = new THREE.Vector3(0, 1, 0);

interface SolarProjectile {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  light: THREE.PointLight;
  velocity: THREE.Vector3;
  travelled: number;
}

export class VisionSolarBlast {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAim: AimProvider;
  private onDamage: DamageHandler;
  private onImpact: ImpactHandler;
  private onShake: (amount: number) => void;

  private projectiles: SolarProjectile[] = [];
  private cooldownRemaining = 0;
  private elapsed = 0;

  private chargeRemaining = 0;
  private chargeGroup = new THREE.Group();
  private chargeCore: THREE.Mesh;
  private chargeGlow: THREE.Mesh;
  private chargeLight: THREE.PointLight;

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    getAim: AimProvider,
    onDamage: DamageHandler,
    onImpact: ImpactHandler,
    onShake: (amount: number) => void
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.getAim = getAim;
    this.onDamage = onDamage;
    this.onImpact = onImpact;
    this.onShake = onShake;

    const config = activeVisionConfig.solarBlast;
    this.chargeCore = new THREE.Mesh(
      new THREE.SphereGeometry(config.radius * 1.4, 14, 12),
      new THREE.MeshBasicMaterial({
        color: config.coreColor,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.chargeGlow = new THREE.Mesh(
      new THREE.SphereGeometry(config.radius * 3.2, 16, 14),
      new THREE.MeshBasicMaterial({
        color: config.glowColor,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.chargeLight = new THREE.PointLight(config.glowColor, 1.4, 3.4, 2);
    this.chargeGroup.add(this.chargeGlow, this.chargeCore, this.chargeLight);
    this.chargeGroup.visible = false;
    this.scene.add(this.chargeGroup);
  }

  public get isReady(): boolean {
    return this.cooldownRemaining <= 0;
  }

  public get isCharging(): boolean {
    return this.chargeRemaining > 0;
  }

  public fire(): boolean {
    if (this.cooldownRemaining > 0) return false;
    const config = activeVisionConfig.solarBlast;
    this.cooldownRemaining = Math.max(0.05, config.cooldown);
    this.chargeRemaining = Math.max(0.02, config.chargeTime);
    this.positionCharge();
    this.chargeGroup.visible = true;
    return true;
  }

  public cancelCharge(): void {
    this.chargeRemaining = 0;
    this.chargeGroup.visible = false;
  }

  private launchProjectile(): void {
    const config = activeVisionConfig.solarBlast;
    const origin = this.getMindStonePosition();
    const aim = this.getAim();
    let direction = aim.pos.clone().sub(origin);
    if (direction.lengthSq() < 0.0001) {
      direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.stickman.root.quaternion);
    }
    direction.normalize();
    origin.addScaledVector(direction, 0.16);

    const length = 0.42;
    const group = new THREE.Group();
    group.position.copy(origin);

    const coreMaterial = new THREE.MeshBasicMaterial({
      color: config.coreColor,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: config.glowColor,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(config.radius * 0.48, config.radius * 0.22, length, 10, 1, true),
      coreMaterial
    );
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(config.radius * 1.5, config.radius * 0.65, length * 1.65, 10, 1, true),
      glowMaterial
    );
    glow.position.y = -length * 0.22;
    core.renderOrder = 3;
    glow.renderOrder = 2;
    group.add(glow, core);

    const light = new THREE.PointLight(config.glowColor, 1.15, 3.2, 2);
    group.add(light);
    group.quaternion.setFromUnitVectors(UP, direction);
    this.scene.add(group);

    this.projectiles.push({
      group,
      core,
      glow,
      light,
      velocity: direction.multiplyScalar(Math.max(1, config.speed)),
      travelled: 0,
    });
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    this.dummies = dummies;
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    this.elapsed += dt;
    const config = activeVisionConfig.solarBlast;

    if (this.chargeRemaining > 0) {
      this.chargeRemaining = Math.max(0, this.chargeRemaining - dt);
      this.positionCharge();
      const chargeProgress = 1 - this.chargeRemaining / Math.max(0.02, config.chargeTime);
      const pulse = 0.75 + chargeProgress * 0.7 + Math.sin(this.elapsed * 40) * 0.12;
      this.chargeCore.scale.setScalar(pulse);
      this.chargeGlow.scale.setScalar(0.9 + chargeProgress * 0.35);
      this.chargeLight.intensity = 1.0 + chargeProgress * 1.8;
      if (this.chargeRemaining <= 0) {
        this.chargeGroup.visible = false;
        this.launchProjectile();
      }
    }

    const active: SolarProjectile[] = [];

    for (const projectile of this.projectiles) {
      const previous = projectile.group.position.clone();
      const step = projectile.velocity.clone().multiplyScalar(dt);
      const next = previous.clone().add(step);
      const segmentLength = step.length();
      projectile.travelled += segmentLength;

      let wallT = Number.POSITIVE_INFINITY;
      let impactPoint: THREE.Vector3 | null = null;
      if (config.collideWithWorld !== false) {
        const hit = worldCollision.segmentHit(previous, next, config.radius * 0.8);
        if (hit) {
          wallT = hit.distance / Math.max(segmentLength, 0.0001);
          impactPoint = hit.point.clone();
        }
      }

      let targetHit: TargetDummy | null = null;
      let targetT = Number.POSITIVE_INFINITY;
      for (const dummy of this.dummies) {
        if (dummy.isDead) continue;
        const center = dummy.getCenter();
        const t = WorldCollision.closestTOnSegment(previous, next, center);
        if (t < 0 || t > 1 || t >= targetT || t > wallT) continue;
        const closest = previous.clone().lerp(next, t);
        if (closest.distanceTo(center) > dummy.radius + config.radius * 1.8) continue;
        targetHit = dummy;
        targetT = t;
      }

      if (targetHit) {
        const position = previous.clone().lerp(next, targetT);
        const knockback = projectile.velocity.clone().normalize().multiplyScalar(1.4);
        this.onDamage(targetHit, config.damage, position, knockback);
        this.onImpact(position, config.glowColor);
        this.onShake(0.018);
        this.disposeProjectile(projectile);
        continue;
      }

      if (impactPoint) {
        this.onImpact(impactPoint, config.glowColor);
        this.disposeProjectile(projectile);
        continue;
      }

      if (projectile.travelled >= config.maxRange) {
        this.onImpact(next, config.glowColor);
        this.disposeProjectile(projectile);
        continue;
      }

      projectile.group.position.copy(next);
      const pulse = 1 + Math.sin(this.elapsed * 34 + projectile.travelled) * 0.16;
      projectile.core.scale.setScalar(pulse);
      projectile.glow.scale.setScalar(1 + Math.sin(this.elapsed * 21) * 0.08);
      projectile.light.intensity = 0.9 + Math.sin(this.elapsed * 28) * 0.2;
      active.push(projectile);
    }

    this.projectiles = active;
  }

  private dummies: TargetDummy[] = [];

  private getMindStonePosition(): THREE.Vector3 {
    const stone = (this.stickman as StickmanNodes & { mindStone?: THREE.Object3D }).mindStone;
    if (stone) {
      const position = new THREE.Vector3();
      stone.getWorldPosition(position);
      return position;
    }
    const headPosition = new THREE.Vector3();
    this.stickman.head.getWorldPosition(headPosition);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.stickman.root.quaternion);
    return headPosition.addScaledVector(forward, 0.25);
  }

  private positionCharge(): void {
    this.chargeGroup.position.copy(this.getMindStonePosition());
  }

  private disposeProjectile(projectile: SolarProjectile): void {
    this.scene.remove(projectile.group);
    projectile.core.geometry.dispose();
    (projectile.core.material as THREE.Material).dispose();
    projectile.glow.geometry.dispose();
    (projectile.glow.material as THREE.Material).dispose();
  }

  public dispose(): void {
    this.cancelCharge();
    this.scene.remove(this.chargeGroup);
    this.chargeCore.geometry.dispose();
    (this.chargeCore.material as THREE.Material).dispose();
    this.chargeGlow.geometry.dispose();
    (this.chargeGlow.material as THREE.Material).dispose();
    for (const projectile of this.projectiles) {
      this.disposeProjectile(projectile);
    }
    this.projectiles = [];
  }
}
