/**
 * AbilityButtonSystem.ts
 * Central metadata for the combat HUD. Cooldown values mirror the previous
 * values exactly so the update does not change balance.
 */

export type PowerSet = 'ironman' | 'agatha';

export interface AbilityButtonDefinition {
  id: number;
  name: string;
  cooldown: number;
  toggle?: boolean;
  cancelDelay?: number;
  cooldownStart?: 'activation' | 'cancelOrNaturalEnd';
}

export interface CombatButtonProfile {
  powerSet: PowerSet;
  attackCooldown: number;
  dashCooldown: number;
  abilities: AbilityButtonDefinition[];
}

export const COMBAT_BUTTON_PROFILES: Record<PowerSet, CombatButtonProfile> = {
  agatha: {
    powerSet: 'agatha',
    attackCooldown: 0.22,
    dashCooldown: 2.2,
    abilities: [
      { id: 1, name: 'Drenagem Sombria', cooldown: 7.0, toggle: true, cancelDelay: 0.5, cooldownStart: 'cancelOrNaturalEnd' },
      { id: 2, name: 'Orbe do Caos', cooldown: 5.0, toggle: false, cancelDelay: 0.5, cooldownStart: 'activation' },
      { id: 3, name: 'Barreira Rúnica', cooldown: 8.0, toggle: true, cancelDelay: 0.5, cooldownStart: 'cancelOrNaturalEnd' },
      { id: 4, name: 'Estrangulamento Arcano', cooldown: 9.0, toggle: true, cancelDelay: 0.5, cooldownStart: 'cancelOrNaturalEnd' },
    ],
  },
  ironman: {
    powerSet: 'ironman',
    attackCooldown: 0.2,
    dashCooldown: 2.2,
    abilities: [
      { id: 1, name: 'Missile Volley', cooldown: 6.0, toggle: false, cancelDelay: 0.5, cooldownStart: 'activation' },
      { id: 2, name: 'Dual Beam & Clash', cooldown: 10.0, toggle: true, cancelDelay: 0.5, cooldownStart: 'cancelOrNaturalEnd' },
      { id: 3, name: 'Unibeam Blast', cooldown: 8.0, toggle: false, cancelDelay: 0.5, cooldownStart: 'activation' },
      { id: 4, name: 'Spinning Lasers', cooldown: 12.0, toggle: true, cancelDelay: 0.5, cooldownStart: 'cancelOrNaturalEnd' },
    ],
  },
};

let activeProfileProvider: (powerSet: PowerSet) => CombatButtonProfile = (powerSet) =>
  COMBAT_BUTTON_PROFILES[powerSet] || COMBAT_BUTTON_PROFILES.ironman;

export function getCombatButtonProfile(powerSet: PowerSet): CombatButtonProfile {
  try {
    return activeProfileProvider(powerSet) || COMBAT_BUTTON_PROFILES[powerSet] || COMBAT_BUTTON_PROFILES.ironman;
  } catch {
    return COMBAT_BUTTON_PROFILES[powerSet] || COMBAT_BUTTON_PROFILES.ironman;
  }
}

/** Applies an edited AbilityButtonSystem provider to the running HUD/gameplay. */
export function installCombatButtonProfileProvider(
  provider: typeof activeProfileProvider
): void {
  if (typeof provider !== 'function') {
    throw new Error('getCombatButtonProfile editado não é uma função.');
  }
  provider('ironman');
  provider('agatha');
  activeProfileProvider = provider;
}