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
    const intDamage = Math.max(0, Math.round(Number.isFinite(damage) ? damage : 0));
    const result = dummy.takeDamage(intDamage, hitPosition, knockback);

    if (result.actualDamage > 0) {
      this.onHitConfirmed();
    }

    const actualDamage = Math.max(0, Math.round(Number.isFinite(result.actualDamage) ? result.actualDamage : 0));
    this.projectileSystem.spawnDamageNumber(actualDamage, hitPosition);

    return {
      requestedDamage: intDamage,
      actualDamage,
    };
  }
}
