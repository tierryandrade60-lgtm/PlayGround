import * as THREE from 'three';
import { TargetDummy } from './TargetDummy';
import { audioSystem } from './AudioSystem';
import { WorldCollision, worldCollision } from './systems/WorldCollision';

export interface DamageNumber {
  id: number;
  value: number;
  worldPos: THREE.Vector3;
  age: number;
  maxAge: number;
}

export interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  size: number;
  age: number;
  maxAge: number;
}

export class Projectile {
  public mesh: THREE.Group;
  public pos: THREE.Vector3;
  public vel: THREE.Vector3;
  public startPos: THREE.Vector3;
  public maxRange: number = 38;
  public isDead: boolean = false;
  public target: TargetDummy | null = null;
  public homingStrength: number = 0; // 0 = straight, >0 = guided

  private light: THREE.PointLight;
  private coreMesh: THREE.Mesh;

  constructor(
    startPos: THREE.Vector3,
    initialDir: THREE.Vector3,
    speed: number,
    target: TargetDummy | null,
    homing: boolean
  ) {
    this.pos = startPos.clone();
    this.startPos = startPos.clone();
    this.vel = initialDir.clone().normalize().multiplyScalar(speed);
    this.target = target;
    this.homingStrength = homing ? 8.5 : 0;

    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.pos);

    // Glowing energy core (cyan / electric blue energy)
    const coreGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x48cae4 });
    this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
    this.mesh.add(this.coreMesh);

    // Outer glow halo
    const haloGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x0077b6,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    this.mesh.add(haloMesh);

    // Dynamic point light for realistic scene illumination
    this.light = new THREE.PointLight(0x48cae4, 2.5, 6);
    this.mesh.add(this.light);
  }

  public update(dt: number): void {
    if (this.isDead) return;

    // Homing steering if target is active and alive
    if (this.target && !this.target.isDead && this.homingStrength > 0) {
      const targetPos = this.target.getCenter();
      const desiredDir = targetPos.clone().sub(this.pos).normalize();
      const currentSpeed = this.vel.length();
      const currentDir = this.vel.clone().normalize();
      // Smoothly steer velocity
      currentDir.lerp(desiredDir, Math.min(1.0, dt * this.homingStrength)).normalize();
      this.vel.copy(currentDir.multiplyScalar(currentSpeed));
    }

    // Move
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);

    // Orient mesh along velocity
    if (this.vel.lengthSq() > 0.001) {
      const targetLook = this.pos.clone().add(this.vel);
      this.mesh.lookAt(targetLook);
    }

    // Range check
    if (this.pos.distanceTo(this.startPos) > this.maxRange) {
      this.isDead = true;
    }

    // Ground collision
    if (this.pos.y <= 0.05) {
      this.isDead = true;
    }
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
  }
}

export class ProjectileSystem {
  private scene: THREE.Scene;
  private projectiles: Projectile[] = [];
  private particles: Particle[] = [];
  private particleInstancedMesh: THREE.InstancedMesh;
  private readonly maxParticles: number = 300;
  private dummyMatrix = new THREE.Matrix4();
  private dummyColor = new THREE.Color();

  // Floating damage numbers
  public damageNumbers: DamageNumber[] = [];
  private nextDamageId: number = 1;

  public spawnDamageNumber(value: number, worldPos: THREE.Vector3): void {
    const intValue = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
    this.damageNumbers.push({
      id: this.nextDamageId++,
      value: intValue,
      worldPos: worldPos.clone().add(new THREE.Vector3(0, 0.4, 0)),
      age: 0,
      maxAge: 0.95,
    });
  }

  // Impact trigger callback (for camera shake)
  private onImpactCallback: (isTargetHit: boolean) => void;

  constructor(scene: THREE.Scene, onImpact: (isTargetHit: boolean) => void) {
    this.scene = scene;
    this.onImpactCallback = onImpact;

    // Pooled particle instancing for mobile performance
    const pGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const pMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
    this.particleInstancedMesh = new THREE.InstancedMesh(pGeo, pMat, this.maxParticles);
    this.particleInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleInstancedMesh.count = 0;
    this.scene.add(this.particleInstancedMesh);
  }

  public launch(
    startPos: THREE.Vector3,
    direction: THREE.Vector3,
    target: TargetDummy | null,
    homing: boolean
  ): void {
    const proj = new Projectile(startPos, direction, 26, target, homing);
    this.projectiles.push(proj);
    this.scene.add(proj.mesh);
  }

  public emitImpactParticles(pos: THREE.Vector3, count: number, baseColor: number = 0x48cae4): void {
    const burstCount = Math.min(count, 35);
    for (let i = 0; i < burstCount; i++) {
      if (this.particles.length >= this.maxParticles) break;

      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.2) * Math.PI;
      const speed = 2.5 + Math.random() * 6.5;

      const vel = new THREE.Vector3(
        Math.cos(elevation) * Math.cos(angle) * speed,
        Math.abs(Math.sin(elevation) * speed) + 1.5,
        Math.cos(elevation) * Math.sin(angle) * speed
      );

      this.particles.push({
        pos: pos.clone(),
        vel,
        color: new THREE.Color(baseColor),
        size: 0.08 + Math.random() * 0.08,
        age: 0,
        maxAge: 0.45 + Math.random() * 0.35,
      });
    }
  }

  public emitDestructionParticles(pos: THREE.Vector3): void {
    this.emitImpactParticles(pos, 40, 0xff9f1c);
    this.emitImpactParticles(pos, 25, 0xe63946);
  }

  public update(dt: number, dummies: TargetDummy[]): void {
    // 1. Update active projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const prevPos = p.pos.clone();
      p.update(dt);

      // Trail sparks
      if (Math.random() < 0.4 && this.particles.length < this.maxParticles) {
        this.particles.push({
          pos: p.pos.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1
          )),
          vel: p.vel.clone().multiplyScalar(-0.15).add(new THREE.Vector3(
            (Math.random() - 0.5) * 1,
            Math.random() * 1.5,
            (Math.random() - 0.5) * 1
          )),
          color: new THREE.Color(0x90e0ef),
          size: 0.06,
          age: 0,
          maxAge: 0.22,
        });
      }

      // Segment test against structures + ward + ground so fast projectiles
      // can never tunnel through a surface.
      const segmentLength = prevPos.distanceTo(p.pos);
      const solidHit = worldCollision.segmentHit(prevPos, p.pos, 0.15);
      const solidDistance = solidHit ? solidHit.distance : Number.POSITIVE_INFINITY;

      // Nearest dummy along the travelled segment.
      let hitDummy: TargetDummy | null = null;
      let dummyDistance = Number.POSITIVE_INFINITY;
      let dummyHitPos: THREE.Vector3 | null = null;

      for (const dummy of dummies) {
        if (dummy.isDead) continue;
        const dummyCenter = dummy.getCenter();

        if (
          WorldCollision.distanceToSegment(prevPos, p.pos, dummyCenter) >
          dummy.radius + 0.3
        ) {
          continue;
        }

        const t = WorldCollision.closestTOnSegment(prevPos, p.pos, dummyCenter);
        const along = t * segmentLength;
        if (along >= dummyDistance || along >= solidDistance) continue;

        dummyDistance = along;
        dummyHitPos = new THREE.Vector3().lerpVectors(prevPos, p.pos, t);
        hitDummy = dummy;
      }

      let hit = false;

      if (hitDummy && dummyHitPos && dummyDistance <= solidDistance) {
        hit = true;
        const hitPos = dummyHitPos;
        const { actualDamage } = hitDummy.takeDamage(25, hitPos);
        this.spawnDamageNumber(actualDamage, hitPos);

        this.emitImpactParticles(hitPos, 22, 0x48cae4);
        audioSystem.playImpact();
        this.onImpactCallback(true);
      } else if (solidHit) {
        // Structure wall or ground: splash on the surface, never beyond it.
        hit = true;
        const hitPos = solidHit.point.clone();
        this.emitImpactParticles(hitPos, 12, solidHit.box ? 0x9aa7b5 : 0x7a8694);
        audioSystem.playImpact();
        this.onImpactCallback(false);
      }

      if (hit || p.isDead) {
        p.dispose(this.scene);
        this.projectiles.splice(i, 1);
      }
    }

    // 2. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const part = this.particles[i];
      part.age += dt;
      if (part.age >= part.maxAge) {
        this.particles.splice(i, 1);
        continue;
      }

      // Gravity and air drag
      const prevX = part.pos.x;
      const prevY = part.pos.y;
      const prevZ = part.pos.z;
      part.vel.y -= 9.8 * dt;
      part.vel.multiplyScalar(0.96);
      part.pos.addScaledVector(part.vel, dt);

      if (worldCollision.isPointInSolid(part.pos, part.size)) {
        // Structures (and ward faces) absorb the particle: step back to the
        // surface and kill most of its momentum instead of passing through.
        part.pos.set(prevX, prevY, prevZ);
        part.vel.multiplyScalar(-0.25);
      } else if (part.pos.y < 0.02) {
        // Floor bounce
        part.pos.y = 0.02;
        part.vel.y = -part.vel.y * 0.4;
      }
    }

    // Update particle instancing
    const pCount = Math.min(this.particles.length, this.maxParticles);
    this.particleInstancedMesh.count = pCount;
    for (let i = 0; i < pCount; i++) {
      const part = this.particles[i];
      const scale = (1 - part.age / part.maxAge) * part.size;
      this.dummyMatrix.makeTranslation(part.pos.x, part.pos.y, part.pos.z);
      this.dummyMatrix.scale(new THREE.Vector3(scale, scale, scale));
      this.particleInstancedMesh.setMatrixAt(i, this.dummyMatrix);
      this.particleInstancedMesh.setColorAt(i, part.color);
    }
    if (pCount > 0) {
      this.particleInstancedMesh.instanceMatrix.needsUpdate = true;
      if (this.particleInstancedMesh.instanceColor) {
        this.particleInstancedMesh.instanceColor.needsUpdate = true;
      }
    }

    // 3. Update Damage Numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.age += dt;
      // Floats smoothly upwards
      dn.worldPos.y += dt * 1.35;
      if (dn.age >= dn.maxAge) {
        this.damageNumbers.splice(i, 1);
      }
    }
  }

  public dispose(): void {
    for (const p of this.projectiles) {
      p.dispose(this.scene);
    }
    this.projectiles = [];
    this.scene.remove(this.particleInstancedMesh);
  }
}
