/**
 * VisionAbilities.ts
 * Coordinator for Vision's complete kit:
 * 1. Solar Blast (basic attack)
 * 2. Mind Stone Beam
 * 3. Phasing / intangibility
 * 4. Psionic Flight (handled by the shared flight system + golden aura here)
 */

import * as THREE from 'three';
import { TargetDummy } from './TargetDummy';
import { StickmanNodes } from './StickmanRig';
import { activeVisionConfig } from './abilities/vision/VisionConfig';
import { VisionSolarBlast } from './abilities/vision/VisionSolarBlast';
import { VisionMindBeam } from './abilities/vision/VisionMindBeam';
import { VisionPhasing } from './abilities/vision/VisionPhasing';

type AimProvider = () => { pos: THREE.Vector3; target: TargetDummy | null };
type DamageHandler = (
  dummy: TargetDummy,
  damage: number,
  hitPosition: THREE.Vector3,
  knockback?: THREE.Vector3
) => void;
type ImpactHandler = (position: THREE.Vector3, color: number) => void;

export class VisionAbilities {
  public readonly solarBlast: VisionSolarBlast;
  public readonly mindBeam: VisionMindBeam;
  public readonly phasing: VisionPhasing;

  private stickman: StickmanNodes;
  private onShake: (amount: number) => void;
  private flightAura = new THREE.Group();
  private flightRings: THREE.Mesh[] = [];
  private flightParticles: THREE.Points;
  private elapsed = 0;

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    getAim: AimProvider,
    onDamage: DamageHandler,
    onImpact: ImpactHandler,
    onShake: (amount: number) => void,
    onPhasingChange: (active: boolean) => void
  ) {
    this.stickman = stickman;
    this.onShake = onShake;
    this.solarBlast = new VisionSolarBlast(
      scene,
      stickman,
      getAim,
      onDamage,
      onImpact,
      onShake
    );
    this.mindBeam = new VisionMindBeam(
      scene,
      stickman,
      getAim,
      onDamage,
      onImpact,
      onShake
    );
    this.phasing = new VisionPhasing(stickman, onPhasingChange);

    const config = activeVisionConfig.flight;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: config.auraColor,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.46 + i * 0.18, 0.01, 6, 40),
        ringMaterial
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.82 + i * 0.3;
      this.flightRings.push(ring);
      this.flightAura.add(ring);
    }

    const positions: number[] = [];
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.28 + Math.random() * 0.38;
      positions.push(
        Math.cos(angle) * radius,
        0.4 + Math.random() * 0.9,
        Math.sin(angle) * radius
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.flightParticles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: config.trailColor,
        size: 0.035,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.flightAura.add(this.flightParticles);
    this.flightAura.visible = false;
    this.stickman.root.add(this.flightAura);
  }

  public get isMindBeamActive(): boolean {
    return this.mindBeam.isActive;
  }

  public get isPhasing(): boolean {
    return this.phasing.isActive;
  }

  public get phasingRemaining(): number {
    return this.phasing.remainingSeconds;
  }

  public triggerAttack(): boolean {
    return this.solarBlast.fire();
  }

  public triggerAbility(id: number): boolean {
    if (id === 1) return this.mindBeam.toggle();
    if (id === 2) {
      if (this.phasing.isActive) {
        this.phasing.cancel();
        return false;
      }
      return this.phasing.activate();
    }
    return false;
  }

  public cancelAbility(id: number): boolean {
    if (id === 1 && this.mindBeam.isActive) {
      this.mindBeam.stop();
      return true;
    }
    if (id === 2 && this.phasing.isActive) {
      return this.phasing.cancel();
    }
    return false;
  }

  public update(dt: number, dummies: TargetDummy[], isFlying: boolean): void {
    this.elapsed += dt;
    this.solarBlast.update(dt, dummies);
    this.mindBeam.update(dt, dummies);
    this.phasing.update(dt);

    this.flightAura.visible = isFlying;
    if (isFlying) {
      this.flightRings.forEach((ring, index) => {
        ring.rotation.z += dt * (0.7 + index * 0.5);
        ring.scale.setScalar(1 + Math.sin(this.elapsed * 5 + index) * 0.1);
      });
      this.flightParticles.rotation.y += dt * 0.55;
      (this.flightParticles.material as THREE.PointsMaterial).opacity =
        0.4 + Math.sin(this.elapsed * 7) * 0.12;
    }
  }

  public stopAll(): void {
    this.mindBeam.stop();
    this.phasing.cancel();
    this.flightAura.visible = false;
  }

  public dispose(): void {
    this.stopAll();
    this.solarBlast.dispose();
    this.mindBeam.dispose();
    this.phasing.dispose();
    this.stickman.root.remove(this.flightAura);
    for (const ring of this.flightRings) {
      ring.geometry.dispose();
    }
    (this.flightRings[0]?.material as THREE.Material | undefined)?.dispose?.();
    this.flightParticles.geometry.dispose();
    (this.flightParticles.material as THREE.Material).dispose();
  }
}
