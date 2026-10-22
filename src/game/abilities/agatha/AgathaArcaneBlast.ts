/**
 * AgathaArcaneBlast.ts
 * V.2.0 — Agatha's Dark Arcane Bolts
 *
 * Basic attack: alternating hand-cast occult bolts.
 * Dense violet core, dark ink-like energy, subtle flight particles,
 * controlled homing, and an animated impact burst.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeAgathaConfig } from './AgathaConfig';

export interface ArcaneBoltInstance {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  startPos: THREE.Vector3;
  maxRange: number;
  target: TargetDummy | null;
  homingStrength: number;
  isDead: boolean;
  traveled: number;
  trailTimer: number;
  age: number;
}

interface ArcaneImpactEffect {
  group: THREE.Group;
  particles: THREE.Points;
  velocities: THREE.Vector3[];
  life: number;
  duration: number;
  rings: THREE.Mesh[];
}

export class AgathaArcaneBlast {
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

  public onArcaneCast?: (
    hand: 'left' | 'right',
    aimPitch: number
  ) => void;

  private currentHand: 'left' | 'right' = 'right';
  private bolts: ArcaneBoltInstance[] = [];
  private impacts: ArcaneImpactEffect[] = [];

  // Lower multiplier makes bolts travel more deliberately.
  private readonly projectileSpeedMultiplier = 0.68;

  // Cosmetic particles are emitted at intervals, not every frame.
  private readonly trailInterval = 0.035;

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
  }

  public fire(aimPitch: number = 0): boolean {
    const cfg = activeAgathaConfig.arcaneBlast;

    this.currentHand = this.currentHand === 'right' ? 'left' : 'right';

    const hand = this.currentHand;
    const handNode =
      hand === 'right'
        ? this.stickman.rightHand
        : this.stickman.leftHand;

    const handPos = new THREE.Vector3();
    handNode.getWorldPosition(handPos);

    const aim = this.getAimDestination();
    const dir = aim.pos.clone().sub(handPos).normalize();

    if (dir.lengthSq() < 0.0001) {
      dir.set(0, 0, -1);
    }

    this.onArcaneCast?.(hand, aimPitch);

    const group = new THREE.Group();

    // Dense dark-violet outer body.
    const shadow = new THREE.Mesh(
      new THREE.SphereGeometry(0.245, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x21052f,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    shadow.scale.set(1.65, 1.0, 1.0);
    group.add(shadow);

    // Bright violet central core.
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.125, 16, 12),
      new THREE.MeshBasicMaterial({
        color: cfg.coreColor,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    group.add(core);

    // Soft, restrained violet aura.
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 16, 12),
      new THREE.MeshBasicMaterial({
        color: cfg.glowColor,
        transparent: true,
        opacity: 0.24,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    aura.scale.set(1.55, 1.0, 1.0);
    group.add(aura);

    // Dark rotating energy bands.
    const rings: THREE.Mesh[] = [];

    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.22 + i * 0.045,
          0.018,
          6,
          18
        ),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? cfg.ringColor : 0x9b48ff,
          transparent: true,
          opacity: i === 0 ? 0.76 : 0.48,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );

      ring.rotation.set(
        Math.PI * 0.35 + i * 0.8,
        i * 0.9,
        Math.PI * 0.2
      );

      rings.push(ring);
      group.add(ring);
    }

    // Small local light to give the bolt a magical presence.
    const light = new THREE.PointLight(cfg.lightColor, 2.0, 4.0);
    group.add(light);

    group.position.copy(handPos);
    group.lookAt(handPos.clone().add(dir));
    this.scene.add(group);

    this.bolts.push({
      mesh: group,
      pos: handPos.clone(),
      vel: dir.multiplyScalar(
        cfg.speed * this.projectileSpeedMultiplier
      ),
      startPos: handPos.clone(),
      maxRange: cfg.maxRange,
      target: aim.target,
      homingStrength: aim.target ? cfg.homingStrength : 0,
      isDead: false,
      traveled: 0,
      trailTimer: 0,
      age: Math.random() * Math.PI * 2,
    });

    audioSystem.playArcaneBlast();
    this.onShake(cfg.shakeAmount);

    return true;
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    const cfg = activeAgathaConfig.arcaneBlast;
    const safeDt = Math.min(Math.max(dt, 0), 0.05);

    this.updateImpacts(safeDt);

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];

      if (bolt.isDead) {
        this.removeBolt(bolt);
        this.bolts.splice(i, 1);
        continue;
      }

      bolt.age += safeDt;

      // Controlled homing that preserves the slower projectile speed.
      if (bolt.target && !bolt.target.isDead && bolt.homingStrength > 0) {
        const toTarget = bolt.target
          .getCenter()
          .sub(bolt.pos)
          .normalize();

        const speed = cfg.speed * this.projectileSpeedMultiplier;
        const desiredVelocity = toTarget.multiplyScalar(speed);

        bolt.vel.lerp(
          desiredVelocity,
          Math.min(1, safeDt * bolt.homingStrength * 0.65)
        );

        if (bolt.vel.lengthSq() > 0.0001) {
          bolt.vel.setLength(speed);
        }
      }

      const step = bolt.vel.clone().multiplyScalar(safeDt);
      bolt.pos.add(step);
      bolt.traveled += step.length();

      bolt.mesh.position.copy(bolt.pos);

      if (bolt.vel.lengthSq() > 0.0001) {
        bolt.mesh.lookAt(bolt.pos.clone().add(bolt.vel));
      }

      // Subtle movement: rotating rings and a gentle aura pulse.
      const pulse = 1 + Math.sin(bolt.age * 10) * 0.075;

      bolt.mesh.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh) {
          if (index === 3 || index === 4) {
            child.rotation.z += safeDt * (index % 2 === 0 ? 2.4 : -1.8);
          }

          if (index === 2) {
            child.scale.set(1.55 * pulse, pulse, 1.0);
          }
        }
      });

      // Discreet purple and dark particles behind the bolt.
      bolt.trailTimer += safeDt;

      while (bolt.trailTimer >= this.trailInterval) {
        bolt.trailTimer -= this.trailInterval;
        this.spawnTrailParticle(bolt);
      }

      if (
        bolt.traveled >= bolt.maxRange ||
        bolt.pos.y < -2.0
      ) {
        this.createImpact(bolt.pos, 0.72);
        this.removeBolt(bolt);
        this.bolts.splice(i, 1);
        continue;
      }

      // Collision detection.
      let hitDummy: TargetDummy | null = null;

      for (const dummy of dummies) {
        if (dummy.isDead) continue;

        const dCenter = dummy.getCenter();

        if (bolt.pos.distanceTo(dCenter) < 1.35) {
          hitDummy = dummy;
          break;
        }
      }

      if (hitDummy) {
        const hitPos = bolt.pos.clone();
        const knockback = bolt.vel
          .clone()
          .normalize()
          .multiplyScalar(4.0);

        knockback.y = 2.2;

        this.onDamageDealt(
          hitDummy,
          cfg.damage,
          hitPos,
          knockback
        );

        audioSystem.playImpact();
        this.onShake(0.035);

        this.createImpact(hitPos, 1.0);
        this.removeBolt(bolt);
        this.bolts.splice(i, 1);
      }
    }
  }

  private spawnTrailParticle(bolt: ArcaneBoltInstance): void {
    const dark = Math.random() < 0.38;
    const color = dark ? 0x260833 : 0xa64dff;

    const size = dark
      ? 0.035 + Math.random() * 0.025
      : 0.025 + Math.random() * 0.035;

    const particle = new THREE.Mesh(
      new THREE.SphereGeometry(size, 6, 5),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: dark ? 0.45 : 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    const back = bolt.vel.clone().normalize().multiplyScalar(
      0.12 + Math.random() * 0.18
    );

    particle.position.copy(bolt.pos).sub(back);

    particle.position.x += (Math.random() - 0.5) * 0.18;
    particle.position.y += (Math.random() - 0.5) * 0.18;
    particle.position.z += (Math.random() - 0.5) * 0.18;

    this.scene.add(particle);

    // Store fading particles as tiny impact effects for unified cleanup.
    const group = new THREE.Group();
    group.add(particle);

    this.impacts.push({
      group,
      particles: new THREE.Points(
        new THREE.BufferGeometry(),
        new THREE.PointsMaterial()
      ),
      velocities: [new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35,
        (Math.random() - 0.5) * 0.35
      )],
      life: 0,
      duration: 0.28 + Math.random() * 0.12,
      rings: [],
    });
  }

  private createImpact(
    position: THREE.Vector3,
    sizeMultiplier: number
  ): void {
    const group = new THREE.Group();
    group.position.copy(position);
    this.scene.add(group);

    const particleCount = 34;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities: THREE.Vector3[] = [];

    const violet = new THREE.Color(0xb35cff);
    const darkViolet = new THREE.Color(0x3b075b);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const color = Math.random() < 0.35 ? darkViolet : violet;

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      const direction = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ).normalize();

      velocities.push(
        direction.multiplyScalar(
          (1.3 + Math.random() * 2.6) * sizeMultiplier
        )
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(colors, 3)
    );

    const particles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.105 * sizeMultiplier,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );

    group.add(particles);

    // Compact expanding rings, not a horizontal shockwave.
    const rings: THREE.Mesh[] = [];

    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.18 + i * 0.11,
          0.025,
          6,
          20
        ),
        new THREE.MeshBasicMaterial({
          color: i === 0 ? 0xc68aff : 0x542079,
          transparent: true,
          opacity: 0.82,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );

      ring.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      group.add(ring);
      rings.push(ring);
    }

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.19 * sizeMultiplier, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xe2c0ff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    group.add(flash);

    this.impacts.push({
      group,
      particles,
      velocities,
      life: 0,
      duration: 0.42,
      rings,
    });
  }

  private updateImpacts(dt: number): void {
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const effect = this.impacts[i];
      effect.life += dt;

      const t = Math.min(effect.life / effect.duration, 1);
      const fade = 1 - t;

      if (effect.particles.parent === effect.group) {
        const positionAttribute = effect.particles.geometry.getAttribute(
          'position'
        ) as THREE.BufferAttribute;

        if (positionAttribute.count > 0) {
          for (
            let p = 0;
            p < Math.min(positionAttribute.count, effect.velocities.length);
            p++
          ) {
            const velocity = effect.velocities[p];

            positionAttribute.setXYZ(
              p,
              positionAttribute.getX(p) + velocity.x * dt,
              positionAttribute.getY(p) + velocity.y * dt,
              positionAttribute.getZ(p) + velocity.z * dt
            );

            velocity.multiplyScalar(Math.max(0, 1 - dt * 2.4));
          }

          positionAttribute.needsUpdate = true;
        }

        const material = effect.particles.material as THREE.PointsMaterial;
        material.opacity = fade;
        material.size = 0.105 + t * 0.045;
      } else {
        // Flight-trail particle stored in the same lifecycle collection.
        const particle = effect.group.children[0] as THREE.Mesh | undefined;

        if (particle) {
          const material = particle.material as THREE.MeshBasicMaterial;
          const velocity = effect.velocities[0];

          particle.position.addScaledVector(velocity, dt);
          material.opacity = fade * 0.68;
          particle.scale.multiplyScalar(Math.max(0, 1 - dt * 1.8));
        }
      }

      for (let r = 0; r < effect.rings.length; r++) {
        const ring = effect.rings[r];
        const scale = 1 + t * (2.0 + r * 0.65);

        ring.scale.setScalar(scale);
        ring.rotation.x += dt * (r % 2 === 0 ? 1.2 : -0.9);
        ring.rotation.y += dt * 0.8;

        const material = ring.material as THREE.MeshBasicMaterial;
        material.opacity = fade * 0.82;
      }

      // Fade and expand the impact flash.
      const flash = effect.group.children.find(
        child =>
          child instanceof THREE.Mesh &&
          child.geometry instanceof THREE.SphereGeometry
      ) as THREE.Mesh | undefined;

      if (flash) {
        flash.scale.setScalar(1 + t * 2.0);

        const material = flash.material as THREE.MeshBasicMaterial;
        material.opacity = fade * 0.8;
      }

      if (effect.life >= effect.duration) {
        this.scene.remove(effect.group);
        this.disposeObject(effect.group);
        effect.particles.geometry.dispose();

        const particleMaterial = effect.particles.material;
        if (Array.isArray(particleMaterial)) {
          particleMaterial.forEach(material => material.dispose());
        } else {
          particleMaterial.dispose();
        }

        this.impacts.splice(i, 1);
      }
    }
  }

  private removeBolt(bolt: ArcaneBoltInstance): void {
    this.scene.remove(bolt.mesh);
    this.disposeObject(bolt.mesh);
  }

  private disposeObject(root: THREE.Object3D): void {
    root.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();

        const material = object.material;

        if (Array.isArray(material)) {
          material.forEach(item => item.dispose());
        } else {
          material.dispose();
        }
      }
    });
  }

  public dispose(): void {
    for (const bolt of this.bolts) {
      this.removeBolt(bolt);
    }

    this.bolts = [];

    for (const effect of this.impacts) {
      this.scene.remove(effect.group);
      this.disposeObject(effect.group);

      effect.particles.geometry.dispose();

      const material = effect.particles.material;
      if (Array.isArray(material)) {
        material.forEach(item => item.dispose());
      } else {
        material.dispose();
      }
    }

    this.impacts = [];
  }
}