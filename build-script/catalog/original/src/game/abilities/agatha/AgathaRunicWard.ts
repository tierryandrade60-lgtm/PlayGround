/**
 * AgathaRunicWard.ts
 * Ability 3 Module for Agatha Harkness: Runic Ward / Witch Shield.
 * Projects an occult hexagonal protective barrier around Agatha,
 * knocking back close enemies and applying the genuine IsShield gameplay restriction.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { activeAgathaConfig } from './AgathaConfig';

export class AgathaRunicWard {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private onShake: (amount: number) => void;

  public isActive: boolean = false;
  private timer: number = 0;
  private shieldMesh: THREE.Mesh | null = null;
  private shieldLight: THREE.PointLight | null = null;

  constructor(scene: THREE.Scene, stickman: StickmanNodes, onShake: (amount: number) => void) {
    this.scene = scene;
    this.stickman = stickman;
    this.onShake = onShake;
  }

  public activate(playerPos: THREE.Vector3, dummies: TargetDummy[]): boolean {
    const cfg = activeAgathaConfig.runicWard;

    if (this.isActive) {
      this.cancel();
      return false;
    }

    this.isActive = true;
    this.timer = cfg.duration;

    // Apply IsShield restriction tracked by agatha-runic-ward
    gameplayRestrictions.applyRestriction('IsShield', 'agatha-runic-ward', cfg.duration);

    // Create 3D spherical runic shield mesh
    const geo = new THREE.IcosahedronGeometry(2.1, 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    this.shieldMesh = new THREE.Mesh(geo, mat);
    this.shieldMesh.position.copy(playerPos).add(new THREE.Vector3(0, 1.2, 0));
    this.scene.add(this.shieldMesh);

    this.shieldLight = new THREE.PointLight(0xd946ef, 3.5, 8.0);
    this.shieldLight.position.copy(this.shieldMesh.position);
    this.scene.add(this.shieldLight);

    // Initial radial knockback on close targets
    for (const dummy of dummies) {
      if (dummy.isDead) continue;
      const dCenter = dummy.getCenter();
      const dist = dCenter.distanceTo(playerPos);
      if (dist <= cfg.knockbackRadius) {
        const kbDir = dCenter.clone().sub(playerPos).normalize();
        kbDir.y = 1.0;
        dummy.applyImpulse?.(kbDir.multiplyScalar(cfg.knockbackForce));
      }
    }

    audioSystem.playRunicWard?.();
    this.onShake(0.04);
    return true;
  }

  public update(dt: number, playerPos: THREE.Vector3): void {
    if (!this.isActive) return;

    this.timer -= dt;
    if (this.shieldMesh) {
      this.shieldMesh.position.copy(playerPos).add(new THREE.Vector3(0, 1.2, 0));
      this.shieldMesh.rotation.y += dt * 1.5;
      this.shieldMesh.rotation.x += dt * 0.8;
      if (this.shieldLight) {
        this.shieldLight.position.copy(this.shieldMesh.position);
      }
    }

    if (this.timer <= 0) {
      this.cancel();
    }
  }

  public cancel(): void {
    if (!this.isActive) return;
    this.isActive = false;

    // Guaranteed restriction cleanup for this ability
    gameplayRestrictions.clearRestrictionsBySource('agatha-runic-ward');

    if (this.shieldMesh) {
      this.scene.remove(this.shieldMesh);
      this.shieldMesh.geometry.dispose();
      (this.shieldMesh.material as THREE.Material).dispose();
      this.shieldMesh = null;
    }
    if (this.shieldLight) {
      this.scene.remove(this.shieldLight);
      this.shieldLight = null;
    }
  }

  public dispose(): void {
    this.cancel();
  }
}
