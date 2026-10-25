/**
 * AgathaTelekineticChoke.ts
 * V.2.0 — Cinematic Arcane Choke
 *
 * Agatha Harkness — Ability 4
 *
 * Features:
 * - Cinematic telekinetic suspension.
 * - Volumetric layered purple energy beams.
 * - Animated occult runes around the target's neck.
 * - Pulsating magical energy and traveling particles.
 * - Impact waves on continuous damage ticks.
 * - Smooth target elevation and release.
 * - Centralized gameplay restrictions.
 * - Reusable particle pool and complete effect cleanup.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { activeAgathaConfig } from './AgathaConfig';

export class AgathaTelekineticChoke {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;

  private getAimDestination: () => {
    pos: THREE.Vector3;
    target: TargetDummy | null;
  };

  private onDamageDealt: (
    dummy: TargetDummy,
    dmg: number,
    hitPos: THREE.Vector3,
    knockback?: THREE.Vector3
  ) => void;

  private onShake: (amount: number) => void;

  public isActive = false;
  public target: TargetDummy | null = null;
  public elevationOffset = 0;

  private timer = 0;
  private tickTimer = 0;
  private elapsed = 0;
  private releaseTimer = 0;

  private readonly sourceId = 'agatha-choke';

  private leftCord: THREE.Line;
  private rightCord: THREE.Line;

  private leftCore: THREE.Mesh;
  private rightCore: THREE.Mesh;

  private leftGlow: THREE.Mesh;
  private rightGlow: THREE.Mesh;

  private neckCoil: THREE.Group;
  private neckRing: THREE.Mesh;
  private neckInnerRing: THREE.Mesh;
  private neckRunes: THREE.Group;

  private chokeLight: THREE.PointLight;
  private impactWave: THREE.Mesh;

  private particlePool: THREE.Mesh[] = [];
  private particleVelocities: THREE.Vector3[] = [];
  private particleLifetimes: number[] = [];
  private particleMaxLifetimes: number[] = [];

  private readonly particleCount = 24;
  private readonly up = new THREE.Vector3(0, 1, 0);

  private readonly leftHandPos = new THREE.Vector3();
  private readonly rightHandPos = new THREE.Vector3();
  private readonly neckPos = new THREE.Vector3();

  private readonly beamDirection = new THREE.Vector3();
  private readonly beamMidpoint = new THREE.Vector3();

  private readonly purple = new THREE.Color(0xb56aff);
  private readonly violet = new THREE.Color(0x7135ff);
  private readonly palePurple = new THREE.Color(0xe9d5ff);

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    getAimDestination: () => {
      pos: THREE.Vector3;
      target: TargetDummy | null;
    },
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
    this.getAimDestination = getAimDestination;
    this.onDamageDealt = onDamageDealt;
    this.onShake = onShake;

    // --------------------------------------------------
    // Dynamic energy filaments
    // --------------------------------------------------

    const createCord = (color: number, opacity: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3()
      ]);

      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);

      return line;
    };

    this.leftCord = createCord(0xc084fc, 0.9);
    this.rightCord = createCord(0xc084fc, 0.9);

    // --------------------------------------------------
    // Volumetric beam cores and outer energy glow
    // --------------------------------------------------

    const createBeam = (
      radius: number,
      color: number,
      opacity: number
    ) => {
      const geometry = new THREE.CylinderGeometry(
        radius * 0.7,
        radius,
        1,
        12,
        1,
        true
      );

      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);

      return mesh;
    };

    this.leftGlow = createBeam(0.095, 0x9333ea, 0.24);
    this.rightGlow = createBeam(0.095, 0x9333ea, 0.24);

    this.leftCore = createBeam(0.025, 0xe9d5ff, 0.95);
    this.rightCore = createBeam(0.025, 0xe9d5ff, 0.95);

    // --------------------------------------------------
    // Animated occult neck sigil
    // --------------------------------------------------

    this.neckCoil = new THREE.Group();
    this.neckCoil.visible = false;
    this.scene.add(this.neckCoil);

    const outerRingGeometry = new THREE.TorusGeometry(
      0.32,
      0.035,
      10,
      40
    );

    this.neckRing = new THREE.Mesh(
      outerRingGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xb56aff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    this.neckRing.rotation.x = Math.PI / 2;
    this.neckCoil.add(this.neckRing);

    const innerRingGeometry = new THREE.TorusGeometry(
      0.235,
      0.018,
      8,
      32
    );

    this.neckInnerRing = new THREE.Mesh(
      innerRingGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xe9d5ff,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    this.neckInnerRing.rotation.x = Math.PI / 2;
    this.neckCoil.add(this.neckInnerRing);

    // Small floating occult rune marks.
    this.neckRunes = new THREE.Group();
    this.neckCoil.add(this.neckRunes);

    const runeMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8b4fe,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    for (let i = 0; i < 8; i++) {
      const rune = new THREE.Group();

      const stem = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.105, 0.012),
        runeMaterial
      );

      const crossbar = new THREE.Mesh(
        new THREE.BoxGeometry(0.065, 0.015, 0.012),
        runeMaterial
      );

      crossbar.position.y = 0.025;
      crossbar.rotation.z = i % 2 === 0 ? 0.5 : -0.5;

      const tip = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.022, 0),
        runeMaterial
      );

      tip.position.y = 0.075;

      rune.add(stem, crossbar, tip);

      const angle = (i / 8) * Math.PI * 2;
      rune.position.set(
        Math.cos(angle) * 0.34,
        Math.sin(angle) * 0.34,
        0.025
      );

      rune.rotation.z = angle - Math.PI / 2;
      this.neckRunes.add(rune);
    }

    // --------------------------------------------------
    // Magical light
    // --------------------------------------------------

    this.chokeLight = new THREE.PointLight(
      0xa855f7,
      0,
      7,
      2
    );

    this.scene.add(this.chokeLight);

    // --------------------------------------------------
    // Expanding damage wave
    // --------------------------------------------------

    this.impactWave = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.025, 8, 32),
      new THREE.MeshBasicMaterial({
        color: 0xc084fc,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    this.impactWave.rotation.x = Math.PI / 2;
    this.impactWave.visible = false;
    this.scene.add(this.impactWave);

    // --------------------------------------------------
    // Reusable energy particles
    // --------------------------------------------------

    for (let i = 0; i < this.particleCount; i++) {
      const geometry = new THREE.SphereGeometry(
        i % 4 === 0 ? 0.035 : 0.018,
        6,
        6
      );

      const material = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xe9d5ff : 0xa855f7,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const particle = new THREE.Mesh(geometry, material);
      particle.visible = false;
      particle.frustumCulled = false;

      this.scene.add(particle);

      this.particlePool.push(particle);
      this.particleVelocities.push(new THREE.Vector3());
      this.particleLifetimes.push(0);
      this.particleMaxLifetimes.push(1);
    }
  }

  // ==================================================
  // Activation
  // ==================================================

  public activate(
    playerPos: THREE.Vector3,
    dummies: TargetDummy[]
  ): boolean {
    const cfg = activeAgathaConfig.arcaneChoke;

    if (this.isActive) {
      this.cancel();
      return false;
    }

    const aim = this.getAimDestination();
    let target = aim.target;

    if (!target || target.isDead) {
      let nearestDistance = cfg.maxRange;

      for (const dummy of dummies) {
        if (dummy.isDead) continue;

        const distance = dummy
          .getCenter()
          .distanceTo(playerPos);

        if (distance <= nearestDistance) {
          nearestDistance = distance;
          target = dummy;
        }
      }
    }

    if (
      !target ||
      target.isDead ||
      target.getCenter().distanceTo(playerPos) > cfg.maxRange
    ) {
      audioSystem.playError?.();
      return false;
    }

    this.isActive = true;
    this.target = target;
    this.timer = cfg.duration;
    this.tickTimer = 0;
    this.elapsed = 0;
    this.releaseTimer = 0;
    this.elevationOffset = 0;

    target.isChoked = true;

    gameplayRestrictions.applyRestriction(
      'NoMovement',
      this.sourceId,
      cfg.duration
    );

    gameplayRestrictions.applyRestriction(
      'NoFlight',
      this.sourceId,
      cfg.duration
    );

    gameplayRestrictions.applyRestriction(
      'Anchored',
      this.sourceId,
      cfg.duration
    );

    gameplayRestrictions.applyRestriction(
      'Stunned',
      this.sourceId,
      cfg.duration
    );

    this.setEffectsVisible(true);

    this.impactWave.visible = false;

    this.chokeLight.intensity = 0;
    this.chokeLight.color.copy(this.purple);

    this.burstParticles(
      target.getCenter(),
      12,
      1.8
    );

    audioSystem.playArcaneChokeStart?.();
    audioSystem.startArcaneChokeLoop?.();
    this.onShake(0.06);

    return true;
  }

  // ==================================================
  // Main update
  // ==================================================

  public update(
    dt: number,
    playerPos: THREE.Vector3
  ): void {
    const delta = Math.min(Math.max(dt, 0), 0.05);

    this.updateParticles(delta);
    this.updateImpactWave(delta);

    if (!this.isActive || !this.target) {
      this.updateRelease(delta);
      return;
    }

    if (this.target.isDead) {
      this.cancel();
      return;
    }

    const cfg = activeAgathaConfig.arcaneChoke;

    this.elapsed += delta;
    this.timer -= delta;
    this.tickTimer += delta;

    // Smooth levitation with a stable target height.
    const liftAlpha = 1 - Math.exp(-3.5 * delta);

    this.elevationOffset = THREE.MathUtils.lerp(
      this.elevationOffset,
      cfg.liftHeight,
      liftAlpha
    );

    this.target.chokeElevation = this.elevationOffset;

    // Refresh world-space hand positions.
    this.stickman.leftHand.getWorldPosition(
      this.leftHandPos
    );

    this.stickman.rightHand.getWorldPosition(
      this.rightHandPos
    );

    // Aim the magical effects at the target's neck.
    this.neckPos.copy(this.target.getCenter());
    this.neckPos.y += 0.45;

    this.updateCord(
      this.leftCord,
      this.leftHandPos,
      this.neckPos
    );

    this.updateCord(
      this.rightCord,
      this.rightHandPos,
      this.neckPos
    );

    this.updateBeam(
      this.leftGlow,
      this.leftHandPos,
      this.neckPos
    );

    this.updateBeam(
      this.rightGlow,
      this.rightHandPos,
      this.neckPos
    );

    this.updateBeam(
      this.leftCore,
      this.leftHandPos,
      this.neckPos
    );

    this.updateBeam(
      this.rightCore,
      this.rightHandPos,
      this.neckPos
    );

    // Animated sigil.
    this.neckCoil.position.copy(this.neckPos);

    const pulse = 1 + Math.sin(this.elapsed * 7) * 0.07;

    this.neckCoil.scale.setScalar(pulse);

    this.neckRing.rotation.z += delta * 1.8;
    this.neckInnerRing.rotation.z -= delta * 2.6;
    this.neckRunes.rotation.z += delta * 0.8;

    const ringMaterial = this.neckRing
      .material as THREE.MeshBasicMaterial;

    ringMaterial.opacity =
      0.7 + (Math.sin(this.elapsed * 8) + 1) * 0.12;

    this.chokeLight.position.copy(this.neckPos);

    this.chokeLight.intensity =
      2.6 + (Math.sin(this.elapsed * 9) + 1) * 0.7;

    // Traveling particles follow both energy connections.
    this.updateBeamParticles(
      this.leftHandPos,
      this.neckPos,
      0
    );

    this.updateBeamParticles(
      this.rightHandPos,
      this.neckPos,
      0.5
    );

    // Periodic damage and impact feedback.
    if (this.tickTimer >= cfg.tickInterval) {
      this.tickTimer %= Math.max(cfg.tickInterval, 0.001);

      this.onDamageDealt(
        this.target,
        cfg.tickDamage,
        this.neckPos.clone()
      );

      this.triggerImpact(this.neckPos);

      this.burstParticles(
        this.neckPos,
        5,
        1.2
      );

      this.onShake(0.02);
      audioSystem.playArcaneChokeTick?.();
    }

    if (this.timer <= 0) {
      this.cancel();
    }
  }

  // ==================================================
  // Beam utilities
  // ==================================================

  private updateCord(
    line: THREE.Line,
    start: THREE.Vector3,
    end: THREE.Vector3
  ): void {
    const position = line.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;

    position.setXYZ(
      0,
      start.x,
      start.y,
      start.z
    );

    position.setXYZ(
      1,
      end.x,
      end.y,
      end.z
    );

    position.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }

  private updateBeam(
    beam: THREE.Mesh,
    start: THREE.Vector3,
    end: THREE.Vector3
  ): void {
    this.beamDirection.subVectors(end, start);

    const length = this.beamDirection.length();

    if (length < 0.001) {
      beam.visible = false;
      return;
    }

    this.beamDirection.normalize();

    this.beamMidpoint
      .copy(start)
      .add(end)
      .multiplyScalar(0.5);

    beam.position.copy(this.beamMidpoint);

    beam.quaternion.setFromUnitVectors(
      this.up,
      this.beamDirection
    );

    beam.scale.set(1, length, 1);

    const material = beam.material as THREE.MeshBasicMaterial;

    if (beam === this.leftGlow || beam === this.rightGlow) {
      material.opacity =
        0.17 + (Math.sin(this.elapsed * 10) + 1) * 0.07;
    }

    beam.visible = true;
  }

  // ==================================================
  // Particle animation
  // ==================================================

  private updateBeamParticles(
    start: THREE.Vector3,
    end: THREE.Vector3,
    offset: number
  ): void {
    for (let i = 0; i < 3; i++) {
      const index = Math.floor(
        (this.elapsed * 8 + i * 7 + offset * 10) %
        this.particleCount
      );

      const particle = this.particlePool[index];

      if (!particle.visible) {
        particle.visible = true;
        this.particleLifetimes[index] = 0.18;
        this.particleMaxLifetimes[index] = 0.18;
      }

      const phase = (
        this.elapsed * 1.8 +
        i / 3 +
        offset
      ) % 1;

      particle.position.lerpVectors(
        start,
        end,
        phase
      );

      particle.scale.setScalar(
        0.65 + Math.sin(phase * Math.PI) * 0.7
      );

      const material = particle.material as THREE.MeshBasicMaterial;
      material.opacity = 0.9;
    }
  }

  private burstParticles(
    position: THREE.Vector3,
    count: number,
    speed: number
  ): void {
    let emitted = 0;

    for (let i = 0; i < this.particlePool.length; i++) {
      const particle = this.particlePool[i];

      if (particle.visible) continue;

      particle.visible = true;
      particle.position.copy(position);

      const direction = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1
      );

      if (direction.lengthSq() < 0.001) {
        direction.set(0, 1, 0);
      }

      direction.normalize().multiplyScalar(
        speed * (0.45 + Math.random() * 0.8)
      );

      this.particleVelocities[i].copy(direction);

      const lifetime = 0.25 + Math.random() * 0.5;

      this.particleLifetimes[i] = lifetime;
      this.particleMaxLifetimes[i] = lifetime;

      particle.scale.setScalar(
        0.65 + Math.random() * 0.8
      );

      emitted++;

      if (emitted >= count) break;
    }
  }

  private updateParticles(dt: number): void {
    for (let i = 0; i < this.particlePool.length; i++) {
      const particle = this.particlePool[i];

      if (!particle.visible) continue;

      const velocity = this.particleVelocities[i];

      // Beam particles are positioned by updateBeamParticles.
      if (
        this.isActive &&
        this.particleLifetimes[i] <= 0
      ) {
        particle.visible = false;
        continue;
      }

      if (this.particleLifetimes[i] > 0) {
        this.particleLifetimes[i] -= dt;

        particle.position.addScaledVector(
          velocity,
          dt
        );

        const maxLife = this.particleMaxLifetimes[i];

        const alpha = THREE.MathUtils.clamp(
          this.particleLifetimes[i] / Math.max(maxLife, 0.001),
          0,
          1
        );

        const material = particle.material as THREE.MeshBasicMaterial;

        material.opacity = alpha;

        particle.scale.multiplyScalar(
          Math.max(0, 1 - dt * 0.5)
        );

        if (this.particleLifetimes[i] <= 0) {
          particle.visible = false;
          material.opacity = 0;
        }
      }
    }
  }

  // ==================================================
  // Damage impact wave
  // ==================================================

  private triggerImpact(position: THREE.Vector3): void {
    this.impactWave.position.copy(position);

    this.impactWave.scale.setScalar(0.65);
    this.impactWave.visible = true;

    const material = this.impactWave
      .material as THREE.MeshBasicMaterial;

    material.opacity = 0.85;
    this.releaseTimer = 0.22;
  }

  private updateImpactWave(dt: number): void {
    if (!this.impactWave.visible) return;

    this.releaseTimer -= dt;

    const progress = THREE.MathUtils.clamp(
      1 - this.releaseTimer / 0.22,
      0,
      1
    );

    const scale = 0.65 + progress * 1.5;

    this.impactWave.scale.setScalar(scale);

    const material = this.impactWave
      .material as THREE.MeshBasicMaterial;

    material.opacity = 0.85 * (1 - progress);

    if (this.releaseTimer <= 0) {
      this.impactWave.visible = false;
      material.opacity = 0;
    }
  }

  // ==================================================
  // Effect visibility
  // ==================================================

  private setEffectsVisible(visible: boolean): void {
    this.leftCord.visible = visible;
    this.rightCord.visible = visible;

    this.leftCore.visible = visible;
    this.rightCore.visible = visible;

    this.leftGlow.visible = visible;
    this.rightGlow.visible = visible;

    this.neckCoil.visible = visible;

    if (!visible) {
      this.chokeLight.intensity = 0;
    }
  }

  // ==================================================
  // Cancellation and cleanup
  // ==================================================

  public cancel(): void {
    if (!this.isActive) return;

    const lastPosition = this.target
      ? this.target.getCenter().clone()
      : null;

    this.isActive = false;

    gameplayRestrictions.clearRestrictionsBySource(
      this.sourceId
    );

    if (this.target) {
      this.target.isChoked = false;
      this.target.chokeElevation = 0;
      this.target = null;
    }

    this.elevationOffset = 0;
    this.timer = 0;
    this.tickTimer = 0;

    this.setEffectsVisible(false);
    audioSystem.stopArcaneChokeLoop?.();

    // Release burst at the target's last position.
    if (lastPosition) {
      this.burstParticles(
        lastPosition,
        12,
        1.4
      );
    }

    this.impactWave.visible = false;
  }

  private updateRelease(dt: number): void {
    // Keep residual release particles animated after cancellation.
    this.updateParticles(dt);
  }

  public dispose(): void {
    this.cancel();

    this.scene.remove(this.leftCord);
    this.scene.remove(this.rightCord);

    this.scene.remove(this.leftCore);
    this.scene.remove(this.rightCore);

    this.scene.remove(this.leftGlow);
    this.scene.remove(this.rightGlow);

    this.scene.remove(this.neckCoil);
    this.scene.remove(this.chokeLight);
    this.scene.remove(this.impactWave);

    this.leftCord.geometry.dispose();
    this.rightCord.geometry.dispose();

    const disposeMaterial = (object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();

        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        for (const material of materials) {
          material.dispose();
        }
      }

      for (const child of object.children) {
        disposeMaterial(child);
      }
    };

    disposeMaterial(this.leftCore);
    disposeMaterial(this.rightCore);

    disposeMaterial(this.leftGlow);
    disposeMaterial(this.rightGlow);

    disposeMaterial(this.neckCoil);
    disposeMaterial(this.impactWave);

    for (const particle of this.particlePool) {
      this.scene.remove(particle);
      particle.geometry.dispose();

      const material = particle.material as THREE.Material;
      material.dispose();
    }

    this.particlePool.length = 0;
    this.particleVelocities.length = 0;
    this.particleLifetimes.length = 0;
    this.particleMaxLifetimes.length = 0;

    this.scene.remove(this.leftCord);
    this.scene.remove(this.rightCord);
  }
}