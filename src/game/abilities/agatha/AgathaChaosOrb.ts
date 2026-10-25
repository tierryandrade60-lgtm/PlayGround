
/**
 * AgathaChaosOrb.ts
 * V.5.0 — Coven Absorption / Arcane Bézier Shockwave
 *
 * Visual aprimorado:
 * - Absorção com filamentos Bézier curvos e espessos.
 * - Núcleo mágico pulsante durante a concentração.
 * - Disco horizontal com anéis largos e múltiplas camadas.
 * - Arcos Bézier 3D com núcleo luminoso e borda escura.
 * - Partículas lançadas radialmente em 360 graus.
 * - Runas e energia violeta durante a descarga.
 *
 * Mantém: fire(), update(dt, dummies), dispose().
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeAgathaConfig } from './AgathaConfig';
import { worldCollision } from '../../systems/WorldCollision';

type AimResult = {
  pos: THREE.Vector3;
  target: TargetDummy | null;
};

type DamageCallback = (
  dummy: TargetDummy,
  damage: number,
  hitPos: THREE.Vector3,
  knockback?: THREE.Vector3
) => void;

type ChaosEffect = {
  group: THREE.Group;
  origin: THREE.Vector3;
  phase: 'absorbing' | 'release';
  age: number;
  previousRadius: number;
  maxRadius: number;
  affected: Set<TargetDummy>;

  absorptionCurves: THREE.Mesh[];
  filaments: THREE.Mesh[];
  particles: THREE.Points;
  particleVelocities: THREE.Vector3[];

  rings: THREE.Mesh[];
  bezierArcs: THREE.Mesh[];
  runeRing: THREE.Mesh;
  core: THREE.Mesh;
  coreGlow: THREE.Mesh;
};

export class AgathaChaosOrb {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAimDestination: () => AimResult;
  private onDamageDealt: DamageCallback;
  private onShake: (amount: number) => void;

  private effect: ChaosEffect | null = null;
  private cooldownRemaining = 0;
  private disposed = false;

  private readonly chargeDuration = 1.55;
  private readonly releaseDuration = 1.05;
  private readonly particleCount = 150;
  private readonly filamentCount = 22;
  private readonly arcCount = 20;

  private readonly colors = {
    dark: 0x190521,
    deepPurple: 0x35104f,
    purple: 0x7621b8,
    bright: 0xb94cff,
    pale: 0xf0d8ff
  };

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    getAimDestination: () => AimResult,
    onDamageDealt: DamageCallback,
    onShake: (amount: number) => void
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.getAimDestination = getAimDestination;
    this.onDamageDealt = onDamageDealt;
    this.onShake = onShake;
  }

  fire(): boolean {
    if (this.disposed || this.effect || this.cooldownRemaining > 0) {
      return false;
    }

    const cfg = activeAgathaConfig.chaosOrb;
    const origin = new THREE.Vector3();

    // Centro do efeito no personagem.
    this.stickman.root.getWorldPosition(origin);
    origin.y += 1.05;

    const group = new THREE.Group();
    group.position.copy(origin);
    this.scene.add(group);

    const absorptionCurves: THREE.Mesh[] = [];
    const filaments: THREE.Mesh[] = [];
    const rings: THREE.Mesh[] = [];
    const bezierArcs: THREE.Mesh[] = [];

    // -----------------------------------------------------
    // 1. FILAMENTOS DE ABSORÇÃO COM CURVAS BÉZIER ESPESSAS
    // -----------------------------------------------------

    for (let i = 0; i < this.filamentCount; i++) {
      const angle = (i / this.filamentCount) * Math.PI * 2;
      const radius = 3.0 + Math.random() * 2.0;
      const height = (Math.random() - 0.5) * 2.0;

      const start = new THREE.Vector3(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );

      const control = new THREE.Vector3(
        Math.cos(angle + 0.55) * radius * 0.58,
        height + (Math.random() - 0.5) * 1.8,
        Math.sin(angle + 0.55) * radius * 0.58
      );

      const end = new THREE.Vector3(
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.25
      );

      const curve = new THREE.QuadraticBezierCurve3(
        start,
        control,
        end
      );

      const glow = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, 0.075, 7, false),
        new THREE.MeshBasicMaterial({
          color: this.colors.purple,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );

      const core = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 28, 0.025, 6, false),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0
            ? this.colors.pale
            : this.colors.bright,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );

      group.add(glow, core);
      absorptionCurves.push(glow);
      filaments.push(core);
    }

    // -----------------------------------------------------
    // 2. PARTÍCULAS DE ENERGIA
    // -----------------------------------------------------

    const particlePositions = new Float32Array(
      this.particleCount * 3
    );

    const particleVelocities: THREE.Vector3[] = [];

    for (let i = 0; i < this.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.0 + Math.random() * 3.5;

      particlePositions[i * 3] = Math.cos(angle) * radius;
      particlePositions[i * 3 + 1] =
        (Math.random() - 0.5) * 3.0;
      particlePositions[i * 3 + 2] = Math.sin(angle) * radius;

      particleVelocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.8
        )
      );
    }

    const particleGeometry = new THREE.BufferGeometry();

    particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(particlePositions, 3)
    );

    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: this.colors.bright,
        size: 0.14,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
      })
    );

    group.add(particles);

    // -----------------------------------------------------
    // 3. NÚCLEO MÁGICO DA ABSORÇÃO
    // -----------------------------------------------------

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 20, 20),
      new THREE.MeshBasicMaterial({
        color: this.colors.pale,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    const coreGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 20, 20),
      new THREE.MeshBasicMaterial({
        color: this.colors.bright,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    group.add(coreGlow, core, );

    // -----------------------------------------------------
    // 4. CAMADAS DO DISCO HORIZONTAL
    // -----------------------------------------------------

    const ringDefinitions = [
      {
        inner: 0.76,
        outer: 1.0,
        color: this.colors.dark,
        opacity: 0.85
      },
      {
        inner: 0.86,
        outer: 1.0,
        color: this.colors.purple,
        opacity: 0.95
      },
      {
        inner: 0.93,
        outer: 1.0,
        color: this.colors.bright,
        opacity: 1.0
      },
      {
        inner: 0.65,
        outer: 0.73,
        color: this.colors.pale,
        opacity: 0.8
      },
      {
        inner: 0.48,
        outer: 0.55,
        color: this.colors.purple,
        opacity: 0.65
      }
    ];

    for (const definition of ringDefinitions) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(
          definition.inner,
          definition.outer,
          128
        ),
        new THREE.MeshBasicMaterial({
          color: definition.color,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );

      // RingGeometry nasce no plano XY; esta rotação
      // posiciona o disco horizontalmente no plano XZ.
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.5;
      group.add(mesh);
      rings.push(mesh);
    }

    // -----------------------------------------------------
    // 5. ARCOS BÉZIER GROSSOS NA BORDA DA ONDA
    // -----------------------------------------------------

    for (let i = 0; i < this.arcCount; i++) {
      const angle = (i / this.arcCount) * Math.PI * 2;
      const arcLength = (Math.PI * 2 / this.arcCount) * 1.45;

      const a0 = angle;
      const a1 = angle + arcLength;

      const pointAt = (
        a: number,
        radius: number,
        y: number
      ) => new THREE.Vector3(
        Math.cos(a) * radius,
        y,
        Math.sin(a) * radius
      );

      const p0 = pointAt(a0, 1.0, 0);
      const p1 = pointAt(a0 + arcLength * 0.28, 1.17, 0.07);
      const p2 = pointAt(a0 + arcLength * 0.72, 1.17, -0.07);
      const p3 = pointAt(a1, 1.0, 0);

      const curve = new THREE.CubicBezierCurve3(
        p0,
        p1,
        p2,
        p3
      );

      // Camada escura espessa para dar volume à borda.
      const darkArc = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.105, 8, false),
        new THREE.MeshBasicMaterial({
          color: this.colors.dark,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );

      // Núcleo violeta luminoso.
      const purpleArc = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.065, 8, false),
        new THREE.MeshBasicMaterial({
          color: this.colors.bright,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );

      // Filete claro no centro do arco.
      const brightArc = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.022, 6, false),
        new THREE.MeshBasicMaterial({
          color: this.colors.pale,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );

      group.add(darkArc, purpleArc, brightArc);
      bezierArcs.push(darkArc, purpleArc, brightArc);
    }

    // -----------------------------------------------------
    // 6. ANEL RÚNICO
    // -----------------------------------------------------

    const runeRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.055, 8, 144),
      new THREE.MeshBasicMaterial({
        color: this.colors.pale,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );

    runeRing.rotation.x = Math.PI / 2;
    runeRing.position.y = -0.44;
    group.add(runeRing);

    this.effect = {
      group,
      origin: origin.clone(),
      phase: 'absorbing',
      age: 0,
      previousRadius: 0,
      maxRadius: Math.max(1, cfg.splashRadius),
      affected: new Set<TargetDummy>(),
      absorptionCurves,
      filaments,
      particles,
      particleVelocities,
      rings,
      bezierArcs,
      runeRing,
      core,
      coreGlow
    };

    this.cooldownRemaining = cfg.cooldown;
    audioSystem.playChaosOrbCast?.();

    return true;
  }

  update(dt: number, dummies: TargetDummy[]): void {
    if (this.disposed) return;

    const delta = Math.max(0, Math.min(dt, 0.05));

    this.cooldownRemaining = Math.max(
      0,
      this.cooldownRemaining - delta
    );

    const effect = this.effect;
    if (!effect) return;

    effect.age += delta;

    if (effect.phase === 'absorbing') {
      this.updateAbsorption(effect, delta);

      if (effect.age >= this.chargeDuration) {
        effect.phase = 'release';
        effect.age = 0;
        effect.previousRadius = 0;

        // Reposiciona as partículas junto ao centro para que
        // sejam lançadas radialmente quando a onda for liberada.
        const positions = effect.particles.geometry.attributes
          .position as THREE.BufferAttribute;

        for (let i = 0; i < this.particleCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 0.2 + Math.random() * 0.45;

          positions.setXYZ(
            i,
            Math.cos(angle) * radius,
            (Math.random() - 0.5) * 0.3,
            Math.sin(angle) * radius
          );

          effect.particleVelocities[i].set(
            Math.cos(angle),
            (Math.random() - 0.5) * 0.7,
            Math.sin(angle)
          );
        }

        positions.needsUpdate = true;

        // A energia se comprime antes da descarga.
        effect.core.scale.setScalar(1.5);
        effect.coreGlow.scale.setScalar(1.8);

        for (const mesh of effect.absorptionCurves) {
          (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        }

        for (const mesh of effect.filaments) {
          (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
        }

        audioSystem.playChaosOrbImpact?.();

        this.onShake(
          Math.max(
            0.02,
            activeAgathaConfig.chaosOrb.shakeAmount
          )
        );
      }

      return;
    }

    this.updateRelease(effect, delta, dummies);

    if (effect.age >= this.releaseDuration) {
      this.destroyEffect();
    }
  }

  private updateAbsorption(
    effect: ChaosEffect,
    dt: number
  ): void {
    const progress = Math.min(
      1,
      effect.age / this.chargeDuration
    );

    const eased = progress * progress * (3 - 2 * progress);

    // Filamentos Bézier convergem para o núcleo.
    effect.absorptionCurves.forEach((mesh, index) => {
      const scale = Math.max(0.12, 1 - eased * 0.76);
      const pulse = 0.92 + Math.sin(
        effect.age * 14 + index * 0.8
      ) * 0.08;

      mesh.scale.setScalar(scale * pulse);

      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.25 + Math.sin(progress * Math.PI) * 0.7;
    });

    effect.filaments.forEach((mesh, index) => {
      const scale = Math.max(0.12, 1 - eased * 0.76);
      const pulse = 0.9 + Math.sin(
        effect.age * 16 + index
      ) * 0.1;

      mesh.scale.setScalar(scale * pulse);

      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.3 + Math.sin(progress * Math.PI) * 0.7;
    });

    // Partículas são puxadas para o centro.
    const positions = effect.particles.geometry.attributes
      .position as THREE.BufferAttribute;

    for (let i = 0; i < this.particleCount; i++) {
      let x = positions.getX(i);
      let y = positions.getY(i);
      let z = positions.getZ(i);

      const strength = 1.0 + eased * 5.0;

      x -= x * strength * dt;
      y -= y * strength * dt * 0.7;
      z -= z * strength * dt;

      positions.setXYZ(i, x, y, z);
    }

    positions.needsUpdate = true;

    const particleMaterial = effect.particles.material as THREE.PointsMaterial;
    particleMaterial.size = 0.1 + eased * 0.1;
    particleMaterial.opacity = 0.7 + eased * 0.3;

    // O núcleo ganha brilho e intensidade.
    const pulse = 0.8 + Math.sin(effect.age * 19) * 0.2;

    effect.core.scale.setScalar(
      (0.45 + eased * 0.9) * pulse
    );

    effect.coreGlow.scale.setScalar(
      (0.45 + eased * 1.25) * pulse
    );

    (effect.core.material as THREE.MeshBasicMaterial).opacity =
      eased * 0.95;

    (effect.coreGlow.material as THREE.MeshBasicMaterial).opacity =
      eased * 0.65;

    // Anéis internos giram e se comprimem durante a carga.
    effect.rings.forEach((ring, index) => {
      const material = ring.material as THREE.MeshBasicMaterial;
      const rotation = index % 2 === 0 ? 1 : -1;

      ring.scale.setScalar(
        Math.max(0.15, 0.45 + eased * 0.4)
      );

      ring.rotation.z += dt * rotation * (1.2 + index * 0.15);
      material.opacity = eased * (0.2 + index * 0.08);
    });

    effect.runeRing.scale.set(
      0.35 + eased * 0.45,
      1,
      0.35 + eased * 0.45
    );

    (effect.runeRing.material as THREE.MeshBasicMaterial).opacity =
      eased * 0.8;
  }

  private updateRelease(
    effect: ChaosEffect,
    dt: number,
    dummies: TargetDummy[]
  ): void {
    const progress = Math.min(
      1,
      effect.age / this.releaseDuration
    );

    // Descarga rápida no início, desacelerando no fim.
    const eased = 1 - Math.pow(1 - progress, 2.2);
    const radius = effect.maxRadius * eased;

    // Várias camadas dão largura visual ao disco.
    effect.rings.forEach((ring, index) => {
      const material = ring.material as THREE.MeshBasicMaterial;
      const scaleFactor = 1 - index * 0.035;

      ring.position.y = -0.5 + index * 0.035;
      ring.scale.set(
        radius * scaleFactor,
        radius * scaleFactor,
        1
      );

      material.opacity = Math.max(
        0,
        (1 - progress) * (0.95 - index * 0.12)
      );

      ring.rotation.z += dt * (index % 2 === 0 ? 0.65 : -0.9);
    });

    // Arcos Bézier espessos acompanham a borda do disco.
    effect.bezierArcs.forEach((arc, index) => {
      const material = arc.material as THREE.MeshBasicMaterial;

      arc.scale.set(radius, 1, radius);

      const layer = index % 3;
      const fade = Math.max(0, 1 - progress * 1.2);

      material.opacity = fade * (
        layer === 0 ? 0.85 :
        layer === 1 ? 1.0 : 0.95
      );
    });

    // O anel rúnico acompanha a expansão, sem virar esfera.
    effect.runeRing.scale.set(radius, 1, radius);

    (effect.runeRing.material as THREE.MeshBasicMaterial).opacity =
      Math.max(0, 1 - progress * 1.25);

    // Partículas percorrem o plano horizontal em todas as direções.
    const positions = effect.particles.geometry.attributes
      .position as THREE.BufferAttribute;

    for (let i = 0; i < this.particleCount; i++) {
      let x = positions.getX(i);
      let y = positions.getY(i);
      let z = positions.getZ(i);

      const length = Math.sqrt(x * x + z * z) || 0.001;
      const vx = x / length;
      const vz = z / length;
      const speed = 3.5 + (i % 9) * 0.65;

      x += vx * speed * dt;
      z += vz * speed * dt;

      y += Math.sin(effect.age * 12 + i) * 0.12 * dt;

      positions.setXYZ(i, x, y, z);
    }

    positions.needsUpdate = true;

    (effect.particles.material as THREE.PointsMaterial).opacity =
      Math.max(0, 1 - progress);

    this.applyWaveDamage(effect, radius, dummies);
    effect.previousRadius = radius;
  }

  private applyWaveDamage(
    effect: ChaosEffect,
    radius: number,
    dummies: TargetDummy[]
  ): void {
    const cfg = activeAgathaConfig.chaosOrb;
    const ringThickness = 0.8;

    for (const dummy of dummies) {
      if (effect.affected.has(dummy) || (dummy as any).isDead) {
        continue;
      }

      const targetPos = this.getDummyPosition(dummy);
      if (!targetPos) continue;
      if (
        cfg.collideWithWorld !== false &&
        worldCollision.isSegmentBlocked(effect.origin, targetPos, 0.12)
      ) {
        continue;
      }

      const dx = targetPos.x - effect.origin.x;
      const dz = targetPos.z - effect.origin.z;

      const distance = Math.sqrt(dx * dx + dz * dz);
      const verticalDistance = Math.abs(
        targetPos.y - effect.origin.y
      );

      if (verticalDistance > 3.0) continue;

      const crossedRing =
        distance >= effect.previousRadius - ringThickness &&
        distance <= radius + ringThickness;

      if (!crossedRing) continue;

      effect.affected.add(dummy);

      const direction = new THREE.Vector3(dx, 0, dz);

      if (direction.lengthSq() < 0.0001) {
        direction.set(1, 0, 0);
      }

      direction.normalize();

      const falloff = Math.max(
        0.65,
        1 - (distance / effect.maxRadius) * 0.3
      );

      const damage = Math.round(cfg.splashDamage * falloff);

      const knockback = direction.multiplyScalar(10);
      knockback.y = 2.8;

      this.onDamageDealt(
        dummy,
        damage,
        targetPos.clone(),
        knockback
      );
    }
  }

  private getDummyPosition(
    dummy: TargetDummy
  ): THREE.Vector3 | null {
    const target = dummy as any;

    const object =
      target.root ??
      target.mesh ??
      target.group ??
      target.model ??
      target.object3D;

    if (object && typeof object.getWorldPosition === 'function') {
      const position = new THREE.Vector3();
      object.getWorldPosition(position);
      return position;
    }

    if (target.position instanceof THREE.Vector3) {
      return target.position.clone();
    }

    return null;
  }

  private destroyEffect(): void {
    if (!this.effect) return;

    const group = this.effect.group;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();

    group.traverse((object) => {
      const resource = object as any;

      if (resource.geometry?.dispose) {
        geometries.add(resource.geometry);
      }

      const material = resource.material;

      if (Array.isArray(material)) {
        material.forEach((item: THREE.Material) => {
          materials.add(item);
        });
      } else if (material?.dispose) {
        materials.add(material);
      }
    });

    for (const geometry of geometries) {
      geometry.dispose();
    }

    for (const material of materials) {
      material.dispose();
    }

    this.scene.remove(group);
    this.effect = null;
  }

  dispose(): void {
    this.disposed = true;
    this.destroyEffect();
  }
}
