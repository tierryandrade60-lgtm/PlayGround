/**
 * AgathaAbilities.ts
 * Central Character Controller & Ability Coordinator for Agatha Harkness (Dark & Arcana Magic).
 * Coordinates modular ability implementations:
 * - AgathaArcaneBlast (Basic attack)
 * - AgathaDarkDrain (Ability 1)
 * - AgathaChaosOrb (Ability 2)
 * - AgathaRunicWard (Ability 3 - Shield)
 * - AgathaTelekineticChoke (Ability 4 - Binding)
 * - AgathaShadowStep (Mobility / Dash)
 * - AgathaConfig (Tunable settings)
 */

import * as THREE from 'three';
import { TargetDummy } from './TargetDummy';
import { StickmanNodes } from './StickmanRig';
import { audioSystem } from './AudioSystem';
import { AgathaArcaneBlast } from './abilities/agatha/AgathaArcaneBlast';
import { AgathaDarkDrain } from './abilities/agatha/AgathaDarkDrain';
import { AgathaChaosOrb } from './abilities/agatha/AgathaChaosOrb';
import { AgathaRunicWard } from './abilities/agatha/AgathaRunicWard';
import { AgathaTelekineticChoke } from './abilities/agatha/AgathaTelekineticChoke';
import { AgathaShadowStep } from './abilities/agatha/AgathaShadowStep';
import { activeAgathaConfig, updateAgathaConfig } from './abilities/agatha/AgathaConfig';

export { activeAgathaConfig, updateAgathaConfig };

export class AgathaAbilities {
  private scene: THREE.Scene;
  private stickman: StickmanNodes;
  private getAimDestination: () => { pos: THREE.Vector3; target: TargetDummy | null };
  private onDamageDealt: (dummy: TargetDummy, dmg: number, hitPos: THREE.Vector3, knockback?: THREE.Vector3) => void;
  private onShake: (amount: number) => void;
  public onArcaneCast?: (hand: 'left' | 'right', aimPitch: number) => void;

  // Modular ability instances
  public arcaneBlastModule: AgathaArcaneBlast;
  public darkDrainModule: AgathaDarkDrain;
  public chaosOrbModule: AgathaChaosOrb;
  public runicWardModule: AgathaRunicWard;
  public chokeModule: AgathaTelekineticChoke;
  public shadowStepModule: AgathaShadowStep;

  // Compatibility properties for external readers (GameScene, HUD)
  public isDarkDrainActive: boolean = false;
  public isArcaneFlightActive: boolean = false;
  public chokeElevationOffset: number = 0;

  public chokeState = {
    active: false,
    target: null as TargetDummy | null,
    timer: 0,
    maxDuration: 3.0,
    tickTimer: 0,
    leftCord: null,
    rightCord: null,
    neckCoil: null,
    chokeLight: null,
  };

  public runicWardState = {
    active: false,
    timer: 0,
    maxDuration: 5.5,
    mesh: null,
    light: null,
  };

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

    // Instantiate modular sub-systems
    this.arcaneBlastModule = new AgathaArcaneBlast(scene, stickman, getAimDestination, onDamageDealt, onShake);
    this.darkDrainModule = new AgathaDarkDrain(scene, stickman, onDamageDealt, onShake);
    this.chaosOrbModule = new AgathaChaosOrb(scene, stickman, getAimDestination, onDamageDealt, onShake);
    this.runicWardModule = new AgathaRunicWard(scene, stickman, onShake);
    this.chokeModule = new AgathaTelekineticChoke(scene, stickman, getAimDestination, onDamageDealt, onShake);
    this.shadowStepModule = new AgathaShadowStep(scene, onShake);

    this.arcaneBlastModule.onArcaneCast = (hand, aimPitch) => {
      if (this.onArcaneCast) {
        this.onArcaneCast(hand, aimPitch);
      }
    };
  }

  // ==========================================
  // DISPATCH METHODS (forward to modular files)
  // ==========================================

  public triggerAttack(aimPitch: number = 0): boolean {
    return this.fireArcaneBlast(aimPitch);
  }

  public fireArcaneBlast(aimPitch: number = 0): boolean {
    return this.arcaneBlastModule.fire(aimPitch);
  }

  public triggerDarkDrain(playerPos: THREE.Vector3, dummies: TargetDummy[]): boolean {
    const res = this.darkDrainModule.activate(playerPos, dummies);
    this.isDarkDrainActive = this.darkDrainModule.isActive;
    return res;
  }

  public fireChaosOrb(): boolean {
    return this.chaosOrbModule.fire();
  }

  public triggerRunicWard(playerPos: THREE.Vector3, dummies: TargetDummy[]): boolean {
    const res = this.runicWardModule.activate(playerPos, dummies);
    this.runicWardState.active = this.runicWardModule.isActive;
    return res;
  }

  public triggerArcaneChoke(playerPos: THREE.Vector3, dummies: TargetDummy[]): boolean {
    const res = this.chokeModule.activate(playerPos, dummies);
    this.chokeState.active = this.chokeModule.isActive;
    this.chokeState.target = this.chokeModule.target;
    return res;
  }

  public cancelArcaneChoke(): void {
    this.chokeModule.cancel();
    this.chokeState.active = false;
    this.chokeState.target = null;
    this.chokeElevationOffset = 0;
  }

  public triggerShadowStep(
    currentPos: THREE.Vector3,
    inputDir: THREE.Vector3,
    structureBoxes: THREE.Box3[],
    onTeleport: (dest: THREE.Vector3) => void
  ): boolean {
    return this.shadowStepModule.execute(currentPos, inputDir, structureBoxes, onTeleport);
  }

  public triggerAbility(id: number, playerPos: THREE.Vector3, dummies: TargetDummy[]): boolean {
    if (id === 1) return this.triggerDarkDrain(playerPos, dummies);
    if (id === 2) return this.fireChaosOrb();
    if (id === 3) return this.triggerRunicWard(playerPos, dummies);
    if (id === 4) return this.triggerArcaneChoke(playerPos, dummies);
    return false;
  }

  public update(dt: number, arg1: any, arg2: any): void {
    const dummies: TargetDummy[] = Array.isArray(arg1) ? arg1 : Array.isArray(arg2) ? arg2 : [];
    const playerPos: THREE.Vector3 =
      arg1 instanceof THREE.Vector3 ? arg1 : arg2 instanceof THREE.Vector3 ? arg2 : new THREE.Vector3();

    // Update individual ability systems
    this.arcaneBlastModule.update(dt, dummies);
    this.darkDrainModule.update(dt, playerPos);
    this.chaosOrbModule.update(dt, dummies);
    this.runicWardModule.update(dt, playerPos);
    this.chokeModule.update(dt, playerPos);

    // Sync status states
    this.isDarkDrainActive = this.darkDrainModule.isActive;
    this.runicWardState.active = this.runicWardModule.isActive;
    this.chokeState.active = this.chokeModule.isActive;
    this.chokeState.target = this.chokeModule.target;
    this.chokeElevationOffset = this.chokeModule.elevationOffset;
  }

  public dispose(): void {
    this.arcaneBlastModule.dispose();
    this.darkDrainModule.dispose();
    this.chaosOrbModule.dispose();
    this.runicWardModule.dispose();
    this.chokeModule.dispose();
    this.shadowStepModule.dispose();
  }
}
