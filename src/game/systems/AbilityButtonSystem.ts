/**
 * AbilityButtonSystem.ts
 * Central metadata for the combat HUD. Cooldown values mirror the previous
 * values exactly so the update does not change balance.
 */

export type PowerSet = 'classic' | 'ironman' | 'agatha';

export interface AbilityButtonDefinition {
  id: number;
  name: string;
  cooldown: number;
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
      { id: 1, name: 'Drenagem Sombria', cooldown: 7.0 },
      { id: 2, name: 'Orbe do Caos', cooldown: 5.0 },
      { id: 3, name: 'Barreira Rúnica', cooldown: 8.0 },
      { id: 4, name: 'Estrangulamento Arcano', cooldown: 9.0 },
    ],
  },
  ironman: {
    powerSet: 'ironman',
    attackCooldown: 0.2,
    dashCooldown: 2.2,
    abilities: [
      { id: 1, name: 'Missile Volley', cooldown: 6.0 },
      { id: 2, name: 'Dual Beam & Clash', cooldown: 10.0 },
      { id: 3, name: 'Unibeam Blast', cooldown: 8.0 },
      { id: 4, name: 'Spinning Lasers', cooldown: 12.0 },
    ],
  },
  classic: {
    powerSet: 'classic',
    attackCooldown: 0.42,
    dashCooldown: 2.2,
    abilities: [
      { id: 1, name: 'Flame Burst', cooldown: 4.0 },
      { id: 2, name: 'Shield Ward', cooldown: 6.0 },
      { id: 3, name: 'Thunder Shock', cooldown: 3.5 },
      { id: 4, name: 'Arcane Nova', cooldown: 5.0 },
    ],
  },
};

export function getCombatButtonProfile(powerSet: PowerSet): CombatButtonProfile {
  return COMBAT_BUTTON_PROFILES[powerSet] || COMBAT_BUTTON_PROFILES.ironman;
}
