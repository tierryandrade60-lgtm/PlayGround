import * as THREE from 'three';

export type BuildObjectType =
  | 'part' // Cube / Box
  | 'sphere' // Sphere
  | 'cylinder' // Cylinder / Barrel
  | 'wedge' // Ramp / Triangular prism
  | 'plane' // Flat platform / Tile
  | 'light' // Point Light
  | 'dummy' // Target Dummy
  | 'jumppad' // Interactive Jump / Boost Pad
  | 'barrier' // Translucent Neon Forcefield Wall
  | 'default_structure' // Original arena block/wall/platform
  | 'baseplate' // Main arena ground
  | 'sun_light' // Main directional light
  | 'stickman'; // Player rig (protected)

export type MaterialPresetType =
  | 'plastic'
  | 'smooth'
  | 'metal'
  | 'glass'
  | 'neon'
  | 'wood';

export interface BuildObjectData {
  id: string;
  name: string;
  type: BuildObjectType;
  isUserCreated: boolean;
  isProtected: boolean;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles in degrees (for user display/editing)
  scale: [number, number, number];
  color: string;
  materialType: MaterialPresetType;
  roughness: number;
  metalness: number;
  opacity: number;
  canCollide: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  
  // Specific properties
  lightIntensity?: number;
  lightDistance?: number;
  dummyHealth?: number;
  isRivalDummy?: boolean;
  bouncePower?: number; // For jump pads
}

export type TransformMode = 'select' | 'move' | 'rotate' | 'scale' | 'fly';

export type GridSnapSetting = 0 | 0.25 | 0.5 | 1.0 | 2.0 | 4.0;
export type RotateSnapSetting = 0 | 15 | 45 | 90;

export interface BuildHistoryAction {
  id: string;
  type: 'add' | 'delete' | 'modify';
  description: string;
  objectId: string;
  beforeState?: BuildObjectData;
  afterState?: BuildObjectData;
}

export interface SerializedSceneBuild {
  version: number;
  timestamp: number;
  name: string;
  objects: BuildObjectData[];
  liveConfig?: Record<string, unknown>;
}
