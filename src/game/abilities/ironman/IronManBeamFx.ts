import * as THREE from 'three';

export interface BeamPalette {
  core: number;
  inner: number;
  outer: number;
  light: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

function additiveMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

export class IronManBeamVisual {
  public readonly group = new THREE.Group();
  private core: THREE.Mesh;
  private inner: THREE.Mesh;
  private outer: THREE.Mesh;
  private rings: THREE.Mesh[] = [];
  private light: THREE.PointLight;
  private coreMaterial: THREE.MeshBasicMaterial;
  private innerMaterial: THREE.MeshBasicMaterial;
  private outerMaterial: THREE.MeshBasicMaterial;
  private ringMaterial: THREE.MeshBasicMaterial;
  private length = 1;

  constructor(
    scene: THREE.Scene,
    palette: BeamPalette,
    private readonly width: number = 0.28,
    ringCount: number = 5
  ) {
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
    this.coreMaterial = additiveMaterial(palette.core, 1);
    this.innerMaterial = additiveMaterial(palette.inner, 0.58);
    this.outerMaterial = additiveMaterial(palette.outer, 0.22);
    this.ringMaterial = additiveMaterial(palette.core, 0.72);

    this.core = new THREE.Mesh(cylinder, this.coreMaterial);
    this.inner = new THREE.Mesh(cylinder, this.innerMaterial);
    this.outer = new THREE.Mesh(cylinder, this.outerMaterial);
    this.core.renderOrder = 3;
    this.inner.renderOrder = 2;
    this.outer.renderOrder = 1;
    this.group.add(this.outer, this.inner, this.core);

    const ringGeometry = new THREE.TorusGeometry(1, 0.035, 6, 24);
    for (let i = 0; i < ringCount; i++) {
      const ring = new THREE.Mesh(ringGeometry, this.ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.renderOrder = 4;
      this.rings.push(ring);
      this.group.add(ring);
    }

    this.light = new THREE.PointLight(palette.light, 0, 7, 2);
    this.group.add(this.light);
    this.group.visible = false;
    scene.add(this.group);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public setColor(color: number): void {
    this.coreMaterial.color.setHex(color);
    this.innerMaterial.color.setHex(color);
    this.outerMaterial.color.setHex(color);
    this.ringMaterial.color.setHex(color);
    this.light.color.setHex(color);
  }

  public update(
    start: THREE.Vector3,
    end: THREE.Vector3,
    time: number,
    energy: number = 1
  ): void {
    const direction = end.clone().sub(start);
    const distance = direction.length();
    if (distance < 0.001) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    this.length = distance;
    this.group.position.copy(start).addScaledVector(direction, 0.5);
    this.group.quaternion.setFromUnitVectors(UP, direction.normalize());

    const pulse = 1 + Math.sin(time * 22) * 0.07 + Math.sin(time * 9) * 0.03;
    const coreRadius = this.width * 0.18 * pulse;
    const innerRadius = this.width * 0.5 * (1 + Math.sin(time * 15 + 1.2) * 0.08);
    const outerRadius = this.width * 0.85 * (1 + Math.sin(time * 11 + 2.1) * 0.12);

    this.core.scale.set(coreRadius, distance, coreRadius);
    this.inner.scale.set(innerRadius, distance, innerRadius);
    this.outer.scale.set(outerRadius, distance, outerRadius);

    this.coreMaterial.opacity = 0.78 + energy * 0.12;
    this.innerMaterial.opacity = 0.28 + energy * 0.14;
    this.outerMaterial.opacity = 0.08 + energy * 0.1;

    const ringRadius = this.width * 1.35;
    this.rings.forEach((ring, index) => {
      const offset = ((index + (time * 0.55) % 1) / this.rings.length) - 0.5;
      ring.position.y = offset * distance;
      const ringPulse = 1 + Math.sin(time * 16 + index * 1.7) * 0.12;
      ring.scale.setScalar(ringRadius * ringPulse);
      this.ringMaterial.opacity = 0.1 + energy * 0.18;
    });

    this.light.position.y = 0;
    this.light.intensity = (1.1 + Math.sin(time * 20) * 0.25) * energy;
  }

  public dispose(): void {
    this.group.parent?.remove(this.group);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((item) => materials.add(item));
      else if (material) materials.add(material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
}

export class BeamClashDisk {
  public readonly group = new THREE.Group();
  private diskGroup = new THREE.Group();
  private ringGroup = new THREE.Group();
  private playerHalf: THREE.Mesh;
  private rivalHalf: THREE.Mesh;
  private backdrop: THREE.Mesh;
  private border: THREE.Mesh;
  private innerBorder: THREE.Mesh;
  private shockwave: THREE.Mesh;
  private spokes: THREE.LineSegments;
  private particles: THREE.Points;
  private light: THREE.PointLight;
  private materials: THREE.Material[] = [];

  constructor(
    scene: THREE.Scene,
    playerColor: number,
    rivalColor: number
  ) {
    this.backdrop = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      additiveMaterial(0xffffff, 0.1)
    );
    this.playerHalf = new THREE.Mesh(
      new THREE.CircleGeometry(0.92, 48, 0, Math.PI),
      additiveMaterial(playerColor, 0.62)
    );
    this.rivalHalf = new THREE.Mesh(
      new THREE.CircleGeometry(0.92, 48, Math.PI, Math.PI),
      additiveMaterial(rivalColor, 0.62)
    );
    this.playerHalf.position.z = 0.004;
    this.rivalHalf.position.z = 0.004;

    this.border = new THREE.Mesh(
      new THREE.RingGeometry(0.84, 1, 64),
      additiveMaterial(0xffffff, 0.82)
    );
    this.border.position.z = 0.008;

    this.innerBorder = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.54, 48),
      additiveMaterial(0xffffff, 0.42)
    );
    this.innerBorder.position.z = 0.01;

    this.shockwave = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.032, 6, 64),
      additiveMaterial(playerColor, 0.5)
    );
    this.shockwave.position.z = 0.012;

    const spokePositions: number[] = [];
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const inner = 0.58;
      const outer = 0.94 + (i % 3) * 0.025;
      spokePositions.push(
        Math.cos(angle) * inner,
        Math.sin(angle) * inner,
        0.015,
        Math.cos(angle) * outer,
        Math.sin(angle) * outer,
        0.015
      );
    }
    const spokeGeometry = new THREE.BufferGeometry();
    spokeGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(spokePositions, 3)
    );
    this.spokes = new THREE.LineSegments(
      spokeGeometry,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );

    const particlePositions: number[] = [];
    for (let i = 0; i < 36; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.25 + Math.random() * 0.7;
      particlePositions.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0.02
      );
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(particlePositions, 3)
    );
    this.particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.07,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );

    this.diskGroup.add(
      this.backdrop,
      this.playerHalf,
      this.rivalHalf,
      this.border,
      this.innerBorder,
      this.shockwave,
      this.spokes,
      this.particles
    );
    this.ringGroup.add(this.diskGroup);
    this.light = new THREE.PointLight(0xffaa00, 0, 10, 2);
    this.ringGroup.add(this.light);
    this.group.add(this.ringGroup);
    this.group.visible = false;
    scene.add(this.group);

    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) this.materials.push(...material);
      else if (material) this.materials.push(material);
    });
    this.materials.forEach((material) => {
      material.userData.baseOpacity = material.opacity;
    });
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public update(
    position: THREE.Vector3,
    axis: THREE.Vector3,
    time: number,
    intensity: number = 1
  ): void {
    this.group.visible = true;
    this.group.position.copy(position);

    const normal = axis.lengthSq() > 0.0001 ? axis.clone().normalize() : FORWARD.clone();
    this.ringGroup.quaternion.setFromUnitVectors(FORWARD, normal);

    const pulse = 1 + Math.sin(time * 18) * 0.07;
    const expansion = 0.92 + Math.sin(time * 7) * 0.05;
    this.diskGroup.scale.setScalar(expansion * (0.8 + intensity * 0.18));
    this.diskGroup.rotation.z = time * 0.6;

    this.border.scale.setScalar(pulse);
    this.innerBorder.scale.setScalar(1 + Math.sin(time * 13) * 0.12);
    this.shockwave.scale.setScalar(1.05 + ((time * 0.7) % 1) * 0.55);
    this.spokes.rotation.z = -time * 1.4;

    this.playerHalf.scale.setScalar(1 + Math.sin(time * 20) * 0.02);
    this.rivalHalf.scale.setScalar(1 + Math.cos(time * 20) * 0.02);

    this.materials.forEach((material) => {
      const base = material.userData.baseOpacity;
      if (typeof base === 'number') {
        material.opacity = base * (0.65 + intensity * 0.35);
      }
    });
    this.light.intensity = 2.6 * intensity + Math.sin(time * 22) * 0.3;
  }

  public dispose(): void {
    this.group.parent?.remove(this.group);
    const geometries = new Set<THREE.BufferGeometry>();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }
}
