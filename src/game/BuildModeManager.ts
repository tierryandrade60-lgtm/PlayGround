import * as THREE from 'three';
import {
  BuildObjectData,
  BuildObjectType,
  MaterialPresetType,
  BuildHistoryAction,
  SerializedSceneBuild,
  GridSnapSetting,
  RotateSnapSetting,
  TransformMode,
} from './BuildTypes';
import { TargetDummy } from './TargetDummy';
import { liveConfigManager } from './LiveConfigManager';
import { audioSystem } from './AudioSystem';
import { BUILD_MODE_SCENE } from './generated/BuildModeDefaults';

const SCENE_STORAGE_KEY = 'stickman_buildmode_scene_v1';

export class BuildModeManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  // Object Registry
  private objectsMap: Map<string, { data: BuildObjectData; object3D: THREE.Object3D; dummyInstance?: TargetDummy }> = new Map();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  
  // Selection & Transform Gizmos
  public selectedId: string | null = null;
  private selectionBoxHelper: THREE.BoxHelper | null = null;
  public transformControls: any = null;
  private transformHelper: THREE.Object3D | null = null;
  private currentTransformMode: TransformMode = 'select';
  private isGizmoDragging: boolean = false;
  private dragInitialState: BuildObjectData | null = null;

  private listeners: Set<() => void> = new Set();

  // Snapping Settings
  public gridSnap: GridSnapSetting = 1.0;
  public rotateSnap: RotateSnapSetting = 15;

  // Undo / Redo Stacks
  private undoStack: BuildHistoryAction[] = [];
  private redoStack: BuildHistoryAction[] = [];
  private readonly maxHistory: number = 40;
  private suppressHistory: boolean = false;
  private isHydrating: boolean = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  // Callbacks to GameScene
  public onCollisionBoxesChanged?: (boxes: THREE.Box3[]) => void;
  public onDummyCreated?: (dummy: TargetDummy) => void;
  public onDummyRemoved?: (dummy: TargetDummy) => void;

  // Collision Diagnostics
  public showCollisionHelpers: boolean = false;
  private collisionHelpers: Map<string, THREE.Mesh> = new Map();
  public isFreeFlyMode: boolean = false;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;

    // 1. Initialize Selection Box visual helper
    const dummyObj = new THREE.Object3D();
    this.selectionBoxHelper = new THREE.BoxHelper(dummyObj, 0x00f0ff);
    (this.selectionBoxHelper.material as THREE.LineBasicMaterial).depthTest = false;
    (this.selectionBoxHelper.material as THREE.LineBasicMaterial).transparent = true;
    (this.selectionBoxHelper.material as THREE.LineBasicMaterial).opacity = 0.95;
    this.selectionBoxHelper.renderOrder = 9999;
    this.selectionBoxHelper.visible = false;
    this.scene.add(this.selectionBoxHelper);

    // TransformControls omitted for Script-Only Build Mode
  }

  // --- REGISTRATION OF DEFAULT OBJECTS ---

  public registerDefaultBaseplate(mesh: THREE.Mesh): void {
    const data: BuildObjectData = {
      id: 'default_baseplate',
      name: 'Arena Baseplate Ground',
      type: 'baseplate',
      isUserCreated: false,
      isProtected: true,
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      rotation: [THREE.MathUtils.radToDeg(mesh.rotation.x), THREE.MathUtils.radToDeg(mesh.rotation.y), THREE.MathUtils.radToDeg(mesh.rotation.z)],
      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
      color: '#768291',
      materialType: 'plastic',
      roughness: 0.85,
      metalness: 0.05,
      opacity: 1.0,
      canCollide: true,
      castShadow: false,
      receiveShadow: true,
    };
    mesh.userData.buildId = data.id;
    this.objectsMap.set(data.id, { data, object3D: mesh });
  }

  public registerDefaultSunLight(light: THREE.DirectionalLight): void {
    const data: BuildObjectData = {
      id: 'default_sun_light',
      name: 'Sun Key Light',
      type: 'sun_light',
      isUserCreated: false,
      isProtected: true,
      position: [light.position.x, light.position.y, light.position.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#fff7ea',
      materialType: 'smooth',
      roughness: 0,
      metalness: 0,
      opacity: 1,
      canCollide: false,
      castShadow: true,
      receiveShadow: false,
      lightIntensity: light.intensity,
    };
    light.userData.buildId = data.id;
    this.objectsMap.set(data.id, { data, object3D: light });
  }

  public registerDefaultStickman(root: THREE.Group): void {
    const data: BuildObjectData = {
      id: 'default_stickman',
      name: 'White Clay Stickman (Player)',
      type: 'stickman',
      isUserCreated: false,
      isProtected: true,
      position: [root.position.x, root.position.y, root.position.z],
      rotation: [0, THREE.MathUtils.radToDeg(root.rotation.y), 0],
      scale: [1, 1, 1],
      color: '#edf0f4',
      materialType: 'smooth',
      roughness: 0.58,
      metalness: 0.04,
      opacity: 1.0,
      canCollide: true,
      castShadow: true,
      receiveShadow: true,
    };
    root.userData.buildId = data.id;
    this.objectsMap.set(data.id, { data, object3D: root });
  }

  public registerDefaultStructure(mesh: THREE.Mesh, name: string, id: string): void {
    const data: BuildObjectData = {
      id,
      name,
      type: 'default_structure',
      isUserCreated: false,
      isProtected: false,
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      rotation: [THREE.MathUtils.radToDeg(mesh.rotation.x), THREE.MathUtils.radToDeg(mesh.rotation.y), THREE.MathUtils.radToDeg(mesh.rotation.z)],
      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
      color: '#8a929d',
      materialType: 'plastic',
      roughness: 0.75,
      metalness: 0.1,
      opacity: 1.0,
      canCollide: true,
      castShadow: true,
      receiveShadow: true,
    };
    mesh.userData.buildId = id;
    this.objectsMap.set(id, { data, object3D: mesh });
  }

  public registerDefaultDummy(dummy: TargetDummy, name: string, id: string): void {
    const data: BuildObjectData = {
      id,
      name,
      type: 'dummy',
      isUserCreated: false,
      isProtected: false,
      position: [dummy.group.position.x, dummy.group.position.y, dummy.group.position.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: dummy.isRival ? '#00f0ff' : '#dee2e6',
      materialType: 'smooth',
      roughness: 0.62,
      metalness: 0.05,
      opacity: 1.0,
      canCollide: false,
      castShadow: true,
      receiveShadow: true,
      dummyHealth: dummy.maxHealth,
      isRivalDummy: dummy.isRival,
    };
    dummy.group.userData.buildId = id;
    this.objectsMap.set(id, { data, object3D: dummy.group, dummyInstance: dummy });
  }

  // --- MATERIAL FACTORY ---

  private createMaterial(preset: MaterialPresetType, colorHex: string, opacity: number): THREE.Material {
    const color = new THREE.Color(colorHex);

    switch (preset) {
      case 'neon':
        return new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.1,
          transparent: opacity < 1.0,
          opacity,
        });
      case 'metal':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.18,
          metalness: 0.92,
          transparent: opacity < 1.0,
          opacity,
        });
      case 'glass':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.08,
          metalness: 0.1,
          transparent: true,
          opacity: Math.min(0.65, opacity),
          depthWrite: false,
        });
      case 'wood':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.88,
          metalness: 0.02,
          transparent: opacity < 1.0,
          opacity,
        });
      case 'smooth':
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.45,
          metalness: 0.06,
          transparent: opacity < 1.0,
          opacity,
        });
      case 'plastic':
      default:
        return new THREE.MeshStandardMaterial({
          color,
          roughness: 0.72,
          metalness: 0.08,
          transparent: opacity < 1.0,
          opacity,
        });
    }
  }

  // --- CREATION OF PRIMITIVES & GAMEPLAY PARTS ---

  public addPart(type: BuildObjectType, customProps?: Partial<BuildObjectData>): string {
    const requestedId = customProps?.id;
    const id = requestedId && !this.objectsMap.has(requestedId)
      ? requestedId
      : `user_${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const spawnPos: [number, number, number] = customProps?.position || [
      this.snapValue(this.camera.position.x + (Math.random() - 0.5) * 4, this.gridSnap),
      0,
      this.snapValue(this.camera.position.z - 6 + (Math.random() - 0.5) * 4, this.gridSnap),
    ];

    let mesh: THREE.Object3D;
    let defaultColor = '#3b82f6';
    let defaultMaterial: MaterialPresetType = 'plastic';
    let canCollide = true;
    let dummyInstance: TargetDummy | undefined;

    switch (type) {
      case 'part': {
        const geo = new THREE.BoxGeometry(2, 2, 2);
        const mat = this.createMaterial('plastic', '#3b82f6', 1.0);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(spawnPos[0], spawnPos[1] + 1.0, spawnPos[2]);
        m.castShadow = true;
        m.receiveShadow = true;
        mesh = m;
        defaultColor = '#3b82f6';
        break;
      }
      case 'sphere': {
        const geo = new THREE.SphereGeometry(1.2, 32, 24);
        const mat = this.createMaterial('smooth', '#10b981', 1.0);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(spawnPos[0], spawnPos[1] + 1.2, spawnPos[2]);
        m.castShadow = true;
        m.receiveShadow = true;
        mesh = m;
        defaultColor = '#10b981';
        break;
      }
      case 'cylinder': {
        const geo = new THREE.CylinderGeometry(1.0, 1.0, 2.5, 24);
        const mat = this.createMaterial('metal', '#f59e0b', 1.0);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(spawnPos[0], spawnPos[1] + 1.25, spawnPos[2]);
        m.castShadow = true;
        m.receiveShadow = true;
        mesh = m;
        defaultColor = '#f59e0b';
        break;
      }
      case 'wedge': {
        // Triangular ramp geometry: (0,0)->(width, 0)->(width, height) extruded depth
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(3.0, 0);
        shape.lineTo(3.0, 2.0);
        shape.closePath();

        const extrudeSettings = { depth: 2.5, bevelEnabled: false };
        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.center(); // Center pivot
        const mat = this.createMaterial('plastic', '#8b5cf6', 1.0);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(spawnPos[0], spawnPos[1] + 1.0, spawnPos[2]);
        m.castShadow = true;
        m.receiveShadow = true;
        mesh = m;
        defaultColor = '#8b5cf6';
        break;
      }
      case 'plane': {
        const geo = new THREE.BoxGeometry(6, 0.4, 6);
        const mat = this.createMaterial('plastic', '#64748b', 1.0);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(spawnPos[0], spawnPos[1] + 0.2, spawnPos[2]);
        m.castShadow = true;
        m.receiveShadow = true;
        mesh = m;
        defaultColor = '#64748b';
        break;
      }
      case 'jumppad': {
        // High-tech neon launch pad with directional glow
        const padGroup = new THREE.Group();
        const baseGeo = new THREE.CylinderGeometry(1.4, 1.5, 0.25, 24);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.6, metalness: 0.8 });
        const baseMesh = new THREE.Mesh(baseGeo, baseMat);
        baseMesh.castShadow = true;
        baseMesh.receiveShadow = true;
        padGroup.add(baseMesh);

        // Glowing center core
        const coreGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.28, 24);
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0x00f0ff,
          emissive: 0x00d2ff,
          emissiveIntensity: 1.2,
          roughness: 0.1,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        padGroup.add(coreMesh);

        // Chevron arrow indicator
        const chevronGeo = new THREE.RingGeometry(0.35, 0.65, 16);
        const chevronMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const chevron = new THREE.Mesh(chevronGeo, chevronMat);
        chevron.rotation.x = -Math.PI / 2;
        chevron.position.y = 0.16;
        padGroup.add(chevron);

        const padLight = new THREE.PointLight(0x00f0ff, 1.5, 5);
        padLight.position.set(0, 0.5, 0);
        padGroup.add(padLight);

        padGroup.position.set(spawnPos[0], spawnPos[1] + 0.125, spawnPos[2]);
        mesh = padGroup;
        defaultColor = '#00f0ff';
        defaultMaterial = 'neon';
        canCollide = true;
        break;
      }
      case 'barrier': {
        // Translucent neon forcefield wall
        const geo = new THREE.BoxGeometry(0.4, 5, 8);
        const mat = this.createMaterial('neon', '#ec4899', 0.65);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(spawnPos[0], spawnPos[1] + 2.5, spawnPos[2]);
        m.castShadow = false;
        m.receiveShadow = true;
        mesh = m;
        defaultColor = '#ec4899';
        defaultMaterial = 'neon';
        canCollide = true;
        break;
      }
      case 'light': {
        // Point light with visible bulb helper
        const lightGroup = new THREE.Group();
        const bulbGeo = new THREE.SphereGeometry(0.28, 16, 16);
        const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        lightGroup.add(bulb);

        const pointLight = new THREE.PointLight(0xffd166, 2.5, 16);
        lightGroup.add(pointLight);

        lightGroup.position.set(spawnPos[0], spawnPos[1] + 3.0, spawnPos[2]);
        mesh = lightGroup;
        defaultColor = '#ffd166';
        defaultMaterial = 'neon';
        canCollide = false;
        break;
      }
      case 'dummy': {
        // Real training dummy that functions in Play Mode!
        const dummyPos = new THREE.Vector3(spawnPos[0], 0, spawnPos[2]);
        dummyInstance = new TargetDummy(
          Math.floor(Math.random() * 9000) + 100,
          dummyPos,
          () => {},
          () => dummyPos.clone()
        );
        mesh = dummyInstance.group;
        defaultColor = '#dee2e6';
        defaultMaterial = 'smooth';
        canCollide = false;
        if (this.onDummyCreated) {
          this.onDummyCreated(dummyInstance);
        }
        break;
      }
      default: {
        const geo = new THREE.BoxGeometry(2, 2, 2);
        const mat = this.createMaterial('plastic', '#94a3b8', 1.0);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(spawnPos[0], spawnPos[1] + 1.0, spawnPos[2]);
        mesh = m;
        break;
      }
    }

    const data: BuildObjectData = {
      id,
      name: customProps?.name || `${type.charAt(0).toUpperCase() + type.slice(1)} ${this.getUserObjectsCount() + 1}`,
      type,
      isUserCreated: true,
      isProtected: false,
      position: [mesh.position.x, mesh.position.y, mesh.position.z],
      rotation: [
        THREE.MathUtils.radToDeg(mesh.rotation.x),
        THREE.MathUtils.radToDeg(mesh.rotation.y),
        THREE.MathUtils.radToDeg(mesh.rotation.z),
      ],
      scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
      color: customProps?.color || defaultColor,
      materialType: customProps?.materialType || defaultMaterial,
      roughness: customProps?.roughness ?? 0.6,
      metalness: customProps?.metalness ?? 0.1,
      opacity: customProps?.opacity ?? 1.0,
      canCollide: customProps?.canCollide ?? canCollide,
      castShadow: customProps?.castShadow ?? true,
      receiveShadow: customProps?.receiveShadow ?? true,
      lightIntensity: customProps?.lightIntensity ?? 2.5,
      lightDistance: customProps?.lightDistance ?? 16,
      dummyHealth: customProps?.dummyHealth ?? 100,
      isRivalDummy: customProps?.isRivalDummy ?? false,
      bouncePower: customProps?.bouncePower ?? 20,
    };

    mesh.userData.buildId = id;
    this.scene.add(mesh);
    this.objectsMap.set(id, { data, object3D: mesh, dummyInstance });

    // Record undo
    this.pushUndo({
      id: `action_${Date.now()}`,
      type: 'add',
      description: `Add ${data.name}`,
      objectId: id,
      afterState: { ...data },
    });

    this.updateCollisionBoxes();
    this.selectObject(id);
    this.notify();
    return id;
  }

  // --- SELECTION & RAYCASTING ---

  public selectObjectAtScreen(clientX: number, clientY: number, containerRect: DOMRect): string | null {
    const mouse = new THREE.Vector2(
      ((clientX - containerRect.left) / containerRect.width) * 2 - 1,
      -((clientY - containerRect.top) / containerRect.height) * 2 + 1
    );

    this.raycaster.setFromCamera(mouse, this.camera);

    // Collect all raycast targets
    const candidates: THREE.Object3D[] = [];
    this.objectsMap.forEach((entry) => {
      // Don't select baseplate if there are other objects on it
      candidates.push(entry.object3D);
    });

    const intersects = this.raycaster.intersectObjects(candidates, true);

    if (intersects.length > 0) {
      // Find top-level object registered in build map
      for (const hit of intersects) {
        let cur: THREE.Object3D | null = hit.object;
        while (cur) {
          if (cur.userData && cur.userData.buildId) {
            const id = cur.userData.buildId;
            this.selectObject(id);
            return id;
          }
          cur = cur.parent;
        }
      }
    }

    return null;
  }

  public selectObject(id: string | null): void {
    if (this.selectedId === id) {
      this.updateSelectionBox();
      this.updateTransformGizmo();
      return;
    }

    this.selectedId = id;
    this.updateSelectionBox();
    this.updateTransformGizmo();
    this.notify();
  }

  public updateSelectionBox(): void {
    if (!this.selectionBoxHelper) return;

    if (!this.selectedId) {
      this.selectionBoxHelper.visible = false;
      return;
    }

    const entry = this.objectsMap.get(this.selectedId);
    if (!entry) {
      this.selectionBoxHelper.visible = false;
      return;
    }

    this.selectionBoxHelper.setFromObject(entry.object3D);
    this.selectionBoxHelper.visible = true;
  }

  public isTransformDragging(): boolean {
    return this.isGizmoDragging || (this.transformControls?.dragging ?? false);
  }

  public setTransformMode(mode: TransformMode): void {
    this.currentTransformMode = mode;
    this.updateTransformGizmo();
    this.notify();
  }

  public getTransformMode(): TransformMode {
    return this.currentTransformMode;
  }

  public updateSnapping(): void {
    if (!this.transformControls) return;
    this.transformControls.translationSnap = this.gridSnap > 0 ? this.gridSnap : null;
    this.transformControls.rotationSnap = this.rotateSnap > 0 ? THREE.MathUtils.degToRad(this.rotateSnap) : null;
    this.transformControls.scaleSnap = this.gridSnap > 0 ? Math.max(0.1, this.gridSnap * 0.25) : null;
  }

  public updateTransformGizmo(): void {
    if (!this.transformControls || !this.transformHelper) return;

    if (!this.selectedId || this.currentTransformMode === 'select' || this.currentTransformMode === 'fly') {
      this.transformControls.detach();
      this.transformHelper.visible = false;
      return;
    }

    const entry = this.objectsMap.get(this.selectedId);
    if (!entry || entry.data.isProtected) {
      this.transformControls.detach();
      this.transformHelper.visible = false;
      return;
    }

    const threeMode =
      this.currentTransformMode === 'move'
        ? 'translate'
        : this.currentTransformMode === 'rotate'
        ? 'rotate'
        : 'scale';

    this.transformControls.setMode(threeMode);
    this.updateSnapping();
    this.transformControls.attach(entry.object3D);
    this.transformHelper.visible = true;
  }

  public syncDataFromObject3D(entry: { data: BuildObjectData; object3D: THREE.Object3D }): void {
    const obj = entry.object3D;
    entry.data.position = [
      Number(obj.position.x.toFixed(2)),
      Number(obj.position.y.toFixed(2)),
      Number(obj.position.z.toFixed(2)),
    ];
    entry.data.rotation = [
      Number(THREE.MathUtils.radToDeg(obj.rotation.x).toFixed(1)),
      Number(THREE.MathUtils.radToDeg(obj.rotation.y).toFixed(1)),
      Number(THREE.MathUtils.radToDeg(obj.rotation.z).toFixed(1)),
    ];
    entry.data.scale = [
      Number(obj.scale.x.toFixed(2)),
      Number(obj.scale.y.toFixed(2)),
      Number(obj.scale.z.toFixed(2)),
    ];
  }

  // --- TRANSFORMS & SNAPPING ---

  public snapValue(val: number, snap: number): number {
    if (snap <= 0) return val;
    return Math.round(val / snap) * snap;
  }

  public nudgePosition(axis: 'x' | 'y' | 'z', dir: 1 | -1): void {
    if (!this.selectedId) return;
    const entry = this.objectsMap.get(this.selectedId);
    if (!entry || entry.data.isProtected) return;

    const before = { ...entry.data };
    const step = this.gridSnap > 0 ? this.gridSnap : 0.5;
    const pos = [...entry.data.position] as [number, number, number];

    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    pos[idx] = this.snapValue(pos[idx] + dir * step, this.gridSnap);

    // Keep ground objects above floor
    if (idx === 1 && pos[1] < 0) pos[1] = 0;

    this.applyTransform(this.selectedId, pos, entry.data.rotation, entry.data.scale);

    this.pushUndo({
      id: `action_${Date.now()}`,
      type: 'modify',
      description: `Move ${entry.data.name}`,
      objectId: this.selectedId,
      beforeState: before,
      afterState: { ...entry.data },
    });
  }

  public nudgeRotation(axis: 'x' | 'y' | 'z', dir: 1 | -1): void {
    if (!this.selectedId) return;
    const entry = this.objectsMap.get(this.selectedId);
    if (!entry || entry.data.isProtected) return;

    const before = { ...entry.data };
    const step = this.rotateSnap > 0 ? this.rotateSnap : 15;
    const rot = [...entry.data.rotation] as [number, number, number];

    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    rot[idx] = (rot[idx] + dir * step + 360) % 360;

    this.applyTransform(this.selectedId, entry.data.position, rot, entry.data.scale);

    this.pushUndo({
      id: `action_${Date.now()}`,
      type: 'modify',
      description: `Rotate ${entry.data.name}`,
      objectId: this.selectedId,
      beforeState: before,
      afterState: { ...entry.data },
    });
  }

  public nudgeScale(dir: 1 | -1, uniform: boolean = true, axis?: 'x' | 'y' | 'z'): void {
    if (!this.selectedId) return;
    const entry = this.objectsMap.get(this.selectedId);
    if (!entry || entry.data.isProtected) return;

    const before = { ...entry.data };
    const step = 0.25;
    const sc = [...entry.data.scale] as [number, number, number];

    if (uniform) {
      sc[0] = Math.max(0.2, Number((sc[0] + dir * step).toFixed(2)));
      sc[1] = Math.max(0.2, Number((sc[1] + dir * step).toFixed(2)));
      sc[2] = Math.max(0.2, Number((sc[2] + dir * step).toFixed(2)));
    } else if (axis) {
      const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      sc[idx] = Math.max(0.2, Number((sc[idx] + dir * step).toFixed(2)));
    }

    this.applyTransform(this.selectedId, entry.data.position, entry.data.rotation, sc);

    this.pushUndo({
      id: `action_${Date.now()}`,
      type: 'modify',
      description: `Scale ${entry.data.name}`,
      objectId: this.selectedId,
      beforeState: before,
      afterState: { ...entry.data },
    });
  }

  public setExactTransform(
    id: string,
    position?: [number, number, number],
    rotation?: [number, number, number],
    scale?: [number, number, number]
  ): void {
    const entry = this.objectsMap.get(id);
    if (!entry) return;

    const before = { ...entry.data };
    const p = position || entry.data.position;
    const r = rotation || entry.data.rotation;
    const s = scale || entry.data.scale;

    this.applyTransform(id, p, r, s);

    this.pushUndo({
      id: `action_${Date.now()}`,
      type: 'modify',
      description: `Transform ${entry.data.name}`,
      objectId: id,
      beforeState: before,
      afterState: { ...entry.data },
    });
  }

  private applyTransform(
    id: string,
    position: [number, number, number],
    rotation: [number, number, number],
    scale: [number, number, number]
  ): void {
    const entry = this.objectsMap.get(id);
    if (!entry) return;

    entry.data.position = [...position];
    entry.data.rotation = [...rotation];
    entry.data.scale = [...scale];

    entry.object3D.position.set(position[0], position[1], position[2]);
    entry.object3D.rotation.set(
      THREE.MathUtils.degToRad(rotation[0]),
      THREE.MathUtils.degToRad(rotation[1]),
      THREE.MathUtils.degToRad(rotation[2])
    );
    entry.object3D.scale.set(scale[0], scale[1], scale[2]);
    entry.object3D.updateMatrixWorld(true);

    this.updateSelectionBox();
    this.updateCollisionBoxes();
    this.notify();
  }

  // --- PROPERTY MODIFICATION ---

  public updateProperty<K extends keyof BuildObjectData>(id: string, prop: K, value: BuildObjectData[K]): void {
    const entry = this.objectsMap.get(id);
    if (!entry) return;

    const before = { ...entry.data };
    entry.data[prop] = value;

    // Apply to Three.js representation
    if (prop === 'name') {
      entry.object3D.name = String(value);
    } else if (prop === 'color' || prop === 'materialType' || prop === 'opacity') {
      this.reapplyMaterial(entry);
    } else if (prop === 'castShadow') {
      entry.object3D.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) child.castShadow = Boolean(value);
      });
    } else if (prop === 'receiveShadow') {
      entry.object3D.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) child.receiveShadow = Boolean(value);
      });
    } else if (prop === 'canCollide') {
      this.updateCollisionBoxes();
    } else if (prop === 'dummyHealth' && entry.dummyInstance) {
      entry.dummyInstance.maxHealth = Number(value);
      entry.dummyInstance.health = Number(value);
    }

    this.pushUndo({
      id: `action_${Date.now()}`,
      type: 'modify',
      description: `Change ${String(prop)} of ${entry.data.name}`,
      objectId: id,
      beforeState: before,
      afterState: { ...entry.data },
    });

    this.notify();
  }

  private reapplyMaterial(entry: { data: BuildObjectData; object3D: THREE.Object3D }): void {
    if (entry.data.type === 'dummy' || entry.data.type === 'light' || entry.data.type === 'jumppad') return;

    const newMat = this.createMaterial(entry.data.materialType, entry.data.color, entry.data.opacity);
    entry.object3D.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && !(child.material instanceof THREE.SpriteMaterial)) {
        child.material = newMat;
      }
    });
  }

  // --- DUPLICATION & DELETION ---

  public duplicateSelected(): string | null {
    if (!this.selectedId) return null;
    const entry = this.objectsMap.get(this.selectedId);
    if (!entry || entry.data.isProtected) return null;

    const offsetPos: [number, number, number] = [
      entry.data.position[0] + 1.5,
      entry.data.position[1],
      entry.data.position[2] + 1.5,
    ];

    const { id: _sourceId, ...sourceData } = entry.data;
    const newProps: Partial<BuildObjectData> = {
      ...sourceData,
      name: `${entry.data.name} (Copy)`,
      position: offsetPos,
    };

    audioSystem.playUiClick();
    return this.addPart(entry.data.type, newProps);
  }

  public deleteSelected(): boolean {
    if (!this.selectedId) return false;
    return this.deleteObject(this.selectedId);
  }

  public deleteObject(id: string): boolean {
    const entry = this.objectsMap.get(id);
    if (!entry) return false;

    if (entry.data.isProtected) {
      // Protected elements (player, baseplate, main sun) cannot be deleted
      return false;
    }

    const before = { ...entry.data };

    // Remove from scene
    this.scene.remove(entry.object3D);

    // If dummy, notify GameScene
    if (entry.dummyInstance && this.onDummyRemoved) {
      this.onDummyRemoved(entry.dummyInstance);
    }

    this.objectsMap.delete(id);

    if (this.selectedId === id) {
      this.selectedId = null;
      if (this.selectionBoxHelper) this.selectionBoxHelper.visible = false;
    }

    this.pushUndo({
      id: `action_${Date.now()}`,
      type: 'delete',
      description: `Delete ${entry.data.name}`,
      objectId: id,
      beforeState: before,
    });

    this.updateCollisionBoxes();
    this.notify();
    return true;
  }

  // --- UNDO / REDO ---

  private pushUndo(action: BuildHistoryAction): void {
    if (this.suppressHistory || this.isHydrating) return;
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo stack on new action
    this.scheduleSave();
  }

  /**
   * Debounced persistence: every real mutation (add, delete, transform,
   * property change, undo/redo) is written back to localStorage shortly after
   * it happens, so a reload never silently discards Build Mode work.
   */
  private scheduleSave(): void {
    if (this.isHydrating) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToStorage();
    }, 250);
  }

  public undo(): boolean {
    const action = this.undoStack.pop();
    if (!action) return false;

    this.redoStack.push(action);
    this.suppressHistory = true;
    try {
      if (action.type === 'add') {
        // Revert add: delete the created object
        const entry = this.objectsMap.get(action.objectId);
        if (entry) {
          this.scene.remove(entry.object3D);
          if (entry.dummyInstance && this.onDummyRemoved) {
            this.onDummyRemoved(entry.dummyInstance);
          }
          this.objectsMap.delete(action.objectId);
        }
        if (this.selectedId === action.objectId) {
          this.selectObject(null);
        }
      } else if (action.type === 'delete' && action.beforeState) {
        // Revert delete: recreate object with its original id
        this.addPart(action.beforeState.type, action.beforeState);
      } else if (action.type === 'modify' && action.beforeState) {
        const entry = this.objectsMap.get(action.objectId);
        if (entry) this.restoreObjectState(entry, action.beforeState);
      }
    } finally {
      this.suppressHistory = false;
    }

    this.updateCollisionBoxes();
    this.updateSelectionBox();
    this.notify();
    this.scheduleSave();
    return true;
  }

  public redo(): boolean {
    const action = this.redoStack.pop();
    if (!action) return false;

    this.undoStack.push(action);
    this.suppressHistory = true;
    try {
      if (action.type === 'add' && action.afterState) {
        this.addPart(action.afterState.type, action.afterState);
      } else if (action.type === 'delete') {
        const entry = this.objectsMap.get(action.objectId);
        if (entry) {
          this.scene.remove(entry.object3D);
          if (entry.dummyInstance && this.onDummyRemoved) {
            this.onDummyRemoved(entry.dummyInstance);
          }
          this.objectsMap.delete(action.objectId);
        }
        if (this.selectedId === action.objectId) {
          this.selectObject(null);
        }
      } else if (action.type === 'modify' && action.afterState) {
        const entry = this.objectsMap.get(action.objectId);
        if (entry) this.restoreObjectState(entry, action.afterState);
      }
    } finally {
      this.suppressHistory = false;
    }

    this.updateCollisionBoxes();
    this.updateSelectionBox();
    this.notify();
    this.scheduleSave();
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public toggleCollisionVisibility(visible: boolean): void {
    this.showCollisionHelpers = visible;
    this.updateCollisionVisualization();
  }

  private updateCollisionVisualization(): void {
    // Clear old helpers
    this.collisionHelpers.forEach((mesh) => this.scene.remove(mesh));
    this.collisionHelpers.clear();

    if (!this.showCollisionHelpers) return;

    this.objectsMap.forEach((entry, id) => {
      if (entry.data.canCollide && entry.data.type !== 'baseplate') {
        const box = new THREE.Box3().setFromObject(entry.object3D);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 });
        const helper = new THREE.Mesh(geo, mat);
        helper.position.copy(center);
        this.scene.add(helper);
        this.collisionHelpers.set(id, helper);
      }
    });
  }

  // --- COLLISION BOXES SYNC ---

  public updateCollisionBoxes(): void {
    const boxes: THREE.Box3[] = [];

    this.objectsMap.forEach((entry) => {
      // Baseplate and player don't count as obstacles
      if (entry.data.type === 'baseplate' || entry.data.type === 'stickman' || entry.data.type === 'sun_light') {
        return;
      }

      if (entry.data.canCollide) {
        const box = new THREE.Box3().setFromObject(entry.object3D);
        boxes.push(box);
      }
    });

    if (this.onCollisionBoxesChanged) {
      this.onCollisionBoxesChanged(boxes);
    }
    
    // Also update visuals if needed
    if (this.showCollisionHelpers) {
      this.updateCollisionVisualization();
    }
  }

  // --- JUMP PAD INTERACTION ---

  public checkJumpPads(playerPos: THREE.Vector3): { triggered: boolean; bouncePower: number } | null {
    for (const entry of this.objectsMap.values()) {
      if (entry.data.type === 'jumppad') {
        const padPos = entry.object3D.position;
        const dx = playerPos.x - padPos.x;
        const dz = playerPos.z - padPos.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < 1.6 && Math.abs(playerPos.y - padPos.y) < 1.2) {
          const power = (entry.data.bouncePower || 20) * liveConfigManager.get().jumpPadBounceMultiplier;
          return { triggered: true, bouncePower: power };
        }
      }
    }
    return null;
  }

  // --- PERSISTENCE & EXPORT / IMPORT ---

  public saveToStorage(): boolean {
    try {
      const serialized = this.serializeScene();
      localStorage.setItem(SCENE_STORAGE_KEY, JSON.stringify(serialized));
      return true;
    } catch {
      return false;
    }
  }

  public loadFromStorage(): boolean {
    try {
      const saved = localStorage.getItem(SCENE_STORAGE_KEY);
      if (!saved) {
        return BUILD_MODE_SCENE ? this.deserializeScene(BUILD_MODE_SCENE) : false;
      }
      const parsed = JSON.parse(saved) as SerializedSceneBuild;
      return this.deserializeScene(parsed);
    } catch {
      return false;
    }
  }

  public exportSceneJson(): string {
    const serialized = this.serializeScene();
    return JSON.stringify(serialized, null, 2);
  }

  public importSceneJson(jsonString: string): { success: boolean; message: string } {
    try {
      const parsed = JSON.parse(jsonString) as SerializedSceneBuild;
      if (!parsed || !Array.isArray(parsed.objects)) {
        return { success: false, message: 'Invalid scene data: missing objects array' };
      }
      const success = this.deserializeScene(parsed);
      return { success, message: success ? 'Scene imported successfully' : 'Failed to instantiate scene elements' };
    } catch (e) {
      return { success: false, message: `JSON syntax error: ${(e as Error).message}` };
    }
  }

  public resetAllUserConstructions(): void {
    // Delete all user created objects
    const idsToDelete: string[] = [];
    this.objectsMap.forEach((entry, id) => {
      if (entry.data.isUserCreated) {
        idsToDelete.push(id);
      }
    });

    idsToDelete.forEach((id) => this.deleteObject(id));

    // Clear local storage
    localStorage.removeItem(SCENE_STORAGE_KEY);
    liveConfigManager.reset();

    this.undoStack = [];
    this.redoStack = [];
    this.selectObject(null);
    this.notify();
  }

  private serializeScene(): SerializedSceneBuild {
    const objects: BuildObjectData[] = [];
    this.objectsMap.forEach((entry) => {
      // User-created parts and tuned defaults are both persisted. Rebuilding a
      // default from scratch would silently reset its position/material.
      objects.push({ ...entry.data });
    });

    return {
      version: 1,
      timestamp: Date.now(),
      name: 'Stickman Custom Arena',
      objects,
      liveConfig: liveConfigManager.get() as unknown as Record<string, unknown>,
    };
  }

  private deserializeScene(data: SerializedSceneBuild): boolean {
    this.isHydrating = true;
    this.suppressHistory = true;
    try {
      // First remove current user created objects
      const toRemove: string[] = [];
      this.objectsMap.forEach((entry, id) => {
        if (entry.data.isUserCreated) toRemove.push(id);
      });
      toRemove.forEach((id) => {
        const entry = this.objectsMap.get(id);
        if (entry) {
          this.scene.remove(entry.object3D);
          if (entry.dummyInstance && this.onDummyRemoved) {
            this.onDummyRemoved(entry.dummyInstance);
          }
          this.objectsMap.delete(id);
        }
      });

      // Reconstruct user objects and restore tuned defaults in place.
      data.objects.forEach((objData) => {
        if (!objData || typeof objData !== 'object' || !objData.id) return;
        const existing = this.objectsMap.get(objData.id);
        if (existing && !existing.data.isUserCreated) {
          this.restoreObjectState(existing, objData);
        } else if (!existing) {
          this.addPart(objData.type, objData);
        }
      });

      // If live config included, update it
      if (data.liveConfig) {
        liveConfigManager.update(data.liveConfig);
      }

      this.undoStack = [];
      this.redoStack = [];
    } finally {
      this.isHydrating = false;
      this.suppressHistory = false;
    }

    this.updateCollisionBoxes();
    this.selectObject(null);
    this.notify();
    return true;
  }

  private restoreObjectState(
    entry: { data: BuildObjectData; object3D: THREE.Object3D; dummyInstance?: TargetDummy },
    data: BuildObjectData
  ): void {
    entry.data = { ...entry.data, ...data };
    this.applyTransform(entry.data.id, entry.data.position, entry.data.rotation, entry.data.scale);
    if (entry.data.type !== 'dummy' && entry.data.type !== 'light' && entry.data.type !== 'jumppad') {
      this.reapplyMaterial(entry);
    }
    entry.object3D.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = entry.data.castShadow;
        child.receiveShadow = entry.data.receiveShadow;
      }
    });
    if (entry.object3D instanceof THREE.Light) {
      entry.object3D.intensity = entry.data.lightIntensity ?? entry.object3D.intensity;
      entry.object3D.color.set(entry.data.color);
      if (entry.object3D instanceof THREE.PointLight) {
        entry.object3D.distance = entry.data.lightDistance ?? entry.object3D.distance;
      }
    }
    if (entry.dummyInstance) {
      entry.dummyInstance.maxHealth = entry.data.dummyHealth ?? entry.dummyInstance.maxHealth;
      entry.dummyInstance.health = Math.min(entry.dummyInstance.health, entry.dummyInstance.maxHealth);
    }
  }

  // --- QUERY HELPERS ---

  public getObjectsList(): BuildObjectData[] {
    const list: BuildObjectData[] = [];
    this.objectsMap.forEach((entry) => list.push({ ...entry.data }));
    return list;
  }

  public getSelectedData(): BuildObjectData | null {
    if (!this.selectedId) return null;
    const entry = this.objectsMap.get(this.selectedId);
    return entry ? { ...entry.data } : null;
  }

  public getUserObjectsCount(): number {
    let count = 0;
    this.objectsMap.forEach((entry) => {
      if (entry.data.isUserCreated) count++;
    });
    return count;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  public dispose(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.transformControls) {
      this.transformControls.dispose();
      if (this.transformHelper) {
        this.scene.remove(this.transformHelper);
      }
    }
    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      this.selectionBoxHelper.dispose();
    }
    this.objectsMap.clear();
    this.listeners.clear();
  }
}
