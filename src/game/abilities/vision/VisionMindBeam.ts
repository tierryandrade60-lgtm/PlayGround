/**
 * VisionMindBeam.ts
 * Continuous yellow Mind Stone beam fired from Vision's forehead gem.
 * The beam is a real world-space ray: solid geometry clips it, and only the
 * first unobstructed target inside the beam receives sustained damage.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { soundSystem } from '../../systems/SoundSystem';
import { worldCollision, WorldCollision } from '../../systems/WorldCollision';
import { BeamClashDisk, IronManBeamVisual } from '../ironman/IronManBeamFx';
import { beamClashSystem } from '../../systems/BeamClashSystem';
import { activeVisionConfig } from './VisionConfig';

type AimProvider = () => { pos: THREE.Vector3; target: TargetDummy | null };
type DamageHandler = (
  dummy: TargetDummy,
  damage: number,
  hitPosition: THREE.Vector3,
  knockback?: THREE.Vector3
) => void;
type ImpactHandler = (position: THREE.Vector3, color: number) => void;

const TICK = 0.18;
const FORWARD = new THREE.Vector3(0, 0, 1);

export class VisionMindBeam {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAim: AimProvider;
  private onDamage: DamageHandler;
  private onImpact: ImpactHandler;
  private onShake: (amount: number) => void;

  private beam: IronManBeamVisual;
  private rivalBeam: IronManBeamVisual;
  private clashDisk: BeamClashDisk;
  private clashTarget: TargetDummy | null = null;
  private clashPoint = new THREE.Vector3();
  private clashTimer = 0;
  private readonly beamClashId = 'vision-mind-beam';
  private impactGroup = new THREE.Group();
  private impactSphere: THREE.Mesh;
  private impactRing: THREE.Mesh;
  private impactLight: THREE.PointLight;
  private active = false;
  private elapsed = 0;
  private duration = 0;
  private damageTimer = 0;
  private particleTimer = 0;

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

    const config = activeVisionConfig.mindBeam;
    this.beam = new IronManBeamVisual(
      scene,
      {
        core: config.coreColor,
        inner: config.innerColor,
        outer: config.outerColor,
        light: config.innerColor,
      },
      config.width,
      5
    );
    const rivalPalette = {
      core: 0x66f0ff,
      inner: 0x00a8ff,
      outer: 0x7a00ff,
      light: 0x00e5ff,
    };
    this.rivalBeam = new IronManBeamVisual(scene, rivalPalette, config.width * 0.9, 6);
    this.clashDisk = new BeamClashDisk(scene, config.innerColor, rivalPalette.inner);

    this.impactSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 18, 14),
      new THREE.MeshBasicMaterial({
        color: config.coreColor,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    this.impactRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.03, 8, 32),
      new THREE.MeshBasicMaterial({
        color: config.innerColor,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      })
    );
    this.impactLight = new THREE.PointLight(config.innerColor, 0, 5, 2);
    this.impactGroup.add(this.impactSphere, this.impactRing, this.impactLight);
    this.impactGroup.visible = false;
    this.scene.add(this.impactGroup);
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
    this.elapsed = 0;
    this.duration = 0;
    this.damageTimer = 0;
    this.particleTimer = 0;
    soundSystem.playBeamBurst();
    soundSystem.startBeamLoop?.();
    return true;
  }

  public stop(): void {
    if (!this.active) return;
    this.active = false;
    this.resolveClash(false);
    beamClashSystem.removeBeam(this.beamClashId);
    this.beam.setVisible(false);
    this.impactGroup.visible = false;
    this.impactLight.intensity = 0;
    soundSystem.stopBeamLoop?.();
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    if (!this.active) return;

    const config = activeVisionConfig.mindBeam;
    this.elapsed += dt;
    this.duration += dt;
    if (this.duration >= Math.max(0.1, config.maxDuration)) {
      this.stop();
      return;
    }

    const origin = this.getOrigin();
    const aim = this.getAim();
    let end = aim.pos.clone();
    if (origin.distanceTo(end) > config.range) {
      end = origin.clone().addScaledVector(end.clone().sub(origin).normalize(), config.range);
    }

    const collide = config.collideWithWorld !== false;
    const hit = collide ? worldCollision.segmentHit(origin, end, 0.06) : null;
    const clippedEnd = hit ? hit.point.clone() : end;

    beamClashSystem.setBeam({
      id: this.beamClashId,
      ownerId: 'player',
      character: 'vision',
      origin,
      end: clippedEnd,
      radius: config.width * 0.5,
      active: true,
      canClash: true,
    });
    beamClashSystem.syncRivalOpponents(dummies, 'vision');
    const intersection = beamClashSystem.findIntersection(this.beamClashId);
    let beamEnd = clippedEnd;
    let clashActive = false;

    if (intersection && intersection.target && !intersection.target.isDead) {
      clashActive = true;
      const target = intersection.target;
      const newSession = beamClashSystem.beginSession(intersection);
      this.clashTarget = target;
      this.clashPoint.copy(intersection.point);
      beamEnd = this.clashPoint.clone();
      if (newSession) {
        this.clashTimer = 0;
        target.rivalBeamActive = true;
        soundSystem.playBeamClash();
        this.onShake(0.14);
      } else {
        this.clashTimer += dt;
        beamClashSystem.updateSession(this.beamClashId, this.clashPoint, dt);
      }

      const rivalPosition = target.getCenter();
      const axis = rivalPosition.clone().sub(beamEnd);
      const rivalEnd = rivalPosition.clone().addScaledVector(
        axis.clone().normalize(),
        -Math.max(0.2, axis.length())
      );
      const intensity = 0.8 + Math.sin(this.elapsed * 18) * 0.12;
      this.rivalBeam.update(rivalPosition, rivalEnd, this.elapsed, 1);
      this.clashDisk.update(beamEnd, axis, this.elapsed, intensity);
      this.onShake(0.02 + intensity * 0.01);

      if (this.clashTimer >= 1.6) {
        this.resolveClash(true);
        clashActive = false;
        beamEnd = clippedEnd;
      }
    } else if (beamClashSystem.hasSession(this.beamClashId)) {
      this.resolveClash(false);
    }

    if (!clashActive) {
      this.rivalBeam.setVisible(false);
      this.clashDisk.setVisible(false);
    }

    this.beam.update(origin, beamEnd, this.elapsed, 1);

    this.impactGroup.visible = true;
    this.impactGroup.position.copy(beamEnd);
    const impactDirection = beamEnd.clone().sub(origin).normalize();
    if (impactDirection.lengthSq() > 0.0001) {
      this.impactGroup.quaternion.setFromUnitVectors(FORWARD, impactDirection);
    }
    const pulse = 1 + Math.sin(this.elapsed * 26) * 0.14;
    this.impactSphere.scale.setScalar(pulse);
    this.impactRing.scale.setScalar(1 + Math.sin(this.elapsed * 17 + 1.2) * 0.18);
    this.impactRing.rotation.z += dt * 2.2;
    this.impactLight.intensity = 1.25 + Math.sin(this.elapsed * 22) * 0.25;

    this.particleTimer += dt;
    if (this.particleTimer >= 0.16) {
      this.particleTimer = 0;
      this.onImpact(beamEnd, config.innerColor);
      this.onShake(0.012);
    }

    this.damageTimer += dt;
    if (this.damageTimer < TICK) return;
    this.damageTimer = 0;

    if (clashActive && this.clashTarget && !this.clashTarget.isDead) {
      this.onDamage(this.clashTarget, config.dps * TICK, this.clashTarget.getCenter());
      return;
    }

    let target: TargetDummy | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const dummy of dummies) {
      if (dummy.isDead) continue;
      const center = dummy.getCenter();
      const distance = WorldCollision.distanceToSegment(origin, beamEnd, center);
      if (distance > dummy.radius + 0.55 || distance >= bestDistance) continue;
      if (collide && worldCollision.isSegmentBlocked(origin, center, 0.1)) continue;
      bestDistance = distance;
      target = dummy;
    }

    if (target) {
      this.onDamage(target, config.dps * TICK, target.getCenter());
    }
  }

  private resolveClash(impact: boolean): void {
    const session = beamClashSystem.endSession(this.beamClashId);
    const target = this.clashTarget;
    if (impact && target && !target.isDead) {
      this.onImpact(this.clashPoint.clone(), activeVisionConfig.mindBeam.innerColor);
      this.onShake(0.2);
      target.rivalCooldown = Math.max(target.rivalCooldown, 1.2);
    }
    if (target) target.rivalBeamActive = false;
    this.clashTarget = null;
    this.clashTimer = 0;
    this.rivalBeam.setVisible(false);
    this.clashDisk.setVisible(false);
    if (session) session.point.copy(this.clashPoint);
  }

  private getOrigin(): THREE.Vector3 {
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

  public dispose(): void {
    this.stop();
    this.beam.dispose();
    this.rivalBeam.dispose();
    this.clashDisk.dispose();
    this.scene.remove(this.impactGroup);
    this.impactSphere.geometry.dispose();
    (this.impactSphere.material as THREE.Material).dispose();
    this.impactRing.geometry.dispose();
    (this.impactRing.material as THREE.Material).dispose();
  }
}
