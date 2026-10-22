/**
 * AgathaRunicWard.ts
 * V.9.1
 *
 * ENCHANTED AMETHYST CUBE
 * - Efeitos mágicos nas duas mãos.
 * - Runas surgem somente no lançamento.
 * - Trajeto das runas mais lento e suave.
 * - Cordas mágicas trançadas em 3D.
 * - Paredes e piso translúcidos com formação animada.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { activeAgathaConfig } from './AgathaConfig';

type RuneNode = {
  group: THREE.Group;
  model: THREE.Group;
  particles: THREE.Points;
  velocities: Float32Array;
  phase: number;
  runeMaterial: THREE.MeshStandardMaterial;
  crystal: THREE.Mesh;
  crystalMaterial: THREE.MeshStandardMaterial;
  aura: THREE.Mesh;
  auraMaterial: THREE.MeshBasicMaterial;
};

type RopeSegment = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  edge: number;
  strand: number;
  segment: number;
};

type WardWall = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  kind: 'front' | 'back' | 'left' | 'right' | 'floor';
  baseScale: THREE.Vector3;
  edgeMeshes: THREE.Mesh[];
};

export class AgathaRunicWard {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private onShake: (amount: number) => void;

  public isActive = false;

  private timer = 0;
  private elapsed = 0;

  private readonly castDuration = 0.7;
  private readonly runeStart = 0.5;
  private readonly runeDuration = 0.5;
  private readonly wallStart = 1.0;
  private readonly wallDuration = 0.4;
  private readonly minimumDuration = 14;

  private root: THREE.Group | null = null;
  private runes: RuneNode[] = [];
  private beams: THREE.Mesh[] = [];
  private beamMaterials: THREE.MeshBasicMaterial[] = [];
  private ropeSegments: RopeSegment[] = [];
  private walls: WardWall[] = [];
  private castEffects: THREE.Group[] = [];

  private origin = new THREE.Vector3();
  private corners: THREE.Vector3[] = [];
  private launchStarts: THREE.Vector3[] = [];
  private launchControls: THREE.Vector3[] = [];
  private launchEnds: THREE.Vector3[] = [];

  private readonly source = 'agatha-runic-ward';
  private readonly castSource = 'agatha-runic-ward-cast';

  private readonly halfWidth = 7.5;
  private readonly halfDepth = 6.0;
  private readonly runeHeight = 1.65;
  private readonly wallHeight = 5.5;

  private readonly runeColor = 0x9870c7;
  private readonly runeEmissive = 0x59317d;
  private readonly particleColor = 0xd9baff;
  private readonly beamColor = 0xb887f4;

  private readonly ropeColors = [
    0xd7b5ff,
    0x9b5ce0,
    0xf0c9ff,
  ];

  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly tempDirection = new THREE.Vector3();
  private readonly tempSide = new THREE.Vector3();
  private readonly tempOtherSide = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    onShake: (amount: number) => void
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.onShake = onShake;
  }

  public activate(
    playerPos: THREE.Vector3,
    dummies: TargetDummy[]
  ): boolean {
    if (this.isActive) {
      this.cancel();
      return false;
    }

    const cfg = activeAgathaConfig.runicWard;

    this.isActive = true;
    this.timer = Math.max(cfg.duration, this.minimumDuration);
    this.elapsed = 0;

    const castLockDuration =
      this.wallStart + this.wallDuration + 0.1;

    gameplayRestrictions.applyRestriction(
      'NoMovement',
      this.castSource,
      castLockDuration
    );

    gameplayRestrictions.applyRestriction(
      'NoPowers',
      this.castSource,
      castLockDuration
    );

    gameplayRestrictions.applyRestriction(
      'NoFlight',
      this.castSource,
      castLockDuration
    );

    gameplayRestrictions.applyRestriction(
      'NoBasicAttack',
      this.castSource,
      castLockDuration
    );

    this.origin.copy(playerPos);

    this.corners = [
      new THREE.Vector3(
        -this.halfWidth,
        this.runeHeight,
        -this.halfDepth
      ),
      new THREE.Vector3(
        this.halfWidth,
        this.runeHeight,
        -this.halfDepth
      ),
      new THREE.Vector3(
        this.halfWidth,
        this.runeHeight,
        this.halfDepth
      ),
      new THREE.Vector3(
        -this.halfWidth,
        this.runeHeight,
        this.halfDepth
      ),
    ];

    this.launchStarts = [];
    this.launchControls = [];
    this.launchEnds = [];

    for (let i = 0; i < 4; i++) {
      this.launchStarts.push(
        new THREE.Vector3(0, 0.9, 0)
      );

      this.launchControls.push(
        new THREE.Vector3(
          this.corners[i].x * 0.45,
          3.2 + (i % 2) * 0.4,
          this.corners[i].z * 0.45
        )
      );

      this.launchEnds.push(this.corners[i].clone());
    }

    this.root = new THREE.Group();
    this.root.position.copy(this.origin);
    this.scene.add(this.root);

    this.runes = [];
    this.beams = [];
    this.beamMaterials = [];
    this.ropeSegments = [];
    this.walls = [];
    this.castEffects = [];

    this.createCastingEffect();

    // As runas são criadas invisíveis e só aparecem ao serem lançadas.
    for (let i = 0; i < 4; i++) {
      const rune = this.createRune(i);

      rune.group.visible = false;
      rune.group.position.copy(this.launchStarts[i]);
      rune.group.scale.setScalar(0.72);

      this.runes.push(rune);
      this.root.add(rune.group);
    }

    // Feixes mágicos entre as runas.
    for (let i = 0; i < 4; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: this.beamColor,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });

      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.055,
          0.055,
          1,
          12
        ),
        material
      );

      beam.visible = false;
      this.root.add(beam);

      this.beams.push(beam);
      this.beamMaterials.push(material);
    }

    // Cordas mágicas trançadas: três fios por lado.
    for (let edge = 0; edge < 4; edge++) {
      for (let strand = 0; strand < 3; strand++) {
        for (let segment = 0; segment < 9; segment++) {
          const material = new THREE.MeshBasicMaterial({
            color: this.ropeColors[strand],
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          });

          const radius = strand === 1 ? 0.022 : 0.016;

          const mesh = new THREE.Mesh(
            new THREE.CylinderGeometry(
              radius,
              radius,
              1,
              7
            ),
            material
          );

          mesh.visible = false;
          this.root.add(mesh);

          this.ropeSegments.push({
            mesh,
            material,
            edge,
            strand,
            segment,
          });
        }
      }
    }

    this.createWalls();

    for (const dummy of dummies) {
      if (dummy.isDead) continue;

      const direction = dummy.getCenter().sub(playerPos);
      const distance = direction.length();

      if (
        distance <= cfg.knockbackRadius &&
        distance > 0.001
      ) {
        direction.normalize();
        direction.y = Math.max(direction.y, 0.35);
        direction.normalize();

        dummy.applyImpulse?.(
          direction.multiplyScalar(cfg.knockbackForce)
        );
      }
    }

    audioSystem.playRunicWard?.();
    this.onShake(0.035);

    return true;
  }

  /**
   * Cria um efeito mágico independente em cada mão.
   */
  private createCastingEffect(): void {
    if (!this.root) return;

    this.castEffects = [];

    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();

      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 20, 20),
        new THREE.MeshBasicMaterial({
          color: 0xcba0ff,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );

      const aura = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 20, 20),
        new THREE.MeshBasicMaterial({
          color: 0x9b5ce0,
          transparent: true,
          opacity: 0.25,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(
          0.25,
          0.014,
          8,
          32
        ),
        new THREE.MeshBasicMaterial({
          color: 0xe3c4ff,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );

      ring.rotation.x = Math.PI / 2;

      group.add(aura, orb, ring);
      group.visible = false;

      this.root.add(group);
      this.castEffects.push(group);
    }
  }

  private createWalls(): void {
    if (!this.root) return;

    const definitions: {
      kind: WardWall['kind'];
      width: number;
      height: number;
      position: THREE.Vector3;
      rotation: THREE.Euler;
    }[] = [
      {
        kind: 'front',
        width: this.halfWidth * 2,
        height: this.wallHeight,
        position: new THREE.Vector3(
          0,
          this.wallHeight / 2,
          this.halfDepth
        ),
        rotation: new THREE.Euler(0, 0, 0),
      },
      {
        kind: 'back',
        width: this.halfWidth * 2,
        height: this.wallHeight,
        position: new THREE.Vector3(
          0,
          this.wallHeight / 2,
          -this.halfDepth
        ),
        rotation: new THREE.Euler(0, Math.PI, 0),
      },
      {
        kind: 'left',
        width: this.halfDepth * 2,
        height: this.wallHeight,
        position: new THREE.Vector3(
          -this.halfWidth,
          this.wallHeight / 2,
          0
        ),
        rotation: new THREE.Euler(0, Math.PI / 2, 0),
      },
      {
        kind: 'right',
        width: this.halfDepth * 2,
        height: this.wallHeight,
        position: new THREE.Vector3(
          this.halfWidth,
          this.wallHeight / 2,
          0
        ),
        rotation: new THREE.Euler(0, -Math.PI / 2, 0),
      },
      {
        kind: 'floor',
        width: this.halfWidth * 2,
        height: this.halfDepth * 2,
        position: new THREE.Vector3(0, 0.035, 0),
        rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      },
    ];

    for (const definition of definitions) {
      const isFloor = definition.kind === 'floor';

      const material = new THREE.MeshBasicMaterial({
        color: isFloor ? 0x8b4bc7 : 0x9d68df,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.NormalBlending,
        toneMapped: false,
      });

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(
          definition.width,
          definition.height,
          1,
          1
        ),
        material
      );

      mesh.position.copy(definition.position);
      mesh.rotation.copy(definition.rotation);
      mesh.visible = false;
      mesh.scale.set(0.001, 0.001, 1);

      this.root.add(mesh);

      const edgeMeshes: THREE.Mesh[] = [];

      const edgeMaterial = new THREE.MeshBasicMaterial({
        color: 0xd8b7ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });

      const edgeGeometry = new THREE.CylinderGeometry(
        0.018,
        0.018,
        1,
        6
      );

      const edgePositions = isFloor
        ? [
            [
              new THREE.Vector3(
                -this.halfWidth,
                0.045,
                -this.halfDepth
              ),
              new THREE.Vector3(
                this.halfWidth,
                0.045,
                -this.halfDepth
              ),
            ],
            [
              new THREE.Vector3(
                this.halfWidth,
                0.045,
                -this.halfDepth
              ),
              new THREE.Vector3(
                this.halfWidth,
                0.045,
                this.halfDepth
              ),
            ],
            [
              new THREE.Vector3(
                this.halfWidth,
                0.045,
                this.halfDepth
              ),
              new THREE.Vector3(
                -this.halfWidth,
                0.045,
                this.halfDepth
              ),
            ],
            [
              new THREE.Vector3(
                -this.halfWidth,
                0.045,
                this.halfDepth
              ),
              new THREE.Vector3(
                -this.halfWidth,
                0.045,
                -this.halfDepth
              ),
            ],
          ]
        : this.getWallEdgePositions(
            definition.kind as Exclude<WardWall['kind'], 'floor'>
          );

      for (const [start, end] of edgePositions) {
        const edge = new THREE.Mesh(
          edgeGeometry,
          edgeMaterial
        );

        edge.visible = false;
        edge.userData.start = start;
        edge.userData.end = end;

        this.root.add(edge);
        edgeMeshes.push(edge);
      }

      this.walls.push({
        mesh,
        material,
        kind: definition.kind,
        baseScale: new THREE.Vector3(1, 1, 1),
        edgeMeshes,
      });
    }
  }

  private getWallEdgePositions(
    kind: Exclude<WardWall['kind'], 'floor'>
  ): [THREE.Vector3, THREE.Vector3][] {
    const x = kind === 'left'
      ? -this.halfWidth
      : kind === 'right'
        ? this.halfWidth
        : 0;

    const z = kind === 'front'
      ? this.halfDepth
      : kind === 'back'
        ? -this.halfDepth
        : 0;

    if (kind === 'front' || kind === 'back') {
      return [
        [
          new THREE.Vector3(-this.halfWidth, 0, z),
          new THREE.Vector3(this.halfWidth, 0, z),
        ],
        [
          new THREE.Vector3(
            -this.halfWidth,
            this.wallHeight,
            z
          ),
          new THREE.Vector3(
            this.halfWidth,
            this.wallHeight,
            z
          ),
        ],
        [
          new THREE.Vector3(-this.halfWidth, 0, z),
          new THREE.Vector3(
            -this.halfWidth,
            this.wallHeight,
            z
          ),
        ],
        [
          new THREE.Vector3(this.halfWidth, 0, z),
          new THREE.Vector3(
            this.halfWidth,
            this.wallHeight,
            z
          ),
        ],
      ];
    }

    return [
      [
        new THREE.Vector3(x, 0, -this.halfDepth),
        new THREE.Vector3(x, 0, this.halfDepth),
      ],
      [
        new THREE.Vector3(
          x,
          this.wallHeight,
          -this.halfDepth
        ),
        new THREE.Vector3(
          x,
          this.wallHeight,
          this.halfDepth
        ),
      ],
      [
        new THREE.Vector3(x, 0, -this.halfDepth),
        new THREE.Vector3(
          x,
          this.wallHeight,
          -this.halfDepth
        ),
      ],
      [
        new THREE.Vector3(x, 0, this.halfDepth),
        new THREE.Vector3(
          x,
          this.wallHeight,
          this.halfDepth
        ),
      ],
    ];
  }

  private createStroke(
    start: THREE.Vector2,
    end: THREE.Vector2,
    thickness: number,
    material: THREE.Material
  ): THREE.Mesh {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length < 0.0001) {
      return new THREE.Mesh(
        new THREE.BufferGeometry(),
        material
      );
    }

    const nx = -dy / length * thickness * 0.5;
    const ny = dx / length * thickness * 0.5;

    const shape = new THREE.Shape();

    shape.moveTo(start.x + nx, start.y + ny);
    shape.lineTo(end.x + nx, end.y + ny);
    shape.lineTo(end.x - nx, end.y - ny);
    shape.lineTo(start.x - nx, start.y - ny);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.16,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.035,
      bevelThickness: 0.035,
    });

    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  private createRune(index: number): RuneNode {
    const group = new THREE.Group();
    const model = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
      color: this.runeColor,
      emissive: this.runeEmissive,
      emissiveIntensity: 0.65,
      metalness: 0.48,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });

    const V = (x: number, y: number) =>
      new THREE.Vector2(x, y);

    const stroke = (
      a: THREE.Vector2,
      b: THREE.Vector2,
      thickness = 0.16
    ) => {
      model.add(
        this.createStroke(a, b, thickness, material)
      );
    };

    switch (index) {
      case 0:
        stroke(V(0, -0.8), V(0, 0.8), 0.19);
        stroke(V(0, 0.15), V(-0.52, 0.72));
        stroke(V(0, 0.15), V(0.52, 0.72));
        stroke(V(0, -0.08), V(-0.4, 0.32), 0.12);
        stroke(V(0, -0.08), V(0.4, 0.32), 0.12);
        break;

      case 1:
        stroke(V(-0.4, -0.8), V(-0.4, 0.8), 0.19);
        stroke(V(-0.4, 0.8), V(0.4, 0.35));
        stroke(V(0.4, 0.35), V(-0.4, -0.05));
        stroke(V(-0.4, -0.05), V(0.4, -0.45));
        stroke(V(0.4, -0.45), V(-0.4, -0.8));
        break;

      case 2:
        stroke(V(-0.4, -0.8), V(-0.4, 0.8), 0.19);
        stroke(V(-0.4, 0.8), V(0.4, 0.4));
        stroke(V(0.4, 0.4), V(-0.4, 0.05));
        stroke(V(-0.4, 0.05), V(0.4, -0.35));
        stroke(V(0.4, -0.35), V(-0.4, -0.8));
        break;

      default:
        stroke(V(-0.48, -0.8), V(-0.48, 0.8));
        stroke(V(-0.48, 0.8), V(0.48, 0.8));
        stroke(V(0.48, 0.8), V(0.48, -0.8));
        stroke(V(0.48, -0.8), V(-0.48, -0.8));
        stroke(V(-0.48, 0), V(0.48, 0), 0.14);
        break;
    }

    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xb984ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const glowModel = new THREE.Group();

    for (const child of [...model.children]) {
      if (!(child instanceof THREE.Mesh)) continue;

      const glow = new THREE.Mesh(
        child.geometry,
        glowMaterial
      );

      glow.position.copy(child.position);
      glow.rotation.copy(child.rotation);
      glow.scale.setScalar(1.09);
      glow.position.z -= 0.045;

      glowModel.add(glow);
    }

    model.add(glowModel);

    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0xd2a5ff,
      emissive: 0x8b42d8,
      emissiveIntensity: 1,
      metalness: 0.58,
      roughness: 0.22,
    });

    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.145, 1),
      crystalMaterial
    );

    crystal.position.set(0, 0, 0.19);
    crystal.scale.set(0.75, 1.2, 0.8);
    model.add(crystal);

    const auraMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9b4ff,
      transparent: true,
      opacity: 0.48,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.012, 6, 32),
      auraMaterial
    );

    aura.position.set(0, 0, 0.17);
    model.add(aura);

    model.rotation.y = -0.12;
    model.rotation.x = 0.04;
    group.add(model);

    const count = 30;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.35 + Math.random() * 0.48;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] =
        (Math.random() - 0.5) * 1.8;
      positions[i * 3 + 2] =
        0.16 + Math.random() * 0.28;

      velocities[i * 3] =
        (Math.random() - 0.5) * 0.15;
      velocities[i * 3 + 1] =
        0.15 + Math.random() * 0.24;
      velocities[i * 3 + 2] =
        (Math.random() - 0.5) * 0.08;
    }

    const particleGeometry = new THREE.BufferGeometry();

    particleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: this.particleColor,
        size: 0.045,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      })
    );

    group.add(particles);

    return {
      group,
      model,
      particles,
      velocities,
      phase: index * Math.PI / 2,
      runeMaterial: material,
      crystal,
      crystalMaterial,
      aura,
      auraMaterial,
    };
  }

  private bezier(
    start: THREE.Vector3,
    control: THREE.Vector3,
    end: THREE.Vector3,
    t: number
  ): THREE.Vector3 {
    const inverse = 1 - t;

    return start.clone()
      .multiplyScalar(inverse * inverse)
      .add(
        control.clone().multiplyScalar(
          2 * inverse * t
        )
      )
      .add(
        end.clone().multiplyScalar(t * t)
      );
  }

  private orientCylinder(
    mesh: THREE.Mesh,
    start: THREE.Vector3,
    end: THREE.Vector3
  ): void {
    this.tempDirection.subVectors(end, start);

    const distance = this.tempDirection.length();

    if (distance < 0.0001) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;

    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.scale.set(1, distance, 1);

    this.tempDirection.normalize();

    mesh.quaternion.setFromUnitVectors(
      this.worldUp,
      this.tempDirection
    );
  }

  private updateRopes(
    progress: number,
    fade: number
  ): void {
    if (
      this.runes.length !== 4 ||
      this.elapsed < this.runeStart ||
      !this.runes.every(rune => rune.group.visible)
    ) {
      for (const item of this.ropeSegments) {
        item.mesh.visible = false;
        item.material.opacity = 0;
      }

      return;
    }

    const segmentsPerStrand = 9;
    const strandCount = 3;
    const twistCount = 2.8;
    const radius = 0.075;

    for (const item of this.ropeSegments) {
      const a = this.runes[item.edge].group.position;
      const b =
        this.runes[(item.edge + 1) % 4].group.position;

      this.tempDirection.subVectors(b, a);

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

      this.tempOtherSide
        .crossVectors(this.tempDirection, this.tempSide)
        .normalize();

      const t0 = item.segment / segmentsPerStrand;
      const t1 = (item.segment + 1) / segmentsPerStrand;

      const phase =
        this.elapsed * 3.2 +
        item.strand * (Math.PI * 2 / strandCount) +
        item.edge * 0.7;

      const angle0 =
        t0 * Math.PI * 2 * twistCount + phase;

      const angle1 =
        t1 * Math.PI * 2 * twistCount + phase;

      const offset0 = this.tempSide.clone()
        .multiplyScalar(Math.cos(angle0) * radius)
        .add(
          this.tempOtherSide.clone()
            .multiplyScalar(Math.sin(angle0) * radius)
        );

      const offset1 = this.tempSide.clone()
        .multiplyScalar(Math.cos(angle1) * radius)
        .add(
          this.tempOtherSide.clone()
            .multiplyScalar(Math.sin(angle1) * radius)
        );

      const start = a.clone().lerp(b, t0).add(offset0);
      const end = a.clone().lerp(b, t1).add(offset1);

      this.orientCylinder(item.mesh, start, end);

      const shimmer =
        0.72 +
        Math.sin(
          this.elapsed * 5 -
          item.segment * 0.65 +
          item.strand
        ) * 0.2;

      item.material.opacity =
        progress * 0.92 * shimmer * fade;
    }
  }

  private updateWalls(): void {
    const reveal = THREE.MathUtils.clamp(
      (this.elapsed - this.wallStart) / this.wallDuration,
      0,
      1
    );

    // Formação suave com um pequeno impulso ao assentar.
    const eased = reveal >= 1
      ? 1
      : reveal * reveal * (3 - 2 * reveal);

    const fade = this.timer < 0.8
      ? THREE.MathUtils.clamp(this.timer / 0.8, 0, 1)
      : 1;

    for (const wall of this.walls) {
      const isFloor = wall.kind === 'floor';
      const visible = this.elapsed >= this.wallStart;

      wall.mesh.visible = visible;

      wall.mesh.scale.set(
        Math.max(0.001, eased),
        Math.max(0.001, eased),
        1
      );

      const shimmer =
        0.92 + Math.sin(this.elapsed * 3.2) * 0.08;

      wall.material.opacity =
        (isFloor ? 0.17 : 0.22) *
        eased *
        shimmer *
        fade;

      for (const edge of wall.edgeMeshes) {
        edge.visible = visible;

        const start =
          edge.userData.start as THREE.Vector3;

        const end =
          edge.userData.end as THREE.Vector3;

        const animatedEnd = start.clone().lerp(end, eased);

        this.orientCylinder(
          edge,
          start,
          animatedEnd
        );

        const material =
          edge.material as THREE.MeshBasicMaterial;

        material.opacity = 0.85 * eased * fade;
      }
    }
  }

  public update(
    dt: number,
    playerPos: THREE.Vector3
  ): void {
    if (!this.isActive || !this.root) return;

    const delta = Math.min(Math.max(dt, 0), 0.05);

    this.timer -= delta;
    this.elapsed += delta;

    const runeProgress = THREE.MathUtils.clamp(
      (this.elapsed - this.runeStart) / this.runeDuration,
      0,
      1
    );

    const eased =
      runeProgress * runeProgress * (3 - 2 * runeProgress);

    const fade = this.timer < 0.8
      ? THREE.MathUtils.clamp(this.timer / 0.8, 0, 1)
      : 1;

    // Mantém a posição do efeito ligada às duas mãos.
    const hands = [
      this.stickman.leftHand,
      this.stickman.rightHand,
    ];

    const castProgress = THREE.MathUtils.clamp(
      this.elapsed / this.castDuration,
      0,
      1
    );

    for (let i = 0; i < this.castEffects.length; i++) {
      const effect = this.castEffects[i];
      const hand = hands[i];

      if (!hand) {
        effect.visible = false;
        continue;
      }

      const handPos = new THREE.Vector3();
      hand.getWorldPosition(handPos);

      effect.position.copy(handPos).sub(this.origin);

      effect.visible = this.elapsed < this.wallStart;

      const pulse =
        0.88 +
        Math.sin(this.elapsed * 15 + i * 0.8) * 0.12;

      effect.scale.setScalar(
        (0.35 + castProgress * 0.45) * pulse
      );

      effect.rotation.y += delta * (i === 0 ? 2.5 : -2.5);
      effect.rotation.z += delta * 1.8;
    }

    // As runas só aparecem quando começam a ser lançadas.
    for (let i = 0; i < this.runes.length; i++) {
      const rune = this.runes[i];

      if (this.elapsed < this.runeStart) {
        rune.group.visible = false;
        rune.group.position.copy(this.launchStarts[i]);
        rune.group.scale.setScalar(0.72);
      } else {
        rune.group.visible = true;

        const travel = THREE.MathUtils.clamp(
          (this.elapsed - this.runeStart) / this.runeDuration,
          0,
          1
        );

        // Desaceleração suave ao chegar ao ponto.
        const travelEase = 1 - Math.pow(1 - travel, 3);

        rune.group.position.copy(
          this.bezier(
            this.launchStarts[i],
            this.launchControls[i],
            this.launchEnds[i],
            travelEase
          )
        );

        const arrivalPop =
          1 + Math.sin(travel * Math.PI) * 0.12;

        rune.group.scale.setScalar(
          THREE.MathUtils.lerp(
            0.72,
            1,
            travelEase
          ) * arrivalPop
        );
      }

      const t = this.elapsed + rune.phase;

      if (runeProgress >= 1) {
        rune.group.position.y +=
          Math.sin(t * 1.4) * 0.035;
      }

      rune.model.rotation.z =
        Math.sin(t * 0.7) * 0.025;

      rune.model.rotation.y =
        -0.12 + Math.sin(t * 0.45) * 0.035;

      const pulse =
        0.72 + (Math.sin(t * 2.7) + 1) * 0.22;

      rune.runeMaterial.emissiveIntensity =
        0.48 + pulse * 0.42;

      rune.crystal.rotation.y += delta * 1.8;
      rune.crystal.rotation.x += delta * 0.8;

      rune.crystal.scale.set(
        0.75 * (1 + pulse * 0.08),
        1.2 * (1 + pulse * 0.1),
        0.8 * (1 + pulse * 0.08)
      );

      rune.crystalMaterial.emissiveIntensity =
        0.65 + pulse * 0.75;

      rune.aura.rotation.z = t * 0.75;
      rune.aura.scale.setScalar(0.9 + pulse * 0.2);

      rune.auraMaterial.opacity =
        (0.3 + pulse * 0.24) * fade;

      const positions = rune.particles.geometry
        .getAttribute('position') as THREE.BufferAttribute;

      for (let p = 0; p < positions.count; p++) {
        let x =
          positions.getX(p) +
          rune.velocities[p * 3] * delta;

        let y =
          positions.getY(p) +
          rune.velocities[p * 3 + 1] * delta;

        let z =
          positions.getZ(p) +
          rune.velocities[p * 3 + 2] * delta;

        x += Math.sin(t + p * 0.4) * delta * 0.035;

        if (y > 1 || Math.abs(x) > 0.9) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 0.25 + Math.random() * 0.45;

          x = Math.cos(angle) * radius;
          y = -0.9;
          z = 0.1 + Math.random() * 0.25;
        }

        positions.setXYZ(p, x, y, z);
      }

      positions.needsUpdate = true;
      (rune.particles.material as THREE.PointsMaterial).opacity =
        0.72 * fade;
    }

    // Feixes aparecem junto com o lançamento das runas.
    for (let i = 0; i < 4; i++) {
      const a = this.runes[i].group.position;
      const b =
        this.runes[(i + 1) % 4].group.position;

      const beam = this.beams[i];
      const direction = new THREE.Vector3().subVectors(b, a);
      const distance = direction.length();

      beam.position.copy(a).add(b).multiplyScalar(0.5);

      if (distance > 0.001) {
        direction.normalize();

        beam.quaternion.setFromUnitVectors(
          this.worldUp,
          direction
        );
      }

      beam.scale.set(1, distance, 1);

      beam.visible =
        this.elapsed >= this.runeStart &&
        this.runes.every(rune => rune.group.visible);

      this.beamMaterials[i].opacity =
        runeProgress *
        0.38 *
        (
          0.82 +
          Math.sin(this.elapsed * 3.4 - i * 0.8) * 0.18
        ) *
        fade;
    }

    this.updateRopes(runeProgress, fade);
    this.updateWalls();

    if (this.timer <= 0) {
      this.cancel();
    }
  }

  public cancel(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.timer = 0;

    gameplayRestrictions.clearRestrictionsBySource(
      this.source
    );

    gameplayRestrictions.clearRestrictionsBySource(
      this.castSource
    );

    if (this.root) {
      this.scene.remove(this.root);

      this.root.traverse(object => {
        if (
          object instanceof THREE.Mesh ||
          object instanceof THREE.Line ||
          object instanceof THREE.LineSegments ||
          object instanceof THREE.Points
        ) {
          object.geometry.dispose();

          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];

          for (const material of materials) {
            material.dispose();
          }
        }
      });

      this.root = null;
    }

    this.runes = [];
    this.beams = [];
    this.beamMaterials = [];
    this.ropeSegments = [];
    this.walls = [];
    this.castEffects = [];
    this.corners = [];
    this.launchStarts = [];
    this.launchControls = [];
    this.launchEnds = [];
  }

  public dispose(): void {
    this.cancel();
  }
}