/**
 * IronManConfig.ts
 * Tunable parameters and typed configurations for Iron Man armor systems.
 */

export interface IronManAbilitySettings {
  repulsor: {
    damage: number;
    speed: number;
    maxRange: number;
    homingStrength: number;
    cooldown: number;
    beamColor: number;
    glowColor: number;
  };
  microMissiles: {
    volleyCount: number;
    damagePerMissile: number;
    speed: number;
    arcHeight: number;
    cooldown: number;
  };
  dualBeams: {
    dps: number;
    maxDuration: number;
    range: number;
    cooldown: number;
  };
  unibeam: {
    damage: number;
    chargeTime: number;
    range: number;
    cooldown: number;
  };
  spinningLasers: {
    damage: number;
    radius: number;
    duration: number;
    cooldown: number;
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
  },
  microMissiles: {
    volleyCount: 6,
    damagePerMissile: 12,
    speed: 28.0,
    arcHeight: 5.5,
    cooldown: 6.0,
  },
  dualBeams: {
    dps: 20.0,
    maxDuration: 4.0,
    range: 22.0,
    cooldown: 10.0,
  },
  unibeam: {
    damage: 55,
    chargeTime: 0.30,
    range: 60.0,
    cooldown: 8.0,
  },
  spinningLasers: {
    damage: 18,
    radius: 5.0,
    duration: 1.5,
    cooldown: 12.0,
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
