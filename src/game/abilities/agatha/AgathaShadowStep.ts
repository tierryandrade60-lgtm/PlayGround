
/**
 * AgathaShadowStep.ts
 * V.6.0
 */

import * as THREE from 'three';
import { audioSystem } from '../../AudioSystem';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { activeAgathaConfig } from './AgathaConfig';
import {
  DEFAULT_BODY_HEIGHT,
  DEFAULT_STEP_HEIGHT,
} from '../../systems/MovementSystem';

type EffectParticle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotation: THREE.Vector3;
  phase: number;
  initialScale: number;
};

type EffectRing = {
  mesh: THREE.Mesh;
  startScale: number;
  endScale: number;
  rotationSpeed: number;
  opacity: number;
};

type TeleportEffect = {
  group: THREE.Group;
  particles: EffectParticle[];
  rings: EffectRing[];
  core: THREE.Mesh;
  halo: THREE.Mesh;
  spiral: THREE.Line;
  elapsed: number;
  duration: number;
};

type MeshVisualState = {
  mesh: THREE.Mesh;
  originalMaterial: THREE.Material | THREE.Material[];
  clonedMaterials: THREE.Material[];
  baseOpacities: number[];
};

type PendingTeleport = {
  origin: THREE.Vector3;
  destination: THREE.Vector3;
  onTeleport: (dest: THREE.Vector3) => void;
  phase: 'charging' | 'arrival';
  elapsed: number;
  chargeDuration: number;
  arrivalFadeDuration: number;
};

export class AgathaShadowStep {
  private scene: THREE.Scene;
  private onShake: (amount: number) => void;

  private effects: TeleportEffect[] = [];
  private rafId: number | null = null;
  private lastTime = 0;
  private disposed = false;

  private pendingTeleport: PendingTeleport | null = null;
  private visualStates: MeshVisualState[] = [];
  private restrictionsActive = false;

  private readonly effectName = 'AgathaShadowStepEffect';
  private readonly sourceId = 'agatha-shadow-step';

  private readonly purple = 0x9b55ed;
  private readonly lightPurple = 0xd8b0ff;

  private readonly chargeDuration = 0.4;
  private readonly arrivalFadeDuration = 0.3;

  constructor(
    scene: THREE.Scene,
    onShake: (amount: number) => void
  ) {
    this.scene = scene;
    this.onShake = onShake;
    this.clearSceneEffects();
  }

  public execute(
    currentPos: THREE.Vector3,
    inputDir: THREE.Vector3,
    structureBoxes: THREE.Box3[],
    onTeleport: (dest: THREE.Vector3) => void,
    aimPoint?: THREE.Vector3,
    playerVisual?: THREE.Object3D
  ): boolean {
    if (this.disposed || this.pendingTeleport) {
      return false;
    }

    const configuredDistance = Math.max(
      0,
      activeAgathaConfig.shadowStep.distance
    );

    if (configuredDistance <= 0) {
      return false;
    }

    const direction = new THREE.Vector3();

    if (aimPoint && aimPoint.distanceTo(currentPos) > 0.5) {
      direction.subVectors(aimPoint, currentPos);
      direction.y = 0;
    }

    if (direction.lengthSq() < 0.0025) {
      direction.copy(inputDir);
      direction.y = 0;
    }

    if (direction.lengthSq() < 0.0025) {
      direction.set(0, 0, -1);
    }

    direction.normalize();

    let requestedDistance = configuredDistance;

    if (aimPoint && aimPoint.distanceTo(currentPos) > 0.5) {
      const aimDistance = new THREE.Vector3()
        .subVectors(aimPoint, currentPos);

      aimDistance.y = 0;

      if (aimDistance.lengthSq() > 0.0025) {
        requestedDistance = Math.min(
          configuredDistance,
          aimDistance.length()
        );
      }
    }

    const step = 0.15;
    let validDistance = requestedDistance;

    for (
      let d = step;
      d <= requestedDistance + 0.0001;
      d += step
    ) {
      const checkDistance = Math.min(d, requestedDistance);

      const testPosition = currentPos.clone().addScaledVector(
        direction,
        checkDistance
      );

      if (this.isBlocked(testPosition, structureBoxes)) {
        validDistance = Math.max(0, checkDistance - step);
        break;
      }
    }

    const destination = currentPos.clone().addScaledVector(
      direction,
      validDistance
    );

    destination.y = currentPos.y;

    if (validDistance < 0.05) {
      return false;
    }

    this.clearEffects();
    this.restoreVisual();

    this.prepareVisual(playerVisual);

    this.pendingTeleport = {
      origin: currentPos.clone(),
      destination,
      onTeleport,
      phase: 'charging',
      elapsed: 0,
      chargeDuration: this.chargeDuration,
      arrivalFadeDuration: this.arrivalFadeDuration
    };

    // Bloqueia movimento, poderes e dano durante toda a sequência.
    this.applyTeleportRestrictions();

    // Efeito de preparação mais curto e intenso.
    this.createEffect(
      currentPos,
      false,
      this.chargeDuration + 0.12
    );

    audioSystem.playShadowStep?.('depart');
    this.onShake(0.035);

    this.startAnimation();

    return true;
  }

  private applyTeleportRestrictions(): void {
    if (this.restrictionsActive) return;

    const totalDuration =
      this.chargeDuration +
      this.arrivalFadeDuration +
      0.25;

    gameplayRestrictions.applyRestriction(
      'Anchored',
      this.sourceId,
      totalDuration
    );

    gameplayRestrictions.applyRestriction(
      'NoFlight',
      this.sourceId,
      totalDuration
    );

    gameplayRestrictions.applyRestriction(
      'NoPowers',
      this.sourceId,
      totalDuration
    );

    gameplayRestrictions.applyRestriction(
      'Invulnerable',
      this.sourceId,
      totalDuration
    );

    this.restrictionsActive = true;
  }

  private releaseTeleportRestrictions(): void {
    if (!this.restrictionsActive) return;

    gameplayRestrictions.clearRestrictionsBySource(
      this.sourceId
    );

    this.restrictionsActive = false;
  }

  private isBlocked(
    position: THREE.Vector3,
    structureBoxes: THREE.Box3[]
  ): boolean {
    const radius = 0.55;

    for (const box of structureBoxes) {
      if (!box || box.isEmpty()) continue;

      // Ledges reachable in one step are walkable surfaces, not obstacles:
      // the character can land on top of them instead of being blocked.
      if (box.max.y <= position.y + DEFAULT_STEP_HEIGHT) continue;
      // Geometry entirely above the head never blocks.
      if (box.min.y >= position.y + DEFAULT_BODY_HEIGHT) continue;

      if (
        position.x > box.min.x - radius &&
        position.x < box.max.x + radius &&
        position.z > box.min.z - radius &&
        position.z < box.max.z + radius
      ) {
        return true;
      }
    }

    return false;
  }

  private prepareVisual(root?: THREE.Object3D): void {
    if (!root) return;

    root.traverse((object) => {
      const mesh = object as THREE.Mesh;

      if (!mesh.isMesh || !mesh.material) return;

      const originalMaterial = mesh.material;

      const originalMaterials = Array.isArray(originalMaterial)
        ? originalMaterial
        : [originalMaterial];

      const clonedMaterials = originalMaterials.map(
        (material) => material.clone()
      );

      const baseOpacities = clonedMaterials.map(
        (material, index) => {
          material.transparent = true;
          material.depthWrite = false;

          return originalMaterials[index].opacity;
        }
      );

      mesh.material = Array.isArray(originalMaterial)
        ? clonedMaterials
        : clonedMaterials[0];

      this.visualStates.push({
        mesh,
        originalMaterial,
        clonedMaterials,
        baseOpacities
      });
    });

    this.setVisualOpacity(1);
  }

  private setVisualOpacity(visibility: number): void {
    const amount = THREE.MathUtils.clamp(
      visibility,
      0,
      1
    );

    for (const state of this.visualStates) {
      for (
        let i = 0;
        i < state.clonedMaterials.length;
        i++
      ) {
        const material = state.clonedMaterials[i];

        material.opacity =
          state.baseOpacities[i] * amount;

        material.transparent = true;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
    }
  }

  private restoreVisual(): void {
    for (const state of this.visualStates) {
      state.mesh.material = state.originalMaterial;

      for (const material of state.clonedMaterials) {
        material.dispose();
      }
    }

    this.visualStates.length = 0;
  }

  private updatePendingTeleport(dt: number): void {
    const pending = this.pendingTeleport;

    if (!pending) return;

    pending.elapsed += dt;

    if (pending.phase === 'charging') {
      const progress = THREE.MathUtils.clamp(
        pending.elapsed / pending.chargeDuration,
        0,
        1
      );

      const easedFade =
        progress * progress * (3 - 2 * progress);

      this.setVisualOpacity(1 - easedFade);

      if (progress >= 1) {
        pending.onTeleport(pending.destination.clone());

        this.createEffect(
          pending.destination,
          true,
          0.82
        );

        pending.phase = 'arrival';
        pending.elapsed = 0;

        audioSystem.playShadowStep?.('arrive');
        this.onShake(0.06);
      }

      return;
    }

    const progress = THREE.MathUtils.clamp(
      pending.elapsed / pending.arrivalFadeDuration,
      0,
      1
    );

    const easedFade =
      progress * progress * (3 - 2 * progress);

    this.setVisualOpacity(easedFade);

    if (progress >= 1) {
      this.restoreVisual();
      this.pendingTeleport = null;
      this.releaseTeleportRestrictions();
    }
  }

  private createEffect(
    position: THREE.Vector3,
    arrival: boolean,
    durationOverride?: number
  ): void {
    const group = new THREE.Group();

    group.name = this.effectName;
    group.userData.agathaShadowStep = true;
    group.position.copy(position);

    const effect: TeleportEffect = {
      group,
      particles: [],
      rings: [],
      core: null as unknown as THREE.Mesh,
      halo: null as unknown as THREE.Mesh,
      spiral: null as unknown as THREE.Line,
      elapsed: 0,
      duration:
        durationOverride ?? (arrival ? 0.82 : 0.52)
    };

    const count = arrival ? 58 : 52;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.12 + Math.random() * 0.65;
      const size = 0.025 + Math.random() * 0.055;

      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(size, 1),
        new THREE.MeshBasicMaterial({
          color: Math.random() > 0.4
            ? this.purple
            : this.lightPurple,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false
        })
      );

      mesh.position.set(
        Math.cos(angle) * radius,
        0.12 + Math.random() * 1.6,
        Math.sin(angle) * radius
      );

      group.add(mesh);

      const velocity = new THREE.Vector3(
        Math.cos(angle) * (0.7 + Math.random() * 1.5),
        0.75 + Math.random() * 1.9,
        Math.sin(angle) * (0.7 + Math.random() * 1.5)
      );

      velocity.multiplyScalar(arrival ? 1.3 : 0.85);

      effect.particles.push({
        mesh,
        velocity,
        rotation: new THREE.Vector3(
          Math.random() * 9,
          Math.random() * 9,
          Math.random() * 9
        ),
        phase: Math.random() * Math.PI * 2,
        initialScale: 0.75 + Math.random() * 0.65
      });
    }

    const ringSettings = [
      {
        start: 0.15,
        end: 2.35,
        tube: 0.04,
        spin: 3.8,
        opacity: 1
      },
      {
        start: 0.28,
        end: 1.8,
        tube: 0.024,
        spin: -4.5,
        opacity: 0.82
      },
      {
        start: 0.12,
        end: 1.3,
        tube: 0.016,
        spin: 6,
        opacity: 0.7
      }
    ];

    for (const settings of ringSettings) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.55,
          settings.tube,
          10,
          72
        ),
        new THREE.MeshBasicMaterial({
          color: this.lightPurple,
          transparent: true,
          opacity: settings.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false
        })
      );

      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.07;
      ring.scale.setScalar(settings.start);

      group.add(ring);

      effect.rings.push({
        mesh: ring,
        startScale: settings.start,
        endScale: settings.end,
        rotationSpeed: settings.spin,
        opacity: settings.opacity
      });
    }

    effect.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.19, 1),
      new THREE.MeshBasicMaterial({
        color: this.lightPurple,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );

    effect.core.position.y = 0.8;
    group.add(effect.core);

    effect.halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshBasicMaterial({
        color: this.purple,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );

    effect.halo.position.copy(effect.core.position);
    group.add(effect.halo);

    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const angle = t * Math.PI * 5.5;
      const radius = 0.07 + t * 0.25;

      points.push(
        new THREE.Vector3(
          Math.cos(angle) * radius,
          0.2 + t * 1.2,
          Math.sin(angle) * radius
        )
      );
    }

    effect.spiral = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: this.lightPurple,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      })
    );

    group.add(effect.spiral);

    this.scene.add(group);
    this.effects.push(effect);
  }

  public update(_deltaTime: number): void {
    // Mantido para compatibilidade com controladores antigos.
  }

  private startAnimation(): void {
    if (this.disposed || this.rafId !== null) return;

    this.lastTime = performance.now();

    const tick = (now: number): void => {
      this.rafId = null;

      if (this.disposed) {
        this.clearEffects();
        this.cancelPendingTeleport();
        return;
      }

      const deltaTime = Math.min(
        Math.max((now - this.lastTime) / 1000, 0),
        0.05
      );

      this.lastTime = now;

      this.animateEffects(deltaTime);
      this.updatePendingTeleport(deltaTime);

      if (
        this.effects.length > 0 ||
        this.pendingTeleport !== null
      ) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.lastTime = 0;
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private animateEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];

      effect.elapsed += dt;

      const progress = Math.min(
        effect.elapsed / effect.duration,
        1
      );

      const fade = Math.max(0, 1 - progress);
      const eased = 1 - Math.pow(1 - progress, 2);

      for (const ring of effect.rings) {
        const scale =
          ring.startScale +
          (ring.endScale - ring.startScale) * eased;

        ring.mesh.scale.setScalar(scale);
        ring.mesh.rotation.z += ring.rotationSpeed * dt;

        (
          ring.mesh.material as THREE.MeshBasicMaterial
        ).opacity = ring.opacity * fade;
      }

      for (const particle of effect.particles) {
        particle.mesh.position.addScaledVector(
          particle.velocity,
          dt
        );

        particle.mesh.rotation.x +=
          particle.rotation.x * dt;

        particle.mesh.rotation.y +=
          particle.rotation.y * dt;

        particle.mesh.rotation.z +=
          particle.rotation.z * dt;

        particle.mesh.position.y +=
          Math.sin(
            effect.elapsed * 12 + particle.phase
          ) * dt * 0.22;

        (
          particle.mesh.material as THREE.MeshBasicMaterial
        ).opacity = fade;

        particle.mesh.scale.setScalar(
          Math.max(
            0.001,
            fade * particle.initialScale
          )
        );
      }

      effect.core.rotation.x += dt * 4;
      effect.core.rotation.y += dt * 5.5;

      const pulse =
        1 + Math.sin(effect.elapsed * 23) * 0.2;

      effect.core.scale.setScalar(
        Math.max(0.001, fade * pulse)
      );

      (
        effect.core.material as THREE.MeshBasicMaterial
      ).opacity = fade;

      effect.halo.scale.setScalar(
        Math.max(
          0.001,
          (
            1 +
            Math.sin(effect.elapsed * 17) * 0.25
          ) * fade
        )
      );

      (
        effect.halo.material as THREE.MeshBasicMaterial
      ).opacity = 0.72 * fade;

      effect.spiral.rotation.y += dt * 5;
      effect.spiral.rotation.x =
        Math.sin(effect.elapsed * 5) * 0.17;

      (
        effect.spiral.material as THREE.LineBasicMaterial
      ).opacity = 0.95 * fade;

      if (effect.elapsed >= effect.duration) {
        this.removeEffect(effect);
        this.effects.splice(i, 1);
      }
    }
  }

  private removeEffect(effect: TeleportEffect): void {
    this.scene.remove(effect.group);

    effect.group.traverse((object) => {
      const renderObject = object as THREE.Mesh | THREE.Line;

      if (renderObject.geometry) {
        renderObject.geometry.dispose();
      }

      if (renderObject.material) {
        const materials = Array.isArray(renderObject.material)
          ? renderObject.material
          : [renderObject.material];

        for (const material of materials) {
          material.dispose();
        }
      }
    });

    effect.group.clear();
  }

  private clearEffects(): void {
    for (const effect of this.effects) {
      this.removeEffect(effect);
    }

    this.effects.length = 0;
  }

  private cancelPendingTeleport(): void {
    this.pendingTeleport = null;
    this.restoreVisual();
    this.releaseTeleportRestrictions();
  }

  private clearSceneEffects(): void {
    const roots: THREE.Object3D[] = [];

    this.scene.traverse((object) => {
      if (
        object.name === this.effectName ||
        object.userData.agathaShadowStep === true
      ) {
        roots.push(object);
      }
    });

    for (const object of roots) {
      if (object.parent) {
        object.parent.remove(object);
      }

      object.traverse((child) => {
        const renderObject = child as THREE.Mesh | THREE.Line;

        if (renderObject.geometry) {
          renderObject.geometry.dispose();
        }

        if (renderObject.material) {
          const materials = Array.isArray(renderObject.material)
            ? renderObject.material
            : [renderObject.material];

          for (const material of materials) {
            material.dispose();
          }
        }
      });

      object.clear();
    }
  }

  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.cancelPendingTeleport();
    this.clearEffects();
    this.clearSceneEffects();
  }
}
