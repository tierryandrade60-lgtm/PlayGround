/**
 * AgathaDarkDrain.ts
 * Ability 1 Module for Agatha Harkness: Dark Drain Covenant.
 * Channels occult life siphon tendrils to all nearby target dummies within radius,
 * draining health and applying genuine Anchored and NoFlight gameplay restrictions.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { activeAgathaConfig } from './AgathaConfig';

export interface DrainTendril {
  target: TargetDummy;
  line: THREE.Line;
  glow: THREE.Mesh;
}

export class AgathaDarkDrain {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void;
  private onShake: (amount: number) => void;

  public isActive: boolean = false;
  private timer: number = 0;
  private tickTimer: number = 0;
  private activeTendrils: Map<number, DrainTendril> = new Map();
  private chestOrb: THREE.Mesh;
  private chestLight: THREE.PointLight;

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

    // Glowing purple chest vortex orb
    const chestGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const chestMat = new THREE.MeshBasicMaterial({
      color: 0xd946ef,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.chestOrb = new THREE.Mesh(chestGeo, chestMat);
    this.chestOrb.visible = false;
    this.scene.add(this.chestOrb);

    this.chestLight = new THREE.PointLight(0xa855f7, 0, 10);
    this.scene.add(this.chestLight);
  }

  public activate(playerPos: THREE.Vector3, dummies: TargetDummy[]): boolean {
    const cfg = activeAgathaConfig.darkDrain;

    if (this.isActive) {
      this.cancel();
      return false;
    }

    // Find valid dummies within range
    const inRange = dummies.filter((d) => !d.isDead && d.getCenter().distanceTo(playerPos) <= cfg.range);
    if (inRange.length === 0) {
      audioSystem.playError?.();
      return false;
    }

    this.isActive = true;
    this.timer = cfg.duration;
    this.tickTimer = 0;

    // Apply gameplay restrictions tracked specifically by this ability source
    gameplayRestrictions.applyRestriction('Anchored', 'agatha-dark-drain', cfg.duration);
    gameplayRestrictions.applyRestriction('NoFlight', 'agatha-dark-drain', cfg.duration);

    this.chestOrb.visible = true;
    (this.chestOrb.material as THREE.MeshBasicMaterial).opacity = 0.85;
    this.chestLight.intensity = 4.5;

    // Establish tendrils
    for (const dummy of inRange) {
      const geo = new THREE.BufferGeometry();
      const points = [playerPos.clone().add(new THREE.Vector3(0, 1.2, 0)), dummy.getCenter()];
      geo.setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({
        color: cfg.tendrilColor,
        linewidth: 3,
        transparent: true,
        opacity: 0.9,
      });
      const line = new THREE.Line(geo, mat);
      this.scene.add(line);

      const glowGeo = new THREE.SphereGeometry(0.2, 8, 8);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      this.scene.add(glow);

      this.activeTendrils.set(dummy.id, { target: dummy, line, glow });
    }

    audioSystem.playDarkDrainPulse?.();
    this.onShake(0.04);
    return true;
  }

  public update(dt: number, playerPos: THREE.Vector3): void {
    if (!this.isActive) return;

    const cfg = activeAgathaConfig.darkDrain;
    this.timer -= dt;
    this.tickTimer += dt;

    const chestPos = playerPos.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.chestOrb.position.copy(chestPos);
    this.chestLight.position.copy(chestPos);
    this.chestOrb.rotation.y += dt * 4.0;

    // Periodic damage tick
    if (this.tickTimer >= cfg.tickInterval) {
      this.tickTimer = 0;
      const tickDmg = Math.round(cfg.dps * cfg.tickInterval);

      for (const [id, tendril] of Array.from(this.activeTendrils.entries())) {
        if (tendril.target.isDead || tendril.target.getCenter().distanceTo(playerPos) > cfg.range * 1.25) {
          this.removeTendril(id);
          continue;
        }

        const hitPos = tendril.target.getCenter();
        this.onDamageDealt(tendril.target, tickDmg, hitPos);
      }
      this.onShake(0.015);
    }

    // Update tendril visual geometries
    for (const [id, tendril] of Array.from(this.activeTendrils.entries())) {
      if (tendril.target.isDead) {
        this.removeTendril(id);
        continue;
      }
      const targetPos = tendril.target.getCenter();
      const posAttr = tendril.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      if (posAttr) {
        posAttr.setXYZ(0, chestPos.x, chestPos.y, chestPos.z);
        posAttr.setXYZ(1, targetPos.x, targetPos.y, targetPos.z);
        posAttr.needsUpdate = true;
      }
      tendril.glow.position.copy(targetPos);
    }

    // End condition
    if (this.timer <= 0 || this.activeTendrils.size === 0) {
      this.cancel();
    }
  }

  private removeTendril(id: number): void {
    const t = this.activeTendrils.get(id);
    if (t) {
      this.scene.remove(t.line);
      t.line.geometry.dispose();
      this.scene.remove(t.glow);
      t.glow.geometry.dispose();
      this.activeTendrils.delete(id);
    }
  }

  public cancel(): void {
    if (!this.isActive) return;
    this.isActive = false;

    // Guaranteed cleanup of restrictions owned by dark drain
    gameplayRestrictions.clearRestrictionsBySource('agatha-dark-drain');

    this.chestOrb.visible = false;
    this.chestLight.intensity = 0;

    for (const id of Array.from(this.activeTendrils.keys())) {
      this.removeTendril(id);
    }
    this.activeTendrils.clear();
  }

  public dispose(): void {
    this.cancel();
    this.scene.remove(this.chestOrb);
    this.scene.remove(this.chestLight);
  }
}
