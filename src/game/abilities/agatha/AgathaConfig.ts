/**
 * AgathaConfig.ts
 * Tunable parameters and typed configurations for Agatha Harkness abilities.
 */

export interface AgathaAbilitySettings {
  // Arcane Blast (Basic Attack)
  arcaneBlast: {
    damage: number;
    speed: number;
    maxRange: number;
    homingStrength: number;
    cooldown: number;
    coreColor: number;
    glowColor: number;
    ringColor: number;
    lightColor: number;
    shakeAmount: number;
  };

  // Dark Drain (Ability 1)
  darkDrain: {
    duration: number;
    dps: number;
    healRate: number;
    range: number;
    tickInterval: number;
    tendrilColor: number;
    coreColor: number;
  };

  // Chaos Orb (Ability 2)
  chaosOrb: {
    directDamage: number;
    splashDamage: number;
    splashRadius: number;
    speed: number;
    maxRange: number;
    homingStrength: number;
    cooldown: number;
    shakeAmount: number;
  };

  // Runic Ward (Ability 3 - Shield)
  runicWard: {
    duration: number;
    shieldHealth: number;
    knockbackRadius: number;
    knockbackForce: number;
    damageReduction: number;
    cooldown: number;
  };

  // Arcane Choke (Ability 4 - Binding)
  arcaneChoke: {
    duration: number;
    tickDamage: number;
    tickInterval: number;
    maxRange: number;
    liftHeight: number;
    cooldown: number;
  };

  // Shadow Step (Dash)
  shadowStep: {
    distance: number;
    cooldown: number;
    smokeCount: number;
  };
}

export const DEFAULT_AGATHA_CONFIG: AgathaAbilitySettings = {
  arcaneBlast: {
    damage: 38,
    speed: 46.0,
    maxRange: 50.0,
    homingStrength: 8.5,
    cooldown: 0.28,
    coreColor: 0xf5d0fe,
    glowColor: 0x9333ea,
    ringColor: 0x3b0764,
    lightColor: 0xa855f7,
    shakeAmount: 0.025,
  },
  darkDrain: {
    duration: 3.0,
    dps: 30.0,
    healRate: 20.0,
    range: 22.0,
    tickInterval: 0.2,
    tendrilColor: 0xa855f7,
    coreColor: 0x581c87,
  },
  chaosOrb: {
    directDamage: 85,
    splashDamage: 65,
    splashRadius: 7.5,
    speed: 22.0,
    maxRange: 45.0,
    homingStrength: 4.5,
    cooldown: 5.0,
    shakeAmount: 0.07,
  },
  runicWard: {
    duration: 5.5,
    shieldHealth: 160,
    knockbackRadius: 6.0,
    knockbackForce: 8.0,
    damageReduction: 0.65,
    cooldown: 8.0,
  },
  arcaneChoke: {
    duration: 3.0,
    tickDamage: 22,
    tickInterval: 0.3,
    maxRange: 26.0,
    liftHeight: 3.2,
    cooldown: 7.0,
  },
  shadowStep: {
    distance: 14.0,
    cooldown: 3.0,
    smokeCount: 24,
  },
};

const AGATHA_CONFIG_STORAGE_KEY = 'stickman_agatha_config_v2';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep-merges a partial configuration into a stable target object.
 * Keeping the same object identity is essential: compiled ability modules keep
 * a reference to this object and must observe later configuration updates.
 */
export function mergeAgathaConfig(
  target: AgathaAbilitySettings,
  partial: Partial<AgathaAbilitySettings> | Record<string, unknown>
): AgathaAbilitySettings {
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

function loadPersistedConfig(): Partial<AgathaAbilitySettings> {
  try {
    const raw = localStorage.getItem(AGATHA_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? (parsed as Partial<AgathaAbilitySettings>) : {};
  } catch {
    return {};
  }
}

// Stable object identity (never reassigned).
export const activeAgathaConfig: AgathaAbilitySettings = mergeAgathaConfig(
  structuredClone(DEFAULT_AGATHA_CONFIG),
  loadPersistedConfig()
);

export function updateAgathaConfig(partial: Partial<AgathaAbilitySettings>): void {
  mergeAgathaConfig(activeAgathaConfig, partial);
  try {
    localStorage.setItem(AGATHA_CONFIG_STORAGE_KEY, JSON.stringify(activeAgathaConfig));
  } catch {
    // Storage may be unavailable; runtime values are still updated.
  }
}

export function resetAgathaConfig(): void {
  mergeAgathaConfig(activeAgathaConfig, structuredClone(DEFAULT_AGATHA_CONFIG));
  try {
    localStorage.removeItem(AGATHA_CONFIG_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
