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
    chargeTime: number;
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
  phasingDash: {
    distance: number;
    duration: number;
    cooldown: number;
    minSpeed: number;
    maxSpeed: number;
    arenaLimit: number;
    streakColor: number;
    streakCount: number;
  };
  headGrip: {
    range: number;
    duration: number;
    cooldown: number;
    forwardOffset: number;
    facingAngle: number;
    targetLift: number;
    targetProtection: boolean;
    playerProtection: boolean;
    toggle: boolean;
    cancelDelay: number;
    cooldownStart: VisionAbilityToggleMode;
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
    chargeTime: 0.12,
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
  phasingDash: {
    distance: 9.0,
    duration: 0.36,
    cooldown: 4.0,
    minSpeed: 16.0,
    maxSpeed: 34.0,
    arenaLimit: 380.0,
    streakColor: 0xffe066,
    streakCount: 14,
  },
  headGrip: {
    range: 3.4,
    duration: 2.4,
    cooldown: 9.0,
    forwardOffset: 1.35,
    facingAngle: 55,
    targetLift: 0.0,
    targetProtection: true,
    playerProtection: true,
    toggle: true,
    cancelDelay: 0.45,
    cooldownStart: 'cancelOrNaturalEnd',
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
