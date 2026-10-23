/**
 * VisionPhasing.ts
 * Vision's intangibility: the body becomes a translucent yellow energy form,
 * world collision is bypassed by the gameplay loop, and incoming damage or
 * control effects are rejected while the state is active.
 */

import * as THREE from 'three';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeVisionConfig } from './VisionConfig';

interface OriginalMaterial {
  mesh: THREE.Mesh;
  material: THREE.Material | THREE.Material[];
}

export class VisionPhasing {
  private stickman: StickmanNodes;
  private onStateChange: (active: boolean) => void;
  private active = false;
  private remaining = 0;
  private elapsed = 0;
  private originals: OriginalMaterial[] = [];
  private clonedMaterials: THREE.Material[] = [];

  private aura = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private particles: THREE.Points;
  private light: THREE.PointLight;

  constructor(stickman: StickmanNodes, onStateChange: (active: boolean) => void) {
    this.stickman = stickman;
    this.onStateChange = onStateChange;

    const config = activeVisionConfig.phasing;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: config.glowColor,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.52 + i * 0.14, 0.012, 6, 48),
        ringMaterial
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.78 + i * 0.22;
      this.rings.push(ring);
      this.aura.add(ring);
    }

    const positions: number[] = [];
    for (let i = 0; i < 34; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.38 + Math.random() * 0.42;
      positions.push(
        Math.cos(angle) * radius,
        0.45 + Math.random() * 1.1,
        Math.sin(angle) * radius
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.particles = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: config.tintColor,
        size: 0.045,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.light = new THREE.PointLight(config.glowColor, 0, 3.5, 2);
    this.light.position.y = 1.1;
    this.aura.add(this.particles, this.light);
    this.aura.visible = false;
    this.stickman.root.add(this.aura);
  }

  public get isActive(): boolean {
    return this.active;
  }

  public get remainingSeconds(): number {
    return this.remaining;
  }

  public activate(): boolean {
    if (this.active) return false;
    const config = activeVisionConfig.phasing;
    this.active = true;
    this.remaining = Math.max(0.1, config.duration);
    this.elapsed = 0;
    this.applyPhaseMaterials();
    this.aura.visible = true;
    audioSystem.playRepulsor();
    this.onStateChange(true);
    return true;
  }

  public cancel(): boolean {
    if (!this.active) return false;
    this.active = false;
    this.remaining = 0;
    this.restoreMaterials();
    this.aura.visible = false;
    this.light.intensity = 0;
    this.onStateChange(false);
    return true;
  }

  public update(dt: number): void {
    if (!this.active) return;
    this.elapsed += dt;
    this.remaining = Math.max(0, this.remaining - dt);

    const config = activeVisionConfig.phasing;
    const pulse = 1 + Math.sin(this.elapsed * 8) * 0.08;
    this.rings.forEach((ring, index) => {
      ring.rotation.z += dt * (0.8 + index * 0.35);
      ring.scale.setScalar(pulse * (1 + index * 0.04));
    });
    this.particles.rotation.y += dt * 0.7;
    this.light.intensity = 0.8 + Math.sin(this.elapsed * 9) * 0.18;
    (this.particles.material as THREE.PointsMaterial).opacity =
      0.55 + Math.sin(this.elapsed * 6) * 0.12;
    (this.rings[0].material as THREE.MeshBasicMaterial).color.setHex(config.glowColor);

    if (this.remaining <= 0) {
      this.cancel();
    }
  }

  private isMindStone(object: THREE.Object3D): boolean {
    const stone = (this.stickman as StickmanNodes & { mindStone?: THREE.Object3D }).mindStone;
    if (!stone) return false;
    let current: THREE.Object3D | null = object;
    while (current) {
      if (current === stone) return true;
      current = current.parent;
    }
    return false;
  }

  private applyPhaseMaterials(): void {
    if (this.originals.length > 0) return;
    const config = activeVisionConfig.phasing;
    this.stickman.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material || this.isMindStone(mesh)) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!materials.every((material) => material instanceof THREE.MeshStandardMaterial)) return;

      this.originals.push({ mesh, material: mesh.material });
      const phased = materials.map((material) => {
        const source = material as THREE.MeshStandardMaterial;
        const clone = source.clone();
        clone.transparent = true;
        clone.opacity = config.opacity;
        clone.depthWrite = false;
        clone.color.setHex(config.tintColor);
        clone.emissive.setHex(config.glowColor);
        clone.emissiveIntensity = 0.75;
        this.clonedMaterials.push(clone);
        return clone;
      });
      mesh.material = Array.isArray(mesh.material) ? phased : phased[0];
    });
  }

  private restoreMaterials(): void {
    for (const entry of this.originals) {
      entry.mesh.material = entry.material;
    }
    this.originals = [];
    for (const material of this.clonedMaterials) {
      material.dispose();
    }
    this.clonedMaterials = [];
  }

  public dispose(): void {
    this.cancel();
    this.stickman.root.remove(this.aura);
    for (const ring of this.rings) {
      ring.geometry.dispose();
    }
    (this.rings[0]?.material as THREE.Material | undefined)?.dispose?.();
    this.particles.geometry.dispose();
    (this.particles.material as THREE.Material).dispose();
  }
}
