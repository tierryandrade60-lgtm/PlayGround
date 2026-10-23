/**
 * IronManDualBeams.ts
 * Modular dual-hand beam with real beam-vs-beam collision and a cinematic
 * impact disk. The rival NPC is the only dummy allowed to answer with a beam.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { soundSystem } from '../../systems/SoundSystem';
import { worldCollision } from '../../systems/WorldCollision';
import { activeIronManConfig } from './IronManConfig';
import { IronManBeamVisual, BeamClashDisk } from './IronManBeamFx';

export interface BeamClashState {
  active: boolean;
  rival: TargetDummy | null;
  progress: number;
  clashPoint: THREE.Vector3;
  duration: number;
  maxDuration: number;
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
  private elapsed = 0;

  private leftBeam: IronManBeamVisual;
  private rightBeam: IronManBeamVisual;
  private rivalBeam: IronManBeamVisual;
  private clashDisk: BeamClashDisk;
  private playerClashEnd = new THREE.Vector3();
  private rivalClashEnd = new THREE.Vector3();

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

    const config = activeIronManConfig.dualBeams;
    const playerPalette = {
      core: config.beamCoreColor ?? 0xfff7b0,
      inner: config.beamGlowColor ?? 0xffb300,
      outer: config.beamOuterColor ?? 0xff3b00,
      light: config.beamGlowColor ?? 0xffb300,
    };
    const rivalPalette = {
      core: config.rivalBeamCoreColor ?? 0x66f0ff,
      inner: config.rivalBeamGlowColor ?? 0x00a8ff,
      outer: config.rivalBeamOuterColor ?? 0x7a00ff,
      light: config.rivalBeamGlowColor ?? 0x00e5ff,
    };

    this.leftBeam = new IronManBeamVisual(scene, playerPalette, 0.24, 5);
    this.rightBeam = new IronManBeamVisual(scene, playerPalette, 0.24, 5);
    this.rivalBeam = new IronManBeamVisual(scene, rivalPalette, 0.3, 6);
    this.clashDisk = new BeamClashDisk(
      scene,
      playerPalette.inner,
      rivalPalette.inner
    );
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
    this.elapsed = 0;
    soundSystem.playBeamBurst();
    soundSystem.startBeamLoop?.();
    return true;
  }

  public stop(): void {
    this.active = false;
    this.leftBeam.setVisible(false);
    this.rightBeam.setVisible(false);
    this.rivalBeam.setVisible(false);
    this.clashDisk.setVisible(false);
    soundSystem.stopBeamLoop?.();
    this.resolveClash(false);
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    if (!this.active) return;

    const config = activeIronManConfig.dualBeams;
    const maxDuration = Math.max(0.1, config.maxDuration);
    this.timer += dt;
    this.elapsed += dt;

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
    const midHand = leftHandPos.clone().add(rightHandPos).multiplyScalar(0.5);
    let aimEnd = aim.pos.clone();

    if (midHand.distanceTo(aimEnd) > maxRange) {
      const direction = aimEnd.clone().sub(midHand).normalize();
      aimEnd = midHand.clone().addScaledVector(direction, maxRange);
    }

    const collide = config.collideWithWorld !== false;
    const leftLimit = this.beamLimit(leftHandPos, aimEnd, collide);
    const rightLimit = this.beamLimit(rightHandPos, aimEnd, collide);
    const midLimit = this.beamLimit(midHand, aimEnd, collide);

    let clashTarget: TargetDummy | null = null;
    if (config.beamClash !== false) {
      for (const dummy of dummies) {
        if (!dummy.isRival || dummy.isDead || dummy.rivalCooldown > 0) continue;
        const center = dummy.getCenter();
        const distanceToBeam = this.distanceToSegment(center, midHand, aimEnd);
        if (distanceToBeam > dummy.radius + 1.2) continue;
        const t = this.closestT(center, midHand, aimEnd);
        const along = t * midHand.distanceTo(aimEnd);
        const clearLimit = Math.min(leftLimit, rightLimit, midLimit);
        if (along > clearLimit + dummy.radius + 0.6) continue;
        clashTarget = dummy;
        break;
      }
    }

    let beamEnd = aimEnd;
    if (clashTarget) {
      const rivalPosition = clashTarget.getCenter();
      if (!this.clashState.active) {
        this.clashState.active = true;
        this.clashState.rival = clashTarget;
        this.clashState.progress = 0.5;
        this.clashState.duration = 0;
        this.clashState.maxDuration = Math.max(0.5, maxDuration - 0.12);
        clashTarget.rivalBeamActive = true;
        soundSystem.playBeamClash();
        this.onShake(0.14);
      }

      this.clashState.duration += dt;
      this.clashState.progress = 0.5;
      this.clashState.clashPoint.lerpVectors(midHand, rivalPosition, 0.5);
      beamEnd = this.clashState.clashPoint;

      const axis = rivalPosition.clone().sub(midHand);
      const axisDirection = axis.clone().normalize();
      const clashRadius = 1.05;
      this.playerClashEnd.copy(beamEnd).addScaledVector(axisDirection, -clashRadius);
      this.rivalClashEnd.copy(beamEnd).addScaledVector(axisDirection, clashRadius);
      const intensity = 0.8 + Math.sin(this.elapsed * 18) * 0.12;
      this.rivalBeam.update(rivalPosition, this.rivalClashEnd, this.elapsed, 1);
      this.clashDisk.update(beamEnd, axis, this.elapsed, intensity);
      this.onShake(0.025 + intensity * 0.012);

      if (this.clashState.duration >= this.clashState.maxDuration) {
        this.resolveClash(true);
      }
    } else if (this.clashState.active) {
      this.resolveClash(false);
    }

    if (!this.clashState.active) {
      this.rivalBeam.setVisible(false);
      this.clashDisk.setVisible(false);
      beamEnd = aimEnd;
    }

    const leftEnd = this.clashState.active
      ? this.playerClashEnd
      : this.collideBeam(leftHandPos, beamEnd, collide);
    const rightEnd = this.clashState.active
      ? this.playerClashEnd
      : this.collideBeam(rightHandPos, beamEnd, collide);

    this.leftBeam.update(leftHandPos, leftEnd, this.elapsed, 1);
    this.rightBeam.update(rightHandPos, rightEnd, this.elapsed, 1);

    this.damageTimer += dt;
    if (this.damageTimer < 0.25) return;
    this.damageTimer = 0;

    if (this.clashState.active && this.clashState.rival && !this.clashState.rival.isDead) {
      this.onDamageDealt(
        this.clashState.rival,
        config.dps * 0.25,
        this.clashState.clashPoint
      );
      return;
    }

    let targetDummy: TargetDummy | null = null;
    if (aim.target && !aim.target.isDead) {
      const distance = this.distanceToSegment(aim.target.getCenter(), midHand, beamEnd);
      if (
        distance <= aim.target.radius + 0.6 &&
        (!collide || !worldCollision.isSegmentBlocked(midHand, aim.target.getCenter(), 0.1))
      ) {
        targetDummy = aim.target;
      }
    }

    if (!targetDummy) {
      let bestDistance = Infinity;
      for (const dummy of dummies) {
        if (dummy.isDead) continue;
        const center = dummy.getCenter();
        const distance = this.distanceToSegment(center, midHand, beamEnd);
        if (distance > dummy.radius + 0.5 || distance >= bestDistance) continue;
        if (collide && worldCollision.isSegmentBlocked(midHand, center, 0.1)) continue;
        bestDistance = distance;
        targetDummy = dummy;
      }
    }

    if (targetDummy) {
      this.onDamageDealt(targetDummy, config.dps * 0.25, targetDummy.getCenter());
    }
  }

  private resolveClash(impact: boolean): void {
    if (!this.clashState.active) return;
    const rival = this.clashState.rival;

    if (impact && rival && !rival.isDead) {
      const position = this.clashState.clashPoint.clone();
      this.onExplosion(position, 1.4, 0xffd36a);
      soundSystem.playBeamClash();
      this.onShake(0.2);
      rival.rivalCooldown = Math.max(rival.rivalCooldown, 1.2);
    }

    this.clashState.active = false;
    this.clashState.progress = 0.5;
    this.clashState.duration = 0;
    this.rivalBeam.setVisible(false);
    this.clashDisk.setVisible(false);
    if (rival) rival.rivalBeamActive = false;
  }

  private collideBeam(
    start: THREE.Vector3,
    end: THREE.Vector3,
    collide: boolean
  ): THREE.Vector3 {
    if (!collide) return end.clone();
    const hit = worldCollision.segmentHit(start, end, 0.08);
    return hit ? hit.point.clone() : end.clone();
  }

  private beamLimit(
    start: THREE.Vector3,
    end: THREE.Vector3,
    collide: boolean
  ): number {
    if (!collide) return Number.POSITIVE_INFINITY;
    const hit = worldCollision.segmentHit(start, end, 0.08);
    return hit ? hit.distance : Number.POSITIVE_INFINITY;
  }

  private closestT(
    point: THREE.Vector3,
    start: THREE.Vector3,
    end: THREE.Vector3
  ): number {
    const segment = end.clone().sub(start);
    const lengthSq = segment.lengthSq();
    if (lengthSq <= 0.000001) return 0;
    return THREE.MathUtils.clamp(
      point.clone().sub(start).dot(segment) / lengthSq,
      0,
      1
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
    this.leftBeam.dispose();
    this.rightBeam.dispose();
    this.rivalBeam.dispose();
    this.clashDisk.dispose();
  }
}
