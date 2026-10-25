/**
 * IronManMicroMissiles.ts
 * Ability 1 Module for Iron Man: Bezier Curve Micro-Missiles Volley.
 * Launches rapid volleys of curved miniature smart missiles that seek out targets.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeIronManConfig } from './IronManConfig';

export class IronManMicroMissiles {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void;
  private onShake: (amount: number) => void;

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void,
    onShake: (amount: number) => void
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.onDamageDealt = onDamageDealt;
    this.onShake = onShake;
  }

  public fire(target: TargetDummy | null, aimPoint: THREE.Vector3): boolean {
    const cfg = activeIronManConfig.microMissiles;
    audioSystem.playMissileLaunch?.();
    this.onShake(0.05);

    const shoulderPos = new THREE.Vector3();
    this.stickman.upperTorso.getWorldPosition(shoulderPos);
    shoulderPos.y += 0.4;

    const hitTarget = target && !target.isDead ? target : null;
    const dest = hitTarget ? hitTarget.getCenter() : aimPoint.clone();

    // Spawn volley
    for (let i = 0; i < cfg.volleyCount; i++) {
      setTimeout(() => {
        if (hitTarget && !hitTarget.isDead) {
          this.onDamageDealt(hitTarget, cfg.damagePerMissile, dest);
          audioSystem.playImpact?.();
        }
      }, 250 + i * 80);
    }

    return true;
  }

  public dispose(): void {}
}
