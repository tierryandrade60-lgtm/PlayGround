/**
 * AgathaDarkDrain.ts
 * V.4.0 — Dark Drain: Coven Absorption
 *
 * - Gradually extending volumetric tendrils.
 * - Tapered tips with a thicker, pulsing central section.
 * - Dark-violet layers with a bright arcane core.
 * - Continuous energy flow from targets into Agatha.
 * - Animated absorption effect around Agatha's chest.
 * - Preserves periodic damage and gameplay restrictions.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { activeAgathaConfig } from './AgathaConfig';

const SEGMENTS = 36;
const RADIAL_SEGMENTS = 12;
const PARTICLE_COUNT = 46;
const ABSORPTION_PARTICLE_COUNT = 54;

const BEAM_EXTENSION_SPEED = 2.4;

export interface DrainTendril {
  target: TargetDummy;
  line: THREE.Mesh;
  glow: THREE.Mesh;
  shadowLine: THREE.Mesh;
  particles: THREE.Points;
  particlePhases: Float32Array;
  phase: number;
  progress: number;
}

interface BeamGeometryData {
  positions: Float32Array;
  stride: number;
}

export class AgathaDarkDrain {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;

  private onDamageDealt: (
    dummy: TargetDummy,
    dmg: number,
    hitPos: THREE.Vector3,
    knockback?: THREE.Vector3
  ) => void;

  private onShake: (amount: number) => void;

  public isActive = false;

  private timer = 0;
  private tickTimer = 0;
  private elapsed = 0;

  private activeTendrils = new Map<number, DrainTendril>();

  private readonly sourceId = 'agatha-dark-drain';

  private readonly violet = new THREE.Color(0xb65cff);
  private readonly brightViolet = new THREE.Color(0xf0c5ff);
  private readonly deepViolet = new THREE.Color(0x35094f);

  private readonly worldUp = new THREE.Vector3(0, 1, 0);

  private readonly tempStart = new THREE.Vector3();
  private readonly tempEnd = new THREE.Vector3();
  private readonly tempDirection = new THREE.Vector3();
  private readonly tempSide = new THREE.Vector3();
  private readonly tempUp = new THREE.Vector3();
  private readonly tempPoint = new THREE.Vector3();
  private readonly tempTarget = new THREE.Vector3();

  // Continuous absorption effect around Agatha's chest.
  private absorptionGroup: THREE.Group | null = null;
  private absorptionCore: THREE.Mesh | null = null;
  private absorptionPoints: THREE.Points | null = null;
  private absorptionPhases = new Float32Array(
    ABSORPTION_PARTICLE_COUNT
  );
  private absorptionRings: THREE.Mesh[] = [];

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    onDamageDealt: (
      dummy: TargetDummy,
      dmg: number,
      hitPos: THREE.Vector3,
      knockback?: THREE.Vector3
    ) => void,
    onShake: (amount: number) => void
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.onDamageDealt = onDamageDealt;
    this.onShake = onShake;
  }

  public activate(
    playerPos: THREE.Vector3,
    dummies: TargetDummy[]
  ): boolean {
    const cfg = activeAgathaConfig.darkDrain;

    if (this.isActive) {
      this.cancel();
      return false;
    }

    this.clearAllTendrils();
    this.removeAbsorptionEffect();

    const inRange = dummies.filter(
      dummy =>
        !dummy.isDead &&
        dummy.getCenter().distanceTo(playerPos) <= cfg.range
    );

    if (inRange.length === 0) {
      audioSystem.playError?.();
      return false;
    }

    this.isActive = true;
    this.timer = cfg.duration;
    this.tickTimer = 0;
    this.elapsed = 0;

    gameplayRestrictions.applyRestriction(
      'Anchored',
      this.sourceId,
      cfg.duration
    );

    gameplayRestrictions.applyRestriction(
      'NoFlight',
      this.sourceId,
      cfg.duration
    );

    for (const dummy of inRange) {
      this.activeTendrils.set(
        dummy.id,
        this.createTendril(dummy)
      );
    }

    this.createAbsorptionEffect();

    audioSystem.playDarkDrainPulse?.();
    audioSystem.startDarkDrainLoop?.();
    this.onShake(0.035);

    return true;
  }

  private createTendril(dummy: TargetDummy): DrainTendril {
    const createBeam = (
      name: string,
      color: THREE.Color,
      opacity: number,
      radius: number
    ): THREE.Mesh => {
      const geometry = new THREE.BufferGeometry();
      const stride = RADIAL_SEGMENTS + 1;
      const vertexCount = (SEGMENTS + 1) * stride;

      const positions = new Float32Array(vertexCount * 3);
      const indices: number[] = [];

      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
      );

      for (let i = 0; i < SEGMENTS; i++) {
        for (let j = 0; j < RADIAL_SEGMENTS; j++) {
          const a = i * stride + j;
          const b = (i + 1) * stride + j;

          indices.push(
            a, b, a + 1,
            b, b + 1, a + 1
          );
        }
      }

      geometry.setIndex(indices);

      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });

      const beam = new THREE.Mesh(geometry, material);

      beam.name = name;
      beam.userData.baseRadius = radius;
      beam.frustumCulled = false;
      beam.renderOrder = 10;

      this.scene.add(beam);

      return beam;
    };

    // Bright inner core.
    const line = createBeam(
      'AgathaDrain_Core',
      this.brightViolet,
      0.98,
      0.095
    );

    // Soft, broad violet glow.
    const glow = createBeam(
      'AgathaDrain_Glow',
      this.violet,
      0.3,
      0.255
    );

    // Dark energy layer surrounding the core.
    const shadowLine = createBeam(
      'AgathaDrain_Shadow',
      this.deepViolet,
      0.72,
      0.16
    );

    const particleGeometry = new THREE.BufferGeometry();

    particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array(PARTICLE_COUNT * 3),
        3
      )
    );

    const particlePhases = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlePhases[i] = Math.random();
    }

    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: this.brightViolet,
        size: 0.095,
        transparent: true,
        opacity: 0.92,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );

    particles.frustumCulled = false;
    particles.renderOrder = 11;

    this.scene.add(particles);

    return {
      target: dummy,
      line,
      glow,
      shadowLine,
      particles,
      particlePhases,
      phase: Math.random() * Math.PI * 2,
      progress: 0
    };
  }

  private createAbsorptionEffect(): void {
    const group = new THREE.Group();
    group.name = 'AgathaDarkDrain_Absorption';
    this.scene.add(group);

    // Concentrated magical core.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 20, 16),
      new THREE.MeshBasicMaterial({
        color: 0xd9a1ff,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      })
    );

    group.add(core);
    this.absorptionCore = core;

    // Three intersecting rings create a contained magical vortex.
    this.absorptionRings = [];

    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.3 + i * 0.105,
          0.018 + (i === 1 ? 0.006 : 0),
          8,
          40
        ),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? 0xe5baff : 0x8d3bd1,
          transparent: true,
          opacity: 0.68 - i * 0.12,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      );

      ring.rotation.set(
        0.7 + i * 0.8,
        0.45 + i * 0.65,
        i * 0.5
      );

      group.add(ring);
      this.absorptionRings.push(ring);
    }

    // Small motes spiral inward around the chest.
    const positions = new Float32Array(
      ABSORPTION_PARTICLE_COUNT * 3
    );

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    for (let i = 0; i < ABSORPTION_PARTICLE_COUNT; i++) {
      this.absorptionPhases[i] = Math.random();
    }

    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xc77aff,
        size: 0.075,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );

    points.frustumCulled = false;
    group.add(points);

    this.absorptionGroup = group;
    this.absorptionPoints = points;
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3
  ): void {
    if (!this.isActive) return;

    const safeDt = Math.min(Math.max(dt, 0), 0.05);
    const cfg = activeAgathaConfig.darkDrain;

    this.elapsed += safeDt;
    this.timer -= safeDt;
    this.tickTimer += safeDt;

    // Agatha's chest is the receiving point for stolen energy.
    const receiver = playerPos.clone();
    receiver.y += 1.5;

    this.updateAbsorptionEffect(receiver, safeDt);

    // Keep periodic damage behavior intact.
    while (
      this.tickTimer >= cfg.tickInterval &&
      this.isActive
    ) {
      this.tickTimer -= cfg.tickInterval;

      const tickDmg = Math.max(
        1,
        Math.round(cfg.dps * cfg.tickInterval)
      );

      for (const [id, tendril] of [
        ...this.activeTendrils.entries()
      ]) {
        if (
          tendril.target.isDead ||
          tendril.target.getCenter().distanceTo(playerPos) >
            cfg.range * 1.25
        ) {
          this.removeTendril(id);
          continue;
        }

        // Damage only begins once the beam reaches its target.
        if (tendril.progress >= 1) {
          this.onDamageDealt(
            tendril.target,
            tickDmg,
            tendril.target.getCenter()
          );
        }
      }

      if (this.activeTendrils.size > 0) {
        this.onShake(0.012);
      }
    }

    for (const [id, tendril] of [
      ...this.activeTendrils.entries()
    ]) {
      if (
        tendril.target.isDead ||
        tendril.target.getCenter().distanceTo(playerPos) >
          cfg.range * 1.25
      ) {
        this.removeTendril(id);
        continue;
      }

      const targetPos = tendril.target.getCenter();
      targetPos.y += 0.25;

      tendril.phase += safeDt * 5.5;

      // Animate the beam growing from Agatha toward the target.
      tendril.progress = Math.min(
        1,
        tendril.progress + safeDt * BEAM_EXTENSION_SPEED
      );

      this.tempStart.copy(receiver);
      this.tempEnd.copy(targetPos);

      this.tempDirection.subVectors(
        this.tempEnd,
        this.tempStart
      );

      if (this.tempDirection.lengthSq() < 0.0001) {
        continue;
      }

      this.tempDirection.normalize();

      this.tempSide.crossVectors(
        this.tempDirection,
        this.worldUp
      );

      if (this.tempSide.lengthSq() < 0.001) {
        this.tempSide.set(1, 0, 0);
      } else {
        this.tempSide.normalize();
      }

      this.tempUp.crossVectors(
        this.tempSide,
        this.tempDirection
      ).normalize();

      const wave = tendril.phase;
      const progress = tendril.progress;

      this.updateBeam(
        tendril.line,
        wave,
        1,
        1,
        progress
      );

      this.updateBeam(
        tendril.glow,
        wave * 0.8 + 1.3,
        0.8,
        1.15,
        progress
      );

      this.updateBeam(
        tendril.shadowLine,
        -wave * 1.2,
        -0.65,
        0.92,
        progress
      );

      // Particles flow from the target into Agatha after connection.
      this.updateBeamParticles(
        tendril,
        safeDt,
        progress
      );

      const coreMaterial = tendril.line
        .material as THREE.MeshBasicMaterial;

      coreMaterial.opacity =
        0.82 + (Math.sin(wave * 2.6) + 1) * 0.09;

      const glowMaterial = tendril.glow
        .material as THREE.MeshBasicMaterial;

      glowMaterial.opacity =
        0.22 + (Math.sin(wave * 1.8) + 1) * 0.09;

      const shadowMaterial = tendril.shadowLine
        .material as THREE.MeshBasicMaterial;

      shadowMaterial.opacity =
        0.36 + (Math.sin(wave * 1.3 + 2) + 1) * 0.16;
    }

    if (
      this.timer <= 0 ||
      this.activeTendrils.size === 0
    ) {
      this.cancel();
    }
  }

  /**
   * Creates a tapered volumetric tube.
   * Both ends are thin; the central section is thicker.
   * Progress controls how far the beam has extended.
   */
  private updateBeam(
    beam: THREE.Mesh,
    phase: number,
    offset: number,
    radiusMultiplier: number,
    progress: number
  ): void {
    const positions = beam.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;

    const stride = RADIAL_SEGMENTS + 1;
    const baseRadius = Number(beam.userData.baseRadius);

    const pulse = 1 + Math.sin(
      this.elapsed * 11 + phase
    ) * 0.12;

    // The visible endpoint moves outward from Agatha.
    const visibleEnd = this.tempStart.clone().lerp(
      this.tempEnd,
      Math.max(0.025, progress)
    );

    for (let i = 0; i <= SEGMENTS; i++) {
      const t = i / SEGMENTS;

      const center = this.tempStart.clone().lerp(
        visibleEnd,
        t
      );

      const curve = Math.sin(t * Math.PI);

      const waveA = Math.sin(
        t * 18 + phase + this.elapsed * 8
      );

      const waveB = Math.cos(
        t * 12 - phase * 0.7 + this.elapsed * 6
      );

      center.addScaledVector(
        this.tempSide,
        curve * waveA * 0.07 * offset
      );

      center.addScaledVector(
        this.tempUp,
        curve * waveB * 0.05 * offset
      );

      /*
       * Taper profile:
       * - narrow at Agatha's chest;
       * - thickest in the middle;
       * - narrow again at the target.
       */
      const taper = 0.12 + Math.pow(curve, 0.72) * 0.88;

      const localRadius =
        baseRadius *
        radiusMultiplier *
        taper *
        pulse;

      for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
        const angle =
          (j / RADIAL_SEGMENTS) * Math.PI * 2;

        const sideAmount = Math.cos(angle) * localRadius;
        const upAmount = Math.sin(angle) * localRadius;

        positions.setXYZ(
          i * stride + j,
          center.x +
            this.tempSide.x * sideAmount +
            this.tempUp.x * upAmount,
          center.y +
            this.tempSide.y * sideAmount +
            this.tempUp.y * upAmount,
          center.z +
            this.tempSide.z * sideAmount +
            this.tempUp.z * upAmount
        );
      }
    }

    positions.needsUpdate = true;
    beam.geometry.computeVertexNormals();
    beam.geometry.computeBoundingSphere();
  }

  private updateBeamParticles(
    tendril: DrainTendril,
    dt: number,
    progress: number
  ): void {
    const positions = tendril.particles.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;

    const material = tendril.particles
      .material as THREE.PointsMaterial;

    const connected = progress >= 1;

    material.opacity = connected
      ? 0.78 + (Math.sin(tendril.phase * 2.1) + 1) * 0.11
      : 0.18 + progress * 0.25;

    material.size = 0.085 +
      (Math.sin(tendril.phase * 1.7) + 1) * 0.02;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (!connected) {
        // During extension, particles travel along the growing beam.
        const t = (
          (i / PARTICLE_COUNT) * progress
        );

        this.tempPoint.copy(this.tempStart).lerp(
          this.tempEnd,
          t
        );
      } else {
        // Flow direction is target -> Agatha.
        const travel = (
          tendril.particlePhases[i] +
          this.elapsed * (0.85 + (i % 5) * 0.1)
        ) % 1;

        const t = 1 - travel;
        const curve = Math.sin(t * Math.PI);

        const lateralWave = Math.sin(
          this.elapsed * 12 +
          i * 2.17 +
          tendril.phase
        );

        const verticalWave = Math.cos(
          this.elapsed * 9 +
          i * 1.73 +
          tendril.phase
        );

        this.tempPoint.copy(this.tempEnd).lerp(
          this.tempStart,
          travel
        );

        this.tempPoint.addScaledVector(
          this.tempSide,
          curve * lateralWave * 0.16
        );

        this.tempPoint.addScaledVector(
          this.tempUp,
          curve * verticalWave * 0.12
        );
      }

      positions.setXYZ(
        i,
        this.tempPoint.x,
        this.tempPoint.y,
        this.tempPoint.z
      );
    }

    positions.needsUpdate = true;
  }

  private updateAbsorptionEffect(
    receiver: THREE.Vector3,
    dt: number
  ): void {
    const group = this.absorptionGroup;
    const core = this.absorptionCore;
    const points = this.absorptionPoints;

    if (!group || !core || !points) return;

    group.position.copy(receiver);

    const pulse = 1 + Math.sin(this.elapsed * 9) * 0.12;

    core.scale.setScalar(pulse);
    core.rotation.y += dt * 1.8;

    const coreMaterial = core.material as THREE.MeshBasicMaterial;

    coreMaterial.opacity =
      0.55 + (Math.sin(this.elapsed * 12) + 1) * 0.16;

    for (let i = 0; i < this.absorptionRings.length; i++) {
      const ring = this.absorptionRings[i];

      ring.rotation.x += dt * (0.6 + i * 0.22);
      ring.rotation.y += dt * (i % 2 === 0 ? 1.0 : -0.75);
      ring.rotation.z += dt * 0.35;

      const ringPulse =
        1 + Math.sin(this.elapsed * 5 + i * 1.7) * 0.08;

      ring.scale.setScalar(ringPulse);

      const material = ring.material as THREE.MeshBasicMaterial;

      material.opacity =
        (0.48 + Math.sin(this.elapsed * 7 + i) * 0.15) *
        (0.9 + Math.min(this.activeTendrils.size, 4) * 0.025);
    }

    const positions = points.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;

    for (let i = 0; i < ABSORPTION_PARTICLE_COUNT; i++) {
      /*
       * Each particle repeatedly spirals from the outer radius
       * toward the central core, suggesting energy being absorbed.
       */
      const phase = (
        this.absorptionPhases[i] +
        this.elapsed * (0.42 + (i % 6) * 0.035)
      ) % 1;

      const angle =
        i * 2.399963 +
        this.elapsed * (2.5 + (i % 4) * 0.35);

      const radius = 0.08 + phase * 0.68;
      const height = Math.sin(angle * 1.4) * radius * 0.5;

      positions.setXYZ(
        i,
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
    }

    positions.needsUpdate = true;

    const particleMaterial = points.material as THREE.PointsMaterial;

    particleMaterial.opacity =
      0.68 + (Math.sin(this.elapsed * 8) + 1) * 0.13;

    particleMaterial.size =
      0.065 + (Math.sin(this.elapsed * 10) + 1) * 0.018;
  }

  private removeTendril(id: number): void {
    const tendril = this.activeTendrils.get(id);

    if (!tendril) return;

    this.disposeObject(tendril.line);
    this.disposeObject(tendril.glow);
    this.disposeObject(tendril.shadowLine);
    this.disposeObject(tendril.particles);

    this.activeTendrils.delete(id);
  }

  private disposeObject(object: THREE.Object3D): void {
    if (object.parent) {
      object.parent.remove(object);
    }

    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Points
    ) {
      object.geometry.dispose();

      const material = object.material;
      const materials = Array.isArray(material)
        ? material
        : [material];

      for (const item of materials) {
        item.dispose();
      }
    }
  }

  private removeAbsorptionEffect(): void {
    if (this.absorptionGroup) {
      this.scene.remove(this.absorptionGroup);

      this.absorptionGroup.traverse(object => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Points
        ) {
          object.geometry.dispose();

          const material = object.material;
          const materials = Array.isArray(material)
            ? material
            : [material];

          for (const item of materials) {
            item.dispose();
          }
        }
      });
    }

    this.absorptionGroup = null;
    this.absorptionCore = null;
    this.absorptionPoints = null;
    this.absorptionRings = [];
  }

  private clearAllTendrils(): void {
    for (const id of [...this.activeTendrils.keys()]) {
      this.removeTendril(id);
    }

    this.activeTendrils.clear();
  }

  public cancel(): void {
    this.isActive = false;
    this.timer = 0;
    this.tickTimer = 0;
    this.elapsed = 0;

    gameplayRestrictions.clearRestrictionsBySource(
      this.sourceId
    );

    this.clearAllTendrils();
    this.removeAbsorptionEffect();
    audioSystem.stopDarkDrainLoop?.();
  }

  public dispose(): void {
    this.cancel();
  }
}