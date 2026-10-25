/**
 * AgathaTelekineticChoke.ts
 * Ability 4 Module for Agatha Harkness: Arcane / Telekinetic Choke.
 * Binds an enemy target dummy in telekinetic suspension, lifting it into the air,
 * dealing continuous crushing damage, and applying Stunned, Anchored, and NoMovement restrictions.
 */

import * as THREE from 'three';
import { TargetDummy } from '../../TargetDummy';
import { StickmanNodes } from '../../StickmanRig';
import { audioSystem } from '../../AudioSystem';
import { gameplayRestrictions } from '../../GameplayRestrictions';
import { activeAgathaConfig } from './AgathaConfig';

export class AgathaTelekineticChoke {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAimDestination: () => { pos: THREE.Vector3; target: TargetDummy | null };
  private onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void;
  private onShake: (amount: number) => void;

  public isActive: boolean = false;
  public target: TargetDummy | null = null;
  public elevationOffset: number = 0;
  private timer: number = 0;
  private tickTimer: number = 0;

  private leftCord: THREE.Line;
  private rightCord: THREE.Line;
  private neckCoil: THREE.Mesh;
  private chokeLight: THREE.PointLight;

  constructor(
    scene: THREE.Scene,
    stickman: StickmanNodes,
    getAimDestination: () => { pos: THREE.Vector3; target: TargetDummy | null },
    onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void,
    onShake: (amount: number) => void
  ) {
    this.scene = scene;
    this.stickman = stickman;
    this.getAimDestination = getAimDestination;
    this.onDamageDealt = onDamageDealt;
    this.onShake = onShake;

    // Dual occult energy lines
    const cordGeoL = new THREE.BufferGeometry();
    cordGeoL.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const cordGeoR = new THREE.BufferGeometry();
    cordGeoR.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);

    const cordMat = new THREE.LineBasicMaterial({
      color: 0xc084fc,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });
    this.leftCord = new THREE.Line(cordGeoL, cordMat);
    this.rightCord = new THREE.Line(cordGeoR, cordMat.clone());
    this.leftCord.visible = false;
    this.rightCord.visible = false;
    this.scene.add(this.leftCord);
    this.scene.add(this.rightCord);

    // Glowing constriction Torus
    const neckGeo = new THREE.TorusGeometry(0.32, 0.06, 8, 20);
    const neckMat = new THREE.MeshBasicMaterial({
      color: 0x9333ea,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.neckCoil = new THREE.Mesh(neckGeo, neckMat);
    this.neckCoil.rotation.x = Math.PI / 2;
    this.neckCoil.visible = false;
    this.scene.add(this.neckCoil);

    this.chokeLight = new THREE.PointLight(0xa855f7, 0, 6);
    this.scene.add(this.chokeLight);
  }

  public activate(playerPos: THREE.Vector3, dummies: TargetDummy[]): boolean {
    const cfg = activeAgathaConfig.arcaneChoke;

    if (this.isActive) {
      this.cancel();
      return false;
    }

    const aim = this.getAimDestination();
    let target = aim.target;

    if (!target || target.isDead) {
      let minDist = cfg.maxRange;
      for (const d of dummies) {
        if (d.isDead) continue;
        const dist = d.getCenter().distanceTo(playerPos);
        if (dist <= minDist) {
          minDist = dist;
          target = d;
        }
      }
    }

    if (!target || target.isDead || target.getCenter().distanceTo(playerPos) > cfg.maxRange) {
      audioSystem.playError?.();
      return false;
    }

    this.isActive = true;
    this.target = target;
    this.timer = cfg.duration;
    this.tickTimer = 0;
    this.elevationOffset = 0;

    target.isChoked = true;

    // Apply centralized restrictions on the choke event
    gameplayRestrictions.applyRestriction('NoMovement', 'agatha-choke', cfg.duration);
    gameplayRestrictions.applyRestriction('NoFlight', 'agatha-choke', cfg.duration);
    gameplayRestrictions.applyRestriction('Anchored', 'agatha-choke', cfg.duration);
    gameplayRestrictions.applyRestriction('Stunned', 'agatha-choke', cfg.duration);

    this.leftCord.visible = true;
    this.rightCord.visible = true;
    this.neckCoil.visible = true;
    this.chokeLight.intensity = 4.0;

    audioSystem.playArcaneChokeStart?.();
    this.onShake(0.06);
    return true;
  }

  public update(dt: number, playerPos: THREE.Vector3): void {
    if (!this.isActive || !this.target || this.target.isDead) {
      if (this.isActive) this.cancel();
      return;
    }

    const cfg = activeAgathaConfig.arcaneChoke;
    this.timer -= dt;
    this.tickTimer += dt;

    // Smoothly elevate the suspended target dummy
    this.elevationOffset = THREE.MathUtils.lerp(this.elevationOffset, cfg.liftHeight, dt * 3.5);
    this.target.chokeElevation = this.elevationOffset;

    // Hand world positions
    const leftHandPos = new THREE.Vector3();
    const rightHandPos = new THREE.Vector3();
    this.stickman.leftHand.getWorldPosition(leftHandPos);
    this.stickman.rightHand.getWorldPosition(rightHandPos);

    const neckPos = this.target.getCenter().add(new THREE.Vector3(0, 0.45, 0));

    // Update left cord
    const posL = this.leftCord.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posL) {
      posL.setXYZ(0, leftHandPos.x, leftHandPos.y, leftHandPos.z);
      posL.setXYZ(1, neckPos.x, neckPos.y, neckPos.z);
      posL.needsUpdate = true;
    }

    // Update right cord
    const posR = this.rightCord.geometry.getAttribute('position') as THREE.BufferAttribute;
    if (posR) {
      posR.setXYZ(0, rightHandPos.x, rightHandPos.y, rightHandPos.z);
      posR.setXYZ(1, neckPos.x, neckPos.y, neckPos.z);
      posR.needsUpdate = true;
    }

    this.neckCoil.position.copy(neckPos);
    this.neckCoil.rotation.z += dt * 5.0;
    this.chokeLight.position.copy(neckPos);

    // Periodic choke damage tick
    if (this.tickTimer >= cfg.tickInterval) {
      this.tickTimer = 0;
      this.onDamageDealt(this.target, cfg.tickDamage, neckPos);
      this.onShake(0.02);
      audioSystem.playImpact?.();
    }

    if (this.timer <= 0) {
      this.cancel();
    }
  }

  public cancel(): void {
    if (!this.isActive) return;
    this.isActive = false;

    // Remove only restrictions belonging to this ability
    gameplayRestrictions.clearRestrictionsBySource('agatha-choke');

    if (this.target) {
      this.target.isChoked = false;
      this.target.chokeElevation = 0;
      this.target = null;
    }
    this.elevationOffset = 0;

    this.leftCord.visible = false;
    this.rightCord.visible = false;
    this.neckCoil.visible = false;
    this.chokeLight.intensity = 0;
  }

  public dispose(): void {
    this.cancel();
    this.scene.remove(this.leftCord);
    this.scene.remove(this.rightCord);
    this.scene.remove(this.neckCoil);
    this.scene.remove(this.chokeLight);
  }
}
