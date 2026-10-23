/**
 * IronManUnibeam.ts
 * V.2.1 — Cinematic Heavy Unibeam + Gameplay Restrictions
 *
 * Feixe de energia concentrado no reator torácico,
 * com núcleo intenso, camadas energéticas, impacto
 * explosivo, partículas e alcance limitado.
 *
 * Restrições durante a carga e ativação:
 * - NoMovement
 * - NoPowers
 * - NoBasicAttack
 * - NoFlight
 * - Anchored
 *
 * Todas as restrições pertencentes ao Unibeam são
 * removidas ao terminar ou cancelar a habilidade.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeIronManConfig } from './IronManConfig';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { worldCollision } from '../../systems/WorldCollision';

const MAX_RANGE = 34;
const CHARGE_TIME = 0.24;
const BEAM_DURATION = 0.72;
const PARTICLE_COUNT = 34;

const UNIBEAM_RESTRICTION_SOURCE = 'IronManUnibeam';

const UNIBEAM_RESTRICTIONS = [
  'NoMovement',
  'NoPowers',
  'NoBasicAttack',
  'NoFlight',
  'Anchored'
] as const;

type ParticleData = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotationSpeed: THREE.Vector3;
  initialScale: number;
};

type BeamEffect = {
  objects: THREE.Object3D[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
  particles: ParticleData[];
  startedAt: number;
  duration: number;
  direction: THREE.Vector3;
  beamParts: THREE.Mesh[];
  rings: THREE.Mesh[];
  impactLight: THREE.PointLight;
  endpoint: THREE.Vector3;
  raf: number;
  finished: boolean;
};

export class IronManUnibeam {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;

  private onDamageDealt: (
    dummy: TargetDummy,
    dmg: number,
    hitPos: THREE.Vector3,
    knockback?: THREE.Vector3
  ) => void;

  private onShake: (amount: number) => void;

  private effects = new Set<BeamEffect>();
  private disposed = false;
  private lastFireAt = 0;

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

  /**
   * Impede movimento, voo, outros poderes e ataques
   * enquanto o Unibeam estiver sendo executado.
   */
  private applyUnibeamRestrictions(): void {
    // Não sobrescreve restrições de outras habilidades.
    this.releaseUnibeamRestrictions();

    for (const type of UNIBEAM_RESTRICTIONS) {
      gameplayRestrictions.applyRestriction(
        type,
        UNIBEAM_RESTRICTION_SOURCE
      );
    }
  }

  /**
   * Remove exclusivamente as restrições deste Unibeam.
   */
  private releaseUnibeamRestrictions(): void {
    gameplayRestrictions.clearRestrictionsBySource(
      UNIBEAM_RESTRICTION_SOURCE
    );
  }

  public fire(
    aimDestination: {
      pos: THREE.Vector3;
      target: TargetDummy | null;
    }
  ): boolean {
    if (this.disposed) return false;

    const now = performance.now();

    // Evita disparos duplicados quase simultâneos.
    if (now - this.lastFireAt < 150) return false;

    const cfg = activeIronManConfig.unibeam;

    this.stickman.upperTorso.updateWorldMatrix(true, false);

    const chestPos = new THREE.Vector3();
    this.stickman.upperTorso.getWorldPosition(chestPos);

    const requestedDirection = aimDestination.pos
      .clone()
      .sub(chestPos);

    const requestedDistance = requestedDirection.length();

    if (requestedDistance < 0.01) return false;

    const direction = requestedDirection.normalize();

    // Limita fisicamente o comprimento do feixe.
    const beamLength = Math.min(
      requestedDistance,
      MAX_RANGE
    );

    let endpoint = chestPos
      .clone()
      .addScaledVector(direction, beamLength);

    if (cfg.collideWithWorld !== false) {
      const solidHit = worldCollision.segmentHit(chestPos, endpoint, 0.12);
      if (solidHit) endpoint = solidHit.point.clone();
    }

    // Registra o disparo somente após validar a direção.
    this.lastFireAt = now;

    // Bloqueia os controles durante toda a execução.
    this.applyUnibeamRestrictions();

    try {
      audioSystem.playUnibeamSequence?.();

      this.onShake(0.045);

      // O alvo só recebe dano se estiver dentro do alcance.
      if (
        aimDestination.target &&
        !aimDestination.target.isDead &&
        requestedDistance <= MAX_RANGE &&
        (cfg.collideWithWorld === false ||
          !worldCollision.isSegmentBlocked(chestPos, aimDestination.target.getCenter(), 0.12))
      ) {
        const knockback = direction
          .clone()
          .multiplyScalar(8.5);

        knockback.y = 2.8;

        this.onDamageDealt(
          aimDestination.target,
          cfg.damage,
          aimDestination.pos.clone(),
          knockback
        );
      }

      this.createCinematicBeam(
        chestPos,
        endpoint,
        direction,
        beamLength
      );

      return true;
    } catch (error) {
      // Evita deixar o jogador bloqueado em caso de erro.
      this.releaseUnibeamRestrictions();
      throw error;
    }
  }

  private createCinematicBeam(
    origin: THREE.Vector3,
    endpoint: THREE.Vector3,
    direction: THREE.Vector3,
    length: number
  ): void {
    const effect: BeamEffect = {
      objects: [],
      materials: [],
      geometries: [],
      particles: [],
      startedAt: performance.now(),
      duration: CHARGE_TIME + BEAM_DURATION,
      direction: direction.clone(),
      beamParts: [],
      rings: [],
      impactLight: new THREE.PointLight(
        0x6fdfff,
        0,
        8,
        2
      ),
      endpoint: endpoint.clone(),
      raf: 0,
      finished: false
    };

    this.effects.add(effect);

    const addMaterial = (
      color: number,
      emissive: number,
      intensity: number,
      opacity: number,
      additive = true
    ): THREE.MeshBasicMaterial => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: additive
          ? THREE.AdditiveBlending
          : THREE.NormalBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
      });

      // MeshBasicMaterial não possui emissive.
      // A cor representa a emissão visual.
      effect.materials.push(material);

      return material;
    };

    const addBeamLayer = (
      radius: number,
      color: number,
      opacity: number,
      segments: number
    ): THREE.Mesh => {
      const geometry = new THREE.CylinderGeometry(
        radius * 0.9,
        radius,
        1,
        segments,
        1,
        true
      );

      effect.geometries.push(geometry);

      const material = addMaterial(
        color,
        color,
        1,
        opacity
      );

      const mesh = new THREE.Mesh(
        geometry,
        material
      );

      mesh.position.copy(origin).add(
        direction.clone().multiplyScalar(0.5)
      );

      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction
      );

      // O comprimento cresce durante a animação.
      mesh.scale.set(1, length, 1);

      this.scene.add(mesh);
      effect.objects.push(mesh);
      effect.beamParts.push(mesh);

      return mesh;
    };

    // Halo externo difuso.
    addBeamLayer(0.82, 0x168cff, 0.15, 20);

    // Camada de energia azul.
    addBeamLayer(0.59, 0x32caff, 0.28, 20);

    // Núcleo branco-azulado.
    addBeamLayer(0.34, 0x9beeff, 0.72, 16);

    // Linha central quase branca.
    addBeamLayer(0.17, 0xf4ffff, 0.96, 12);

    // Luz dinâmica no ponto de impacto.
    effect.impactLight.position.copy(endpoint);

    this.scene.add(effect.impactLight);
    effect.objects.push(effect.impactLight);

    // Anéis energéticos expansivos.
    for (let i = 0; i < 3; i++) {
      const radius = 0.42 + i * 0.22;

      const geometry = new THREE.TorusGeometry(
        radius,
        0.055 - i * 0.009,
        8,
        32
      );

      effect.geometries.push(geometry);

      const material = addMaterial(
        i === 1 ? 0x42cfff : 0xd8f7ff,
        0xffffff,
        1,
        0.8
      );

      const ring = new THREE.Mesh(
        geometry,
        material
      );

      ring.position.copy(endpoint);

      ring.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        direction
      );

      ring.scale.setScalar(0.2 + i * 0.05);

      this.scene.add(ring);
      effect.objects.push(ring);
      effect.rings.push(ring);
    }

    // Fragmentos de energia e plasma.
    const particleColors = [
      0xffffff,
      0xa8edff,
      0x48caff,
      0xffd18a,
      0xff792e
    ];

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const size = 0.045 + Math.random() * 0.105;

      const geometry = new THREE.IcosahedronGeometry(
        size,
        1
      );

      effect.geometries.push(geometry);

      const material = addMaterial(
        particleColors[
          Math.floor(
            Math.random() * particleColors.length
          )
        ],
        0xffffff,
        1,
        0.95
      );

      const mesh = new THREE.Mesh(
        geometry,
        material
      );

      // Os fragmentos começam concentrados no impacto.
      mesh.position.copy(endpoint);

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.25) * 2,
        (Math.random() - 0.5) * 2
      ).normalize();

      spread.addScaledVector(
        direction,
        0.35
      ).normalize();

      const speed = 2.5 + Math.random() * 5.5;

      const particle: ParticleData = {
        mesh,
        velocity: spread.multiplyScalar(speed),
        rotationSpeed: new THREE.Vector3(
          Math.random() * 8,
          Math.random() * 8,
          Math.random() * 8
        ),
        initialScale: 0.65 + Math.random() * 0.8
      };

      this.scene.add(mesh);
      effect.objects.push(mesh);
      effect.particles.push(particle);
    }

    // O feixe começa recolhido.
    for (const mesh of effect.beamParts) {
      mesh.scale.y = 0.001;
    }

    this.animateEffect(
      effect,
      origin,
      length
    );
  }

  private animateEffect(
    effect: BeamEffect,
    origin: THREE.Vector3,
    length: number
  ): void {
    const up = new THREE.Vector3(0, 1, 0);

    let previousTime = performance.now();

    const tick = (time: number) => {
      if (effect.finished || this.disposed) return;

      const elapsed = (
        time - effect.startedAt
      ) / 1000;

      const delta = Math.min(
        (time - previousTime) / 1000,
        0.04
      );

      previousTime = time;

      const chargeProgress = THREE.MathUtils.clamp(
        elapsed / CHARGE_TIME,
        0,
        1
      );

      const beamProgress = THREE.MathUtils.clamp(
        (elapsed - CHARGE_TIME) / BEAM_DURATION,
        0,
        1
      );

      // Entrada suave com aceleração e desaceleração.
      const eased = chargeProgress < 1
        ? chargeProgress * chargeProgress *
          (3 - 2 * chargeProgress)
        : 1;

      const currentLength = Math.max(
        0.001,
        length * eased
      );

      for (
        let i = 0;
        i < effect.beamParts.length;
        i++
      ) {
        const beam = effect.beamParts[i];

        beam.position.copy(origin).addScaledVector(
          effect.direction,
          currentLength * 0.5
        );

        beam.quaternion.setFromUnitVectors(
          up,
          effect.direction
        );

        beam.scale.y = currentLength;

        // Pulso sutil de energia.
        const pulse =
          1 + Math.sin(
            elapsed * 18 + i * 1.7
          ) * 0.035;

        beam.scale.x = pulse;
        beam.scale.z = pulse;

        const material = beam.material as
          THREE.MeshBasicMaterial;

        const fade = 1 - Math.pow(
          beamProgress,
          3
        );

        const baseOpacity =
          i === 3
            ? 0.96
            : [0.15, 0.28, 0.72][i] ?? 0.2;

        material.opacity =
          baseOpacity *
          (
            elapsed < CHARGE_TIME
              ? eased
              : fade
          );
      }

      // Explosão no fim do feixe.
      const impactProgress = THREE.MathUtils.clamp(
        (elapsed - CHARGE_TIME * 0.65) / 0.22,
        0,
        1
      );

      effect.impactLight.position.copy(
        effect.endpoint
      );

      effect.impactLight.intensity =
        5.5 *
        impactProgress *
        (1 - beamProgress * 0.8);

      // Animação dos anéis de impacto.
      for (
        let i = 0;
        i < effect.rings.length;
        i++
      ) {
        const ring = effect.rings[i];

        ring.position.copy(effect.endpoint);

        const ringProgress = THREE.MathUtils.clamp(
          (elapsed - 0.12 - i * 0.055) / 0.42,
          0,
          1
        );

        const scale =
          0.15 +
          ringProgress * (1.2 + i * 0.35);

        ring.scale.setScalar(scale);

        const material = ring.material as
          THREE.MeshBasicMaterial;

        material.opacity =
          0.8 * (1 - ringProgress);
      }

      // Partículas desaceleram e caem pela gravidade.
      for (const particle of effect.particles) {
        const mesh = particle.mesh;

        particle.velocity.y -= 5.5 * delta;

        particle.velocity.multiplyScalar(
          Math.max(0, 1 - delta * 1.5)
        );

        mesh.position.addScaledVector(
          particle.velocity,
          delta
        );

        mesh.rotation.x +=
          particle.rotationSpeed.x * delta;

        mesh.rotation.y +=
          particle.rotationSpeed.y * delta;

        mesh.rotation.z +=
          particle.rotationSpeed.z * delta;

        const particleAge = Math.max(
          0,
          elapsed - 0.12
        );

        const fade = THREE.MathUtils.clamp(
          1 - particleAge / 0.8,
          0,
          1
        );

        mesh.scale.setScalar(
          particle.initialScale * fade
        );

        const material = mesh.material as
          THREE.MeshBasicMaterial;

        material.opacity = fade * 0.95;
      }

      // Finaliza o efeito e libera os controles.
      if (elapsed >= effect.duration) {
        this.removeEffect(effect);
        return;
      }

      effect.raf = requestAnimationFrame(tick);
    };

    effect.raf = requestAnimationFrame(tick);
  }

  private removeEffect(effect: BeamEffect): void {
    if (effect.finished) return;

    effect.finished = true;

    cancelAnimationFrame(effect.raf);

    for (const object of effect.objects) {
      this.scene.remove(object);
    }

    for (const geometry of effect.geometries) {
      geometry.dispose();
    }

    for (const material of effect.materials) {
      material.dispose();
    }

    this.effects.delete(effect);

    // Libera apenas quando não houver outro efeito ativo
    // pertencente a esta instância do Unibeam.
    if (this.effects.size === 0) {
      this.releaseUnibeamRestrictions();
    }
  }

  public dispose(): void {
    if (this.disposed) return;

    this.disposed = true;

    for (const effect of Array.from(this.effects)) {
      this.removeEffect(effect);
    }

    this.effects.clear();

    // Garantia extra de limpeza ao destruir a habilidade.
    this.releaseUnibeamRestrictions();
  }
}