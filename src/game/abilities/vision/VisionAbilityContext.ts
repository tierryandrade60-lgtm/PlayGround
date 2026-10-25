import type * as THREE from 'three';

/** Live hooks supplied by GameScene so Vision modules can move/lock the hero. */
export interface VisionAbilityContext {
  getPlayerPosition?: () => THREE.Vector3;
  setPlayerPosition?: (position: THREE.Vector3) => void;
  getPlayerRotation?: () => number;
  setPlayerRotation?: (yaw: number) => void;
  setHeadGrabPose?: (active: boolean) => void;
  triggerCraterCastPose?: () => void;
}
