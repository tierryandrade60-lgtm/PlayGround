/**
 * DealDamageSystem.ts
 * Single damage pipeline shared by characters, abilities and projectiles.
 *
 * Keeps hit confirmation and floating damage numbers in one place so every
 * ability reports damage consistently. Replacing this class through the Build
 * Scripter changes the active game immediately.
 */

import * as THREE from 'three';
import { TargetDummy } from '../TargetDummy';

export interface DamageResult {
  requestedDamage: number;
  actualDamage: number;
}

interface DamageNumberSink {
  spawnDamageNumber(value: number, worldPos: THREE.Vector3): void;
}

export class DealDamageSystem {
  private projectileSystem: DamageNumberSink;
  private onHitConfirmed: () => void;

  constructor(projectileSystem: DamageNumberSink, onHitConfirmed: () => void) {
    this.projectileSystem = projectileSystem;
    this.onHitConfirmed = onHitConfirmed;
  }

  public deal(
    dummy: TargetDummy,
    damage: number,
    hitPosition: THREE.Vector3,
    knockback?: THREE.Vector3
  ): DamageResult {
    const result = dummy.takeDamage(damage, hitPosition, knockback);

    if (result.actualDamage > 0) {
      this.onHitConfirmed();
    }

    this.projectileSystem.spawnDamageNumber(result.actualDamage, hitPosition);

    return {
      requestedDamage: damage,
      actualDamage: result.actualDamage,
    };
  }
}
