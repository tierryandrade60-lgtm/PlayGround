/**
 * IronManConfig.ts
 * Tunable parameters and typed configurations for Iron Man armor systems.
 */

export type AbilityToggleMode = 'activation' | 'cancelOrNaturalEnd';

export interface IronManAbilitySettings {
  repulsor: {
    damage: number;
    speed: number;
    maxRange: number;
    homingStrength: number;
    cooldown: number;
    beamColor: number;
    glowColor: number;
    collideWithWorld: boolean;
    toggle: boolean;
    cancelDelay: number;
    cooldownStart: AbilityToggleMode;
  };
  microMissiles: {
    volleyCount: number;
    damagePerMissile: number;
    speed: number;
    arcHeight: number;
    cooldown: number;
    collideWithWorld: boolean;
    toggle: boolean;
    cancelDelay: number;
    cooldownStart: AbilityToggleMode;
  };
  dualBeams: {
    dps: number;
    maxDuration: number;
    range: number;
    cooldown: number;
    collideWithWorld: boolean;
    beamClash: boolean;
    beamCoreColor: number;
    beamGlowColor: number;
    beamOuterColor: number;
    rivalBeamCoreColor: number;
    rivalBeamGlowColor: number;
    rivalBeamOuterColor: number;
    toggle: boolean;
    cancelDelay: number;
    cooldownStart: AbilityToggleMode;
  };
  unibeam: {
    damage: number;
    chargeTime: number;
    range: number;
    cooldown: number;
    collideWithWorld: boolean;
    toggle: boolean;
    cancelDelay: number;
    cooldownStart: AbilityToggleMode;
  };
  spinningLasers: {
    damage: number;
    radius: number;
    duration: number;
    cooldown: number;
    collideWithWorld: boolean;
    toggle: boolean;
    cancelDelay: number;
    cooldownStart: AbilityToggleMode;
  };
}

/**
 * Defaults mirror the values that were hard-coded in IronManAbilities before
 * the configuration layer existed, so making the config real does not silently
 * change the game's balance.
 */
export const DEFAULT_IRONMAN_CONFIG: IronManAbilitySettings = {
  repulsor: {
    damage: 8,
    speed: 42.0,
    maxRange: 42.0,
    homingStrength: 8.0,
    cooldown: 0.22,
    beamColor: 0xff1a2a,
    glowColor: 0xff1122,
    collideWithWorld: true,
    toggle: false,
    cancelDelay: 0.5,
    cooldownStart: 'activation',
  },
  microMissiles: {
    volleyCount: 6,
    damagePerMissile: 12,
    speed: 28.0,
    arcHeight: 5.5,
    cooldown: 6.0,
    collideWithWorld: true,
    toggle: false,
    cancelDelay: 0.5,
    cooldownStart: 'activation',
  },
  dualBeams: {
    dps: 20.0,
    maxDuration: 4.0,
    range: 22.0,
    cooldown: 10.0,
    collideWithWorld: true,
    beamClash: true,
    beamCoreColor: 0xfff7b0,
    beamGlowColor: 0xffb300,
    beamOuterColor: 0xff3b00,
    rivalBeamCoreColor: 0x66f0ff,
    rivalBeamGlowColor: 0x00a8ff,
    rivalBeamOuterColor: 0x7a00ff,
    toggle: true,
    cancelDelay: 0.5,
    cooldownStart: 'cancelOrNaturalEnd',
  },
  unibeam: {
    damage: 55,
    chargeTime: 0.30,
    range: 60.0,
    cooldown: 8.0,
    collideWithWorld: true,
    toggle: false,
    cancelDelay: 0.5,
    cooldownStart: 'activation',
  },
  spinningLasers: {
    damage: 18,
    radius: 5.0,
    duration: 1.5,
    cooldown: 12.0,
    collideWithWorld: true,
    toggle: true,
    cancelDelay: 0.5,
    cooldownStart: 'cancelOrNaturalEnd',
  },
};

const IRONMAN_CONFIG_STORAGE_KEY = 'stickman_ironman_config_v2';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function mergeIronManConfig(
  target: IronManAbilitySettings,
  partial: Partial<IronManAbilitySettings> | Record<string, unknown>
): IronManAbilitySettings {
  const source = partial as Record<string, unknown>;
  for (const [sectionKey, sectionValue] of Object.entries(source)) {
    if (!(sectionKey in target) || !isPlainObject(sectionValue)) continue;
    const targetSection = (target as unknown as Record<string, Record<string, unknown>>)[sectionKey];
    for (const [key, value] of Object.entries(sectionValue)) {
      if (!(key in targetSection)) continue;
      if (typeof targetSection[key] === 'number') {
        if (typeof value === 'number' && Number.isFinite(value)) {
          targetSection[key] = value;
        }
      } else if (typeof targetSection[key] === typeof value) {
        targetSection[key] = value;
      }
    }
  }
  return target;
}

function loadPersistedConfig(): Partial<IronManAbilitySettings> {
  try {
    const raw = localStorage.getItem(IRONMAN_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? (parsed as Partial<IronManAbilitySettings>) : {};
  } catch {
    return {};
  }
}

// Stable object identity (never reassigned).
export const activeIronManConfig: IronManAbilitySettings = mergeIronManConfig(
  structuredClone(DEFAULT_IRONMAN_CONFIG),
  loadPersistedConfig()
);

export function updateIronManConfig(partial: Partial<IronManAbilitySettings>): void {
  mergeIronManConfig(activeIronManConfig, partial);
  try {
    localStorage.setItem(IRONMAN_CONFIG_STORAGE_KEY, JSON.stringify(activeIronManConfig));
  } catch {
    // Storage may be unavailable; runtime values are still updated.
  }
}

export function resetIronManConfig(): void {
  mergeIronManConfig(activeIronManConfig, structuredClone(DEFAULT_IRONMAN_CONFIG));
  try {
    localStorage.removeItem(IRONMAN_CONFIG_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
