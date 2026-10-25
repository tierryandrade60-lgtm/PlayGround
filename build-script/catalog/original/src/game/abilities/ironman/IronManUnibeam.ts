/**
 * IronManUnibeam.ts
 * Ability 3 Module for Iron Man: Chest Arc Reactor Unibeam.
 * Charges and discharges an enormous concentrated particle beam from the chest core.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { activeIronManConfig } from './IronManConfig';

export class IronManUnibeam {
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

  public fire(aimDestination: { pos: THREE.Vector3; target: TargetDummy | null }): boolean {
    const cfg = activeIronManConfig.unibeam;
    const chestPos = new THREE.Vector3();
    this.stickman.upperTorso.getWorldPosition(chestPos);

    audioSystem.playUnibeamCharge?.();
    this.onShake(0.08);

    if (aimDestination.target && !aimDestination.target.isDead) {
      const kb = aimDestination.pos.clone().sub(chestPos).normalize().multiplyScalar(10.0);
      kb.y = 3.5;
      this.onDamageDealt(aimDestination.target, cfg.damage, aimDestination.pos, kb);
    }
    return true;
  }

  public dispose(): void {}
}
