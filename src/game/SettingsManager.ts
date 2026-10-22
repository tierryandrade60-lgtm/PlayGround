export type GraphicsQuality = 'low' | 'medium' | 'high';
export type ReticleStyle = 'dot' | 'crosshair';
export type ReticlePosition = 'center';

export interface GameSettings {
  volume: number; // 0 to 100
  graphics: GraphicsQuality;
  aimAssist: boolean;
  reticleStyle: ReticleStyle;
  reticlePosition?: ReticlePosition;
  cameraSensitivity: number; // 0.5 to 2.0 (default 1.0)
  touchSensitivity: number; // 0.5 to 2.0 (default 1.0)
  uiOpacity: number; // 0.5 to 1.0 (default 1.0)
  cameraShake: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  volume: 75,
  graphics: 'high',
  aimAssist: true,
  reticleStyle: 'dot',
  reticlePosition: 'center',
  cameraSensitivity: 1.0,
  touchSensitivity: 1.0,
  uiOpacity: 1.0,
  cameraShake: true,
};

const SETTINGS_STORAGE_KEY = 'stickman_settings_v2';
const LEGACY_SETTINGS_KEY = 'stickman_settings';

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, n));
}

function normalise(raw: Partial<GameSettings> | null | undefined): GameSettings {
  const src = raw || {};
  return {
    volume: clamp(src.volume, 0, 100, DEFAULT_SETTINGS.volume),
    graphics: src.graphics === 'low' || src.graphics === 'medium' || src.graphics === 'high'
      ? src.graphics
      : DEFAULT_SETTINGS.graphics,
    aimAssist: typeof src.aimAssist === 'boolean' ? src.aimAssist : DEFAULT_SETTINGS.aimAssist,
    reticleStyle: src.reticleStyle === 'dot' || src.reticleStyle === 'crosshair'
      ? src.reticleStyle
      : DEFAULT_SETTINGS.reticleStyle,
    reticlePosition: 'center',
    cameraSensitivity: clamp(src.cameraSensitivity, 0.5, 2.0, DEFAULT_SETTINGS.cameraSensitivity),
    touchSensitivity: clamp(src.touchSensitivity, 0.5, 2.0, DEFAULT_SETTINGS.touchSensitivity),
    uiOpacity: clamp(src.uiOpacity, 0.5, 1.0, DEFAULT_SETTINGS.uiOpacity),
    cameraShake: typeof src.cameraShake === 'boolean' ? src.cameraShake : DEFAULT_SETTINGS.cameraShake,
  };
}

class SettingsManager {
  private settings: GameSettings;
  private listeners: Set<(settings: GameSettings) => void> = new Set();

  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        this.settings = normalise(JSON.parse(saved));
      } else {
        const legacy = sessionStorage.getItem(LEGACY_SETTINGS_KEY);
        if (legacy) {
          this.settings = normalise(JSON.parse(legacy));
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
        }
      }
    } catch {
      // Fallback to defaults
    }
  }

  public get(): GameSettings {
    return { ...this.settings };
  }

  public update(partial: Partial<GameSettings>): void {
    this.settings = normalise({ ...this.settings, ...partial });
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore
    }
    this.listeners.forEach((listener) => listener(this.settings));
  }

  public reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      // Ignore
    }
    this.listeners.forEach((listener) => listener(this.settings));
  }

  public subscribe(listener: (settings: GameSettings) => void): () => void {
    this.listeners.add(listener);
    listener(this.settings);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const settingsManager = new SettingsManager();
