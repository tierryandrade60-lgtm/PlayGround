
/**
 * IronManMicroMissiles.ts
 * V.3.0 — Combustion, Fire & Smoke
 *
 * Fire-based missile launch, hot exhaust, burning trails,
 * dark volumetric-style smoke, embers and explosive impacts.
 *
 * Autonomous animation through requestAnimationFrame.
 * Public API preserved: fire(target, aimPoint), dispose().
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { worldCollision } from '../../systems/WorldCollision';
import { activeIronManConfig } from './IronManConfig';

type EffectKind = 'trail' | 'smoke' | 'spark' | 'fireball' | 'launch';

type Missile = {
  group: THREE.Group;
  exhaust: THREE.Group;
  start: THREE.Vector3;
  controlA: THREE.Vector3;
  controlB: THREE.Vector3;
  end: THREE.Vector3;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  direction: THREE.Vector3;
  target: TargetDummy | null;
  progress: number;
  duration: number;
  delay: number;
  damage: number;
  trailTimer: number;
  smokeTimer: number;
  dead: boolean;
  launched: boolean;
};

type Effect = {
  group: THREE.Group;
  life: number;
  duration: number;
  velocity: THREE.Vector3;
  kind: EffectKind;
  spin: number;
};

export class IronManMicroMissiles {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;

  private onDamageDealt: (
    dummy: TargetDummy,
    dmg: number,
    hitPos: THREE.Vector3,
    knockback?: THREE.Vector3
  ) => void;

  private onShake: (amount: number) => void;

  private missiles: Missile[] = [];
  private effects: Effect[] = [];
  private frameId: number | null = null;
  private lastFrameTime = 0;
  private disposed = false;
  private elapsed = 0;

  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly maxEffects = 180;

  private readonly bodyGeometry =
    new THREE.CylinderGeometry(0.085, 0.115, 0.62, 10);

  private readonly noseGeometry =
    new THREE.ConeGeometry(0.09, 0.24, 10);

  private readonly finGeometry =
    new THREE.BoxGeometry(0.19, 0.055, 0.16);

  private readonly engineGeometry =
    new THREE.ConeGeometry(0.09, 0.34, 10);

  private readonly coreGeometry =
    new THREE.CylinderGeometry(0.035, 0.07, 0.24, 8);

  private readonly collarGeometry =
    new THREE.TorusGeometry(0.085, 0.022, 6, 16);

  private readonly particleGeometry =
    new THREE.SphereGeometry(0.055, 7, 6);

  private readonly fireGeometry =
    new THREE.SphereGeometry(0.38, 12, 10);

  private readonly bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x9ba9b9,
    metalness: 0.88,
    roughness: 0.23,
  });

  private readonly darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x202b39,
    metalness: 0.82,
    roughness: 0.28,
  });

  private readonly redMaterial = new THREE.MeshStandardMaterial({
    color: 0x8f2635,
    metalness: 0.7,
    roughness: 0.26,
  });

  private readonly noseMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe6bd,
    toneMapped: false,
  });

  private readonly exhaustOrange = new THREE.MeshBasicMaterial({
    color: 0xff681c,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  private readonly exhaustGold = new THREE.MeshBasicMaterial({
    color: 0xffbd52,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  private readonly exhaustWhite = new THREE.MeshBasicMaterial({
    color: 0xfff1d5,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

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

  public fire(
    target: TargetDummy | null,
    aimPoint: THREE.Vector3
  ): boolean {
    if (this.disposed) return false;

    const cfg = activeIronManConfig.microMissiles;
    const count = Math.max(1, Math.floor(cfg.volleyCount));

    const validTarget = target && !target.isDead ? target : null;
    const destination = validTarget
      ? validTarget.getCenter().clone()
      : aimPoint.clone();

    const torso = this.stickman.upperTorso;
    torso.updateWorldMatrix(true, false);

    const torsoPos = new THREE.Vector3();
    const torsoRot = new THREE.Quaternion();

    torso.getWorldPosition(torsoPos);
    torso.getWorldQuaternion(torsoRot);

    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const spread = 0.28 + row * 0.09;

      const offset = new THREE.Vector3(
        side * spread,
        0.16 + row * 0.075,
        -0.22 - row * 0.035
      ).applyQuaternion(torsoRot);

      const start = torsoPos.clone().add(offset);
      const end = destination.clone();
      const sideArc = side * (1.25 + Math.random() * 0.8);

      const controlA = start.clone().lerp(end, 0.28);
      controlA.add(new THREE.Vector3(
        sideArc,
        0.8 + Math.random() * 0.65,
        (Math.random() - 0.5) * 0.8
      ));

      const controlB = start.clone().lerp(end, 0.72);
      controlB.add(new THREE.Vector3(
        sideArc * 0.45,
        0.25 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.5
      ));

      const group = this.createMissile();
      group.position.copy(start);
      group.visible = false;
      this.scene.add(group);

      const distance = start.distanceTo(end);

      this.missiles.push({
        group,
        exhaust: group.userData.exhaust as THREE.Group,
        start: start.clone(),
        controlA,
        controlB,
        end,
        position: start.clone(),
        previousPosition: start.clone(),
        direction: end.clone().sub(start).normalize(),
        target: validTarget,
        progress: 0,
        duration: THREE.MathUtils.clamp(distance / 30, 0.32, 1.65),
        delay: i * 0.075,
        damage: cfg.damagePerMissile,
        trailTimer: 0,
        smokeTimer: 0,
        dead: false,
        launched: false,
      });
    }

    audioSystem.playMissileLaunch?.();
    this.onShake(0.06);
    this.startAnimation();

    return true;
  }

  private createMissile(): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      this.bodyGeometry,
      this.bodyMaterial
    );
    group.add(body);

    const nose = new THREE.Mesh(
      this.noseGeometry,
      this.noseMaterial
    );
    nose.position.y = 0.42;
    group.add(nose);

    const collar = new THREE.Mesh(
      this.collarGeometry,
      this.darkMaterial
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.18;
    group.add(collar);

    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;

      const fin = new THREE.Mesh(
        this.finGeometry,
        i % 2 === 0 ? this.redMaterial : this.darkMaterial
      );

      fin.position.set(
        Math.cos(angle) * 0.105,
        -0.19,
        Math.sin(angle) * 0.105
      );

      fin.rotation.y = angle;
      group.add(fin);
    }

    const exhaustGroup = new THREE.Group();
    exhaustGroup.position.y = -0.34;

    const outerFlame = new THREE.Mesh(
      this.engineGeometry,
      this.exhaustOrange
    );
    outerFlame.rotation.x = Math.PI;
    outerFlame.scale.set(1.1, 1.45, 1.1);
    exhaustGroup.add(outerFlame);

    const hotFlame = new THREE.Mesh(
      this.engineGeometry,
      this.exhaustGold
    );
    hotFlame.rotation.x = Math.PI;
    hotFlame.scale.set(0.58, 1.05, 0.58);
    hotFlame.position.y = -0.035;
    exhaustGroup.add(hotFlame);

    const hotCore = new THREE.Mesh(
      this.coreGeometry,
      this.exhaustWhite
    );
    hotCore.rotation.x = Math.PI / 2;
    hotCore.position.y = -0.03;
    exhaustGroup.add(hotCore);

    const engineLight = new THREE.PointLight(
      0xff752b,
      2.2,
      3.5
    );
    engineLight.position.y = -0.1;
    exhaustGroup.add(engineLight);

    group.add(exhaustGroup);
    group.userData.exhaust = exhaustGroup;

    const noseLight = new THREE.PointLight(
      0xffc17a,
      0.45,
      1.4
    );
    noseLight.position.y = 0.35;
    group.add(noseLight);

    return group;
  }

  private startAnimation(): void {
    if (this.frameId !== null || this.disposed) return;

    this.lastFrameTime = performance.now();

    const animate = (now: number) => {
      this.frameId = null;
      if (this.disposed) return;

      const dt = Math.min(
        Math.max((now - this.lastFrameTime) / 1000, 0),
        0.04
      );

      this.lastFrameTime = now;
      this.elapsed += dt;

      this.updateMissiles(dt);
      this.updateEffects(dt);

      if (this.missiles.length || this.effects.length) {
        this.frameId = requestAnimationFrame(animate);
      }
    };

    this.frameId = requestAnimationFrame(animate);
  }

  private updateMissiles(dt: number): void {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const missile = this.missiles[i];

      if (missile.dead) {
        this.removeMissile(i);
        continue;
      }

      missile.delay -= dt;
      if (missile.delay > 0) continue;

      if (!missile.launched) {
        missile.launched = true;
        missile.group.visible = true;

        this.createLaunchFlash(missile.start, missile.direction);
      }

      if (missile.target && !missile.target.isDead) {
        missile.end.copy(missile.target.getCenter());
      } else {
        missile.target = null;
      }

      missile.progress += dt / missile.duration;

      const t = THREE.MathUtils.clamp(missile.progress, 0, 1);
      const u = 1 - t;

      missile.position.set(
        u * u * u * missile.start.x +
          3 * u * u * t * missile.controlA.x +
          3 * u * t * t * missile.controlB.x +
          t * t * t * missile.end.x,

        u * u * u * missile.start.y +
          3 * u * u * t * missile.controlA.y +
          3 * u * t * t * missile.controlB.y +
          t * t * t * missile.end.y,

        u * u * u * missile.start.z +
          3 * u * u * t * missile.controlA.z +
          3 * u * t * t * missile.controlB.z +
          t * t * t * missile.end.z
      );

      if (activeIronManConfig.microMissiles.collideWithWorld !== false) {
        const solidHit = worldCollision.segmentHit(
          missile.previousPosition,
          missile.position,
          0.12
        );
        if (solidHit) {
          const impactPos = solidHit.point.clone();
          this.createImpact(impactPos);
          audioSystem.playImpact?.();
          this.onShake(0.035);
          this.removeMissile(i);
          continue;
        }
      }
      missile.previousPosition.copy(missile.position);

      missile.direction.set(
        3 * u * u * (missile.controlA.x - missile.start.x) +
          6 * u * t * (missile.controlB.x - missile.controlA.x) +
          3 * t * t * (missile.end.x - missile.controlB.x),

        3 * u * u * (missile.controlA.y - missile.start.y) +
          6 * u * t * (missile.controlB.y - missile.controlA.y) +
          3 * t * t * (missile.end.y - missile.controlB.y),

        3 * u * u * (missile.controlA.z - missile.start.z) +
          6 * u * t * (missile.controlB.z - missile.controlA.z) +
          3 * t * t * (missile.end.z - missile.controlB.z)
      );

      if (missile.direction.lengthSq() < 0.00001) {
        missile.direction.set(0, 1, 0);
      } else {
        missile.direction.normalize();
      }

      missile.group.position.copy(missile.position);
      missile.group.quaternion.setFromUnitVectors(
        this.up,
        missile.direction
      );

      const pulse =
        0.9 + Math.sin(this.elapsed * 35 + i * 1.7) * 0.12;

      missile.exhaust.scale.set(
        pulse,
        0.85 + pulse * 0.35,
        pulse
      );

      missile.trailTimer -= dt;

      if (missile.trailTimer <= 0) {
        missile.trailTimer = 0.035;

        const trailPos = missile.position.clone()
          .addScaledVector(missile.direction, -0.32);

        this.createTrail(trailPos, missile.direction);
      }

      missile.smokeTimer -= dt;

      if (missile.smokeTimer <= 0) {
        missile.smokeTimer = 0.09;

        const smokePos = missile.position.clone()
          .addScaledVector(missile.direction, -0.48);

        this.createSmoke(
          smokePos,
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.45,
            0.25 + Math.random() * 0.5,
            (Math.random() - 0.5) * 0.45
          ),
          0.55 + Math.random() * 0.35,
          0.45 + Math.random() * 0.3
        );
      }

      if (missile.progress >= 1) {
        if (missile.target && !missile.target.isDead) {
          const hitPos = missile.target.getCenter().clone();

          const knockback = missile.direction.clone()
            .multiplyScalar(5.5);
          knockback.y += 1.8;

          this.onDamageDealt(
            missile.target,
            missile.damage,
            hitPos,
            knockback
          );

          audioSystem.playImpact?.();
          this.onShake(0.055);
          this.createImpact(hitPos);
        } else {
          this.createImpact(missile.position);
        }

        this.removeMissile(i);
      }
    }
  }

  private createLaunchFlash(
    position: THREE.Vector3,
    direction: THREE.Vector3
  ): void {
    const rear = direction.clone().negate();

    this.createParticle(
      position.clone().addScaledVector(rear, 0.08),
      0xff641b,
      1.35,
      0.24,
      rear.clone().multiplyScalar(0.9),
      'launch',
      0.9
    );

    this.createParticle(
      position.clone().addScaledVector(rear, 0.18),
      0xffc15b,
      0.8,
      0.16,
      rear.clone().multiplyScalar(1.4),
      'launch',
      0.85
    );

    this.createSmoke(
      position.clone().addScaledVector(rear, 0.2),
      rear.clone().multiplyScalar(0.6).add(
        new THREE.Vector3(0, 0.45, 0)
      ),
      0.9,
      0.65
    );

    this.createParticle(
      position,
      0xff9a36,
      0.7,
      0.12,
      rear.clone().multiplyScalar(2.2),
      'spark',
      0.9
    );
  }

  private createTrail(
    position: THREE.Vector3,
    direction: THREE.Vector3
  ): void {
    if (this.effects.length >= this.maxEffects) return;

    const rear = direction.clone().negate();

    this.createParticle(
      position,
      Math.random() > 0.35 ? 0xff6b1f : 0xffb347,
      0.65 + Math.random() * 0.45,
      0.17 + Math.random() * 0.1,
      rear.clone().multiplyScalar(0.65).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.6
        )
      ),
      'trail',
      0.9
    );

    if (Math.random() < 0.42) {
      this.createParticle(
        position,
        0xffc45f,
        0.25 + Math.random() * 0.2,
        0.12 + Math.random() * 0.1,
        rear.clone().multiplyScalar(2.0).add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2,
            (Math.random() - 0.5) * 2
          )
        ),
        'spark',
        0.95
      );
    }
  }

  private createImpact(position: THREE.Vector3): void {
    // Brief hot flash, without rings or cosmic effects.
    this.createParticle(
      position,
      0xff8a27,
      2.25,
      0.42,
      new THREE.Vector3(0, 0.7, 0),
      'fireball',
      0.96
    );

    this.createParticle(
      position.clone().add(
        new THREE.Vector3(0, 0.08, 0)
      ),
      0xffc05b,
      1.45,
      0.25,
      new THREE.Vector3(0, 1.0, 0),
      'fireball',
      0.95
    );

    this.createParticle(
      position.clone().add(
        new THREE.Vector3(0, 0.04, 0)
      ),
      0xffe0a0,
      0.8,
      0.12,
      new THREE.Vector3(0, 1.4, 0),
      'fireball',
      0.9
    );

    // Dark smoke rises and expands after the flash.
    for (let i = 0; i < 8; i++) {
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 1.4,
        Math.random() * 0.8,
        (Math.random() - 0.5) * 1.4
      );

      this.createSmoke(
        position.clone().add(spread.clone().multiplyScalar(0.25)),
        new THREE.Vector3(
          spread.x * 0.9,
          1.0 + Math.random() * 1.5,
          spread.z * 0.9
        ),
        1.0 + Math.random() * 0.85,
        0.8 + Math.random() * 0.65
      );
    }

    // Hot fragments and embers thrown outward.
    for (let i = 0; i < 13; i++) {
      const velocity = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 1.5 + 0.15,
        Math.random() * 2 - 1
      ).normalize().multiplyScalar(2.2 + Math.random() * 4.2);

      this.createParticle(
        position,
        Math.random() > 0.3 ? 0xff741e : 0xffd078,
        0.25 + Math.random() * 0.25,
        0.22 + Math.random() * 0.25,
        velocity,
        'spark',
        0.95
      );
    }
  }

  private createSmoke(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    scale: number,
    life: number
  ): void {
    if (this.effects.length >= this.maxEffects) return;

    const group = new THREE.Group();
    group.position.copy(position);

    const shade = Math.random() > 0.5 ? 0x353535 : 0x55504c;

    const material = new THREE.MeshBasicMaterial({
      color: shade,
      transparent: true,
      opacity: 0.58 + Math.random() * 0.16,
      depthWrite: false,
      toneMapped: false,
    });

    material.userData.baseOpacity = material.opacity;

    const smoke = new THREE.Mesh(this.fireGeometry, material);
    smoke.scale.set(
      scale * (0.8 + Math.random() * 0.4),
      scale * (0.75 + Math.random() * 0.45),
      scale * (0.8 + Math.random() * 0.4)
    );

    group.add(smoke);
    group.rotation.set(
      Math.random() * 0.5,
      Math.random() * Math.PI,
      Math.random() * 0.5
    );

    this.scene.add(group);

    this.effects.push({
      group,
      life,
      duration: life,
      velocity,
      kind: 'smoke',
      spin: (Math.random() - 0.5) * 1.2,
    });
  }

  private createParticle(
    position: THREE.Vector3,
    color: number,
    scale: number,
    life: number,
    velocity: THREE.Vector3,
    kind: EffectKind,
    opacity: number
  ): void {
    if (this.effects.length >= this.maxEffects) return;

    const group = new THREE.Group();
    group.position.copy(position);

    const isLarge = kind === 'fireball' || kind === 'launch';
    const geometry = isLarge
      ? this.fireGeometry
      : this.particleGeometry;

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      blending: isLarge || kind === 'trail' || kind === 'spark'
        ? THREE.AdditiveBlending
        : THREE.NormalBlending,
    });

    material.userData.baseOpacity = opacity;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(scale);
    group.add(mesh);

    if (kind === 'fireball' || kind === 'launch') {
      const light = new THREE.PointLight(
        color,
        kind === 'fireball' ? 3.0 : 1.5,
        kind === 'fireball' ? 5.5 : 3.0
      );

      light.userData.baseIntensity = light.intensity;
      group.add(light);
    }

    this.scene.add(group);

    this.effects.push({
      group,
      life,
      duration: life,
      velocity: velocity.clone(),
      kind,
      spin: (Math.random() - 0.5) * 5,
    });
  }

  private updateEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];

      effect.life -= dt;

      if (effect.life <= 0) {
        this.removeEffect(i);
        continue;
      }

      const progress = THREE.MathUtils.clamp(
        1 - effect.life / effect.duration,
        0,
        1
      );

      if (effect.kind === 'fireball') {
        const scale = progress < 0.22
          ? 0.18 + (progress / 0.22) * 1.65
          : Math.max(
              0.02,
              1.83 * (1 - (progress - 0.22) / 0.78)
            );

        effect.group.scale.setScalar(scale);
        effect.group.rotation.y += dt * effect.spin;
      } else if (effect.kind === 'launch') {
        effect.group.scale.setScalar(
          0.2 + progress * 1.3
        );
      } else if (effect.kind === 'smoke') {
        effect.group.position.addScaledVector(
          effect.velocity,
          dt
        );

        effect.group.scale.setScalar(
          0.8 + progress * 1.5
        );

        effect.group.rotation.y += dt * effect.spin;
        effect.group.rotation.x += dt * effect.spin * 0.3;
      } else {
        effect.group.position.addScaledVector(
          effect.velocity,
          dt
        );

        effect.group.scale.setScalar(
          Math.max(
            0.015,
            1 - progress * (effect.kind === 'spark' ? 0.95 : 0.85)
          )
        );

        effect.group.rotation.z += dt * effect.spin;
      }

      effect.group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

          for (const material of materials) {
            if ('opacity' in material) {
              const baseOpacity =
                material.userData.baseOpacity ?? 1;

              material.opacity = baseOpacity * (1 - progress);
            }
          }
        }

        if (object instanceof THREE.PointLight) {
          const baseIntensity =
            object.userData.baseIntensity ?? 1;

          object.intensity = baseIntensity * (1 - progress);
        }
      });
    }
  }

  private removeEffect(index: number): void {
    const effect = this.effects[index];
    if (!effect) return;

    this.scene.remove(effect.group);

    effect.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        for (const material of materials) {
          material.dispose();
        }
      }
    });

    this.effects.splice(index, 1);
  }

  private removeMissile(index: number): void {
    const missile = this.missiles[index];
    if (!missile) return;

    missile.dead = true;
    this.scene.remove(missile.group);
    this.missiles.splice(index, 1);
  }

  public dispose(): void {
    this.disposed = true;

    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    for (const missile of this.missiles) {
      this.scene.remove(missile.group);
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.removeEffect(i);
    }

    this.missiles = [];
    this.effects = [];

    this.bodyGeometry.dispose();
    this.noseGeometry.dispose();
    this.finGeometry.dispose();
    this.engineGeometry.dispose();
    this.coreGeometry.dispose();
    this.collarGeometry.dispose();
    this.particleGeometry.dispose();
    this.fireGeometry.dispose();

    this.bodyMaterial.dispose();
    this.darkMaterial.dispose();
    this.redMaterial.dispose();
    this.noseMaterial.dispose();
    this.exhaustOrange.dispose();
    this.exhaustGold.dispose();
    this.exhaustWhite.dispose();
  }
}
