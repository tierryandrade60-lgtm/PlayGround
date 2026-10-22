/**
 * IronManDualBeams.ts
 * Modular dual-hand beam and Beam Clash ability.
 *
 * Keeps the original damage, range, duration, clash push and visual timing.
 * Installed by the ScriptRuntimeEngine; when absent the controller uses its
 * built-in fallback.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { soundSystem } from '../../systems/SoundSystem';
import { activeIronManConfig } from './IronManConfig';

export interface BeamClashState {
  active: boolean;
  rival: TargetDummy | null;
  progress: number;
  clashPoint: THREE.Vector3;
  duration: number;
  maxDuration: number;
  lastTapTime: number;
}

type AimProvider = () => { pos: THREE.Vector3; target: TargetDummy | null };
type DamageHandler = (
  dummy: TargetDummy,
  damage: number,
  hitPosition: THREE.Vector3,
  knockback?: THREE.Vector3
) => void;
type ExplosionHandler = (position: THREE.Vector3, radius: number, color?: number) => void;

export class IronManDualBeams {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAim: AimProvider;
  private onDamageDealt: DamageHandler;
  private onShake: (amount: number) => void;
  private onExplosion: ExplosionHandler;
  private clashState: BeamClashState;

  private active = false;
  private timer = 0;
  private damageTimer = 0;

  private leftBeamMesh: THREE.Line;
  private rightBeamMesh: THREE.Line;
  private leftBeamGlow: THREE.Mesh;
  private rightBeamGlow: THREE.Mesh;
  private rivalBeamMesh: THREE.Line;
  private rivalBeamGlow: THREE.Mesh;
  private clashSphere: THREE.Mesh;
  private clashLight: THREE.PointLight;

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    getAim: AimProvider,
    onDamageDealt: DamageHandler,
    onShake: (amount: number) => void,
    onExplosion: ExplosionHandler,
    clashState: BeamClashState
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.getAim = getAim;
    this.onDamageDealt = onDamageDealt;
    this.onShake = onShake;
    this.onExplosion = onExplosion;
    this.clashState = clashState;

    const baseBeamMaterial = new THREE.LineBasicMaterial({ color: 0xffea00, linewidth: 3 });
    const leftGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const rightGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);

    this.leftBeamMesh = new THREE.Line(leftGeometry, baseBeamMaterial);
    this.rightBeamMesh = new THREE.Line(rightGeometry, baseBeamMaterial.clone());
    this.leftBeamMesh.visible = false;
    this.rightBeamMesh.visible = false;
    this.scene.add(this.leftBeamMesh, this.rightBeamMesh);

    const glowGeometry = new THREE.CylinderGeometry(0.12, 0.12, 1, 12, 1, true);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    this.leftBeamGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.rightBeamGlow = new THREE.Mesh(glowGeometry, glowMaterial.clone());
    this.leftBeamGlow.visible = false;
    this.rightBeamGlow.visible = false;
    this.scene.add(this.leftBeamGlow, this.rightBeamGlow);

    const rivalMaterial = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 3 });
    this.rivalBeamMesh = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      rivalMaterial
    );
    this.rivalBeamMesh.visible = false;
    this.scene.add(this.rivalBeamMesh);

    this.rivalBeamGlow = new THREE.Mesh(
      glowGeometry.clone(),
      new THREE.MeshBasicMaterial({
        color: 0xaa00ff,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      })
    );
    this.rivalBeamGlow.visible = false;
    this.scene.add(this.rivalBeamGlow);

    this.clashSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.clashSphere.visible = false;
    this.scene.add(this.clashSphere);

    this.clashLight = new THREE.PointLight(0xffaa00, 0, 12);
    this.scene.add(this.clashLight);
  }

  public get isActive(): boolean {
    return this.active;
  }

  public toggle(): boolean {
    if (this.active) {
      this.stop();
      return false;
    }

    this.active = true;
    this.timer = 0;
    this.damageTimer = 0;
    soundSystem.playBeamBurst();
    return true;
  }

  public stop(): void {
    this.active = false;
    this.leftBeamMesh.visible = false;
    this.rightBeamMesh.visible = false;
    this.leftBeamGlow.visible = false;
    this.rightBeamGlow.visible = false;
    this.resolveClash(false);
  }

  public onClashTap(): void {
    if (!this.clashState.active) return;
    this.clashState.progress = Math.min(1, this.clashState.progress + 0.15);
    this.clashState.lastTapTime = performance.now();
    soundSystem.playBeamClash();
    this.onShake(0.1);

    if (this.clashState.progress >= 1) {
      this.resolveClash(true);
    }
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    if (!this.active) return;

    const config = activeIronManConfig.dualBeams;
    const maxDuration = Math.max(0.1, config.maxDuration);
    this.timer += dt;

    if (this.timer >= maxDuration) {
      this.stop();
      return;
    }

    const leftHandPos = new THREE.Vector3();
    const rightHandPos = new THREE.Vector3();
    this.stickman.leftHand.getWorldPosition(leftHandPos);
    this.stickman.rightHand.getWorldPosition(rightHandPos);

    const aim = this.getAim();
    const maxRange = config.range;
    let endPoint = aim.pos.clone();
    const midHand = leftHandPos.clone().add(rightHandPos).multiplyScalar(0.5);

    if (midHand.distanceTo(endPoint) > maxRange) {
      const direction = endPoint.clone().sub(midHand).normalize();
      endPoint = midHand.clone().addScaledVector(direction, maxRange);
    }

    let clashTarget: TargetDummy | null = null;
    for (const dummy of dummies) {
      if (dummy.isDead || dummy.rivalCooldown > 0) continue;
      const center = dummy.getCenter();
      if (midHand.distanceTo(center) > maxRange) continue;
      const distance = this.distanceToSegment(center, midHand, endPoint);
      if (distance <= dummy.radius + 1.2 || (aim.target && aim.target.id === dummy.id)) {
        clashTarget = dummy;
        break;
      }
    }

    if (clashTarget) {
      if (!this.clashState.active) {
        this.clashState.active = true;
        this.clashState.rival = clashTarget;
        this.clashState.progress = 0.5;
        this.clashState.duration = 0;
        this.clashState.maxDuration = 6;
        clashTarget.rivalBeamActive = true;
        this.clashSphere.visible = true;
        this.rivalBeamMesh.visible = true;
        this.rivalBeamGlow.visible = true;
        soundSystem.playBeamClash();
      }

      this.clashState.duration += dt;
      this.clashState.progress = Math.max(0, this.clashState.progress - dt * 0.09);

      const rivalPosition = clashTarget.getCenter();
      this.clashState.clashPoint.lerpVectors(
        midHand,
        rivalPosition,
        1 - this.clashState.progress
      );
      endPoint.copy(this.clashState.clashPoint);

      this.updateBeamMesh(
        this.rivalBeamMesh,
        this.rivalBeamGlow,
        rivalPosition,
        this.clashState.clashPoint,
        0.18
      );

      this.clashSphere.position.copy(this.clashState.clashPoint);
      const pulse = 0.55 + Math.sin(performance.now() * 0.02) * 0.15;
      this.clashSphere.scale.setScalar(pulse);
      this.clashLight.position.copy(this.clashState.clashPoint);
      this.clashLight.intensity = 2.2 + Math.sin(performance.now() * 0.02) * 0.4;
      this.onShake(0.04);

      if (this.clashState.duration >= this.clashState.maxDuration) {
        this.resolveClash(this.clashState.progress > 0.5);
      }
    } else if (this.clashState.active) {
      this.resolveClash(false);
    }

    this.leftBeamMesh.visible = true;
    this.rightBeamMesh.visible = true;
    this.leftBeamGlow.visible = true;
    this.rightBeamGlow.visible = true;

    this.updateBeamMesh(this.leftBeamMesh, this.leftBeamGlow, leftHandPos, endPoint, 0.12);
    this.updateBeamMesh(this.rightBeamMesh, this.rightBeamGlow, rightHandPos, endPoint, 0.12);

    this.damageTimer += dt;
    if (this.damageTimer < 0.25) return;
    this.damageTimer = 0;

    let targetDummy: TargetDummy | null = null;
    if (aim.target && !aim.target.isDead) {
      const distance = this.distanceToSegment(aim.target.getCenter(), midHand, endPoint);
      if (distance <= aim.target.radius + 0.6) targetDummy = aim.target;
    }

    if (!targetDummy) {
      let bestDistance = Infinity;
      for (const dummy of dummies) {
        if (dummy.isDead) continue;
        const distance = this.distanceToSegment(dummy.getCenter(), midHand, endPoint);
        if (distance <= dummy.radius + 0.5 && distance < bestDistance) {
          bestDistance = distance;
          targetDummy = dummy;
        }
      }
    }

    if (targetDummy) {
      this.onDamageDealt(targetDummy, config.dps * 0.25, targetDummy.getCenter());
    }
  }

  private resolveClash(playerWon: boolean): void {
    if (!this.clashState.active) return;
    const rival = this.clashState.rival;

    if (playerWon && rival && !rival.isDead) {
      const finishPosition = rival.getCenter();
      this.onExplosion(finishPosition, 5, 0xffaa00);
      const fling = new THREE.Vector3(0, 4, -18);
      this.onDamageDealt(rival, 80, finishPosition, fling);
      soundSystem.playExplosion();
      this.onShake(0.42);
      rival.rivalCooldown = 10;
    }

    this.clashState.active = false;
    this.clashSphere.visible = false;
    this.rivalBeamMesh.visible = false;
    this.rivalBeamGlow.visible = false;
    this.clashLight.intensity = 0;
    if (rival) rival.rivalBeamActive = false;
  }

  private updateBeamMesh(
    line: THREE.Line,
    glow: THREE.Mesh,
    start: THREE.Vector3,
    end: THREE.Vector3,
    thickness: number
  ): void {
    const geometry = line.geometry as THREE.BufferGeometry;
    geometry.setFromPoints([start, end]);

    const distance = start.distanceTo(end);
    const middle = start.clone().add(end).multiplyScalar(0.5);
    glow.position.copy(middle);
    glow.scale.set(thickness, distance, thickness);
    glow.quaternion.setFromUnitVectors(
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
    this.scene.remove(
      this.leftBeamMesh,
      this.rightBeamMesh,
      this.leftBeamGlow,
      this.rightBeamGlow,
      this.rivalBeamMesh,
      this.rivalBeamGlow,
      this.clashSphere,
      this.clashLight
    );

    this.leftBeamMesh.geometry.dispose();
    this.rightBeamMesh.geometry.dispose();
    this.rivalBeamMesh.geometry.dispose();
    (this.leftBeamMesh.material as THREE.Material).dispose();
    (this.rightBeamMesh.material as THREE.Material).dispose();
    (this.rivalBeamMesh.material as THREE.Material).dispose();
    (this.leftBeamGlow.material as THREE.Material).dispose();
    (this.rightBeamGlow.material as THREE.Material).dispose();
    (this.rivalBeamGlow.material as THREE.Material).dispose();
    (this.clashSphere.material as THREE.Material).dispose();
    this.leftBeamGlow.geometry.dispose();
    this.rightBeamGlow.geometry.dispose();
    this.rivalBeamGlow.geometry.dispose();
    this.clashSphere.geometry.dispose();
  }
}
