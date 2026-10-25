/**
 * VisionConfig.ts
 * Tunable parameters for Vision's solar and Mind Stone powers.
 */

export type VisionAbilityToggleMode = 'activation' | 'cancelOrNaturalEnd';

export interface VisionAbilitySettings {
  solarBlast: {
    damage: number;
    speed: number;
    maxRange: number;
    cooldown: number;
    coreColor: number;
    glowColor: number;
    radius: number;
    collideWithWorld: boolean;
  };
  mindBeam: {
    dps: number;
    maxDuration: number;
    range: number;
    cooldown: number;
    width: number;
    coreColor: number;
    innerColor: number;
    outerColor: number;
    collideWithWorld: boolean;
    toggle: boolean;
    cancelDelay: number;
    cooldownStart: VisionAbilityToggleMode;
  };
  phasing: {
    duration: number;
    cooldown: number;
    opacity: number;
    tintColor: number;
    glowColor: number;
    toggle: boolean;
    cancelDelay: number;
    cooldownStart: VisionAbilityToggleMode;
  };
  headGrab: {
    range: number;
    breakRange: number;
    duration: number;
    cooldown: number;
    damage: number;
    damageTicks: number;
    standDistance: number;
    approachTime: number;
    requireLineOfSight: boolean;
    breakOnTargetDeath: boolean;
    breakOnPlayerRestriction: boolean;
    lockPlayer: boolean;
    grabColor: number;
    grabCoreColor: number;
  };
  craterBlast: {
    range: number;
    damage: number;
    radius: number;
    cooldown: number;
    projectileSpeed: number;
    craterDuration: number;
    formationTime: number;
    dissipationTime: number;
    maxActiveCraters: number;
    coreColor: number;
    glowColor: number;
    scorchColor: number;
    rimColor: number;
    requireLineOfSight: boolean;
  };
  flight: {
    hoverHeight: number;
    bankLimit: number;
    trailColor: number;
    auraColor: number;
  };
}

export const DEFAULT_VISION_CONFIG: VisionAbilitySettings = {
  solarBlast: {
    damage: 11,
    speed: 36,
    maxRange: 38,
    cooldown: 0.22,
    coreColor: 0xfff8d0,
    glowColor: 0xffd54a,
    radius: 0.075,
    collideWithWorld: true,
  },
  mindBeam: {
    dps: 52,
    maxDuration: 4.0,
    range: 26,
    cooldown: 9.0,
    width: 0.34,
    coreColor: 0xfff9c4,
    innerColor: 0xffd54a,
    outerColor: 0xff9f1c,
    collideWithWorld: true,
    toggle: true,
    cancelDelay: 0.45,
    cooldownStart: 'cancelOrNaturalEnd',
  },
  phasing: {
    duration: 6.0,
    cooldown: 10.0,
    opacity: 0.3,
    tintColor: 0xffd54a,
    glowColor: 0xffc107,
    toggle: true,
    cancelDelay: 0.35,
    cooldownStart: 'cancelOrNaturalEnd',
  },
  headGrab: {
    range: 3.2,
    breakRange: 4.6,
    duration: 2.8,
    cooldown: 12.0,
    damage: 32,
    damageTicks: 4,
    standDistance: 0.82,
    approachTime: 0.18,
    requireLineOfSight: true,
    breakOnTargetDeath: true,
    breakOnPlayerRestriction: true,
    lockPlayer: true,
    grabColor: 0xffd54a,
    grabCoreColor: 0xfff6c2,
  },
  craterBlast: {
    range: 28,
    damage: 72,
    radius: 4.2,
    cooldown: 11.0,
    projectileSpeed: 42,
    craterDuration: 6.0,
    formationTime: 0.42,
    dissipationTime: 1.15,
    maxActiveCraters: 2,
    coreColor: 0xfff6c2,
    glowColor: 0xffd54a,
    scorchColor: 0x241a06,
    rimColor: 0xb27a08,
    requireLineOfSight: true,
  },
  flight: {
    hoverHeight: 3.6,
    bankLimit: 0.5,
    trailColor: 0xffd54a,
    auraColor: 0xffe082,
  },
};

const VISION_CONFIG_STORAGE_KEY = 'stickman_vision_config_v1';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function mergeVisionConfig(
  target: VisionAbilitySettings,
  partial: Partial<VisionAbilitySettings> | Record<string, unknown>
): VisionAbilitySettings {
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

function loadPersistedConfig(): Partial<VisionAbilitySettings> {
  try {
    const raw = localStorage.getItem(VISION_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? (parsed as Partial<VisionAbilitySettings>) : {};
  } catch {
    return {};
  }
}

export const activeVisionConfig: VisionAbilitySettings = mergeVisionConfig(
  structuredClone(DEFAULT_VISION_CONFIG),
  loadPersistedConfig()
);

export function updateVisionConfig(partial: Partial<VisionAbilitySettings>): void {
  mergeVisionConfig(activeVisionConfig, partial);
  try {
    localStorage.setItem(VISION_CONFIG_STORAGE_KEY, JSON.stringify(activeVisionConfig));
  } catch {
    // Storage may be unavailable; runtime values are still updated.
  }
}

export function resetVisionConfig(): void {
  mergeVisionConfig(activeVisionConfig, structuredClone(DEFAULT_VISION_CONFIG));
  try {
    localStorage.removeItem(VISION_CONFIG_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
