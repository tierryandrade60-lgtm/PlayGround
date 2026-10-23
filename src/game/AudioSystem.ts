import { settingsManager } from './SettingsManager';
import {
  AUDIO_MANIFEST,
  LOOP_AUDIO_KEYS,
  type AudioDefinition,
  type AudioKey,
  type LoopAudioKey,
} from './audio/AudioManifest';

type ShadowStepPhase = 'depart' | 'arrive';

interface LoopHandle {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const ALL_AUDIO_KEYS = Object.keys(AUDIO_MANIFEST) as AudioKey[];

class AudioSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.75;
  private listenerPosition = { x: 0, y: 0, z: 0 };
  // Mutable manifest so an edited AudioManifest can be applied live.
  private manifest: Record<string, AudioDefinition> = { ...AUDIO_MANIFEST };
  private loopKeys: string[] = [...LOOP_AUDIO_KEYS];

  private buffers = new Map<string, AudioBuffer>();
  private pendingLoads = new Map<string, Promise<AudioBuffer | null>>();
  private failedLoads = new Set<string>();
  private voices = new Map<AudioKey, number>();
  private loops = new Map<LoopAudioKey, LoopHandle>();
  private loopVersions = new Map<LoopAudioKey, number>();

  constructor() {
    this.volume = settingsManager.get().volume / 100;
    settingsManager.subscribe((s) => {
      this.setVolume(s.volume / 100);
    });

    if (typeof window !== 'undefined') {
      const unlock = () => {
        void this.unlock();
      };

      window.addEventListener('pointerdown', unlock, {
        once: true,
        passive: true,
      });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('pagehide', () => {
        this.stopAllLoops();
      });
    }
  }

  private initCtx(): AudioContext | null {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(
          this.volume,
          this.ctx.currentTime
        );
        this.masterGain.connect(this.ctx.destination);
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public async unlock(): Promise<void> {
    const ctx = this.initCtx();
    if (ctx && ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // The browser can still reject audio until a later gesture.
      }
    }

    this.preload();
  }

  public preload(keys?: AudioKey[]): void {
    if (!this.ctx) return;

    for (const key of keys ?? (Object.keys(this.manifest) as AudioKey[])) {
      void this.load(key);
    }
  }

  /**
   * Installs an edited AudioManifest without recreating the Web Audio engine.
   * Cached buffers that point to a different file are dropped and preloaded
   * again so the change is audible immediately.
   */
  public applyAudioManifest(
    manifest: Record<string, AudioDefinition>,
    loopKeys?: string[]
  ): void {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Manifesto de áudio inválido.');
    }
    const entries = Object.entries(manifest);
    if (entries.length === 0) {
      throw new Error('O manifesto de áudio não possui nenhuma entrada.');
    }
    for (const [key, def] of entries) {
      if (!def || typeof def !== 'object' || typeof (def as AudioDefinition).file !== 'string') {
        throw new Error(`Entrada de áudio inválida: "${key}" não possui "file".`);
      }
    }

    const previousFiles = new Map<string, string>();
    for (const [key, def] of Object.entries(this.manifest)) {
      previousFiles.set(key, def.file);
    }

    for (const key of this.loopKeys) {
      this.stopLoop(key as LoopAudioKey, 0.05);
    }

    this.manifest = { ...manifest };
    this.loopKeys = Array.isArray(loopKeys)
      ? loopKeys.filter((key) => typeof key === 'string' && key in manifest)
      : Object.keys(manifest).filter((key) => this.loopKeys.includes(key));

    const changedKeys: AudioKey[] = [];
    for (const [key, def] of entries) {
      if (previousFiles.get(key) !== def.file) {
        this.buffers.delete(def.file);
        this.pendingLoads.delete(def.file);
        this.failedLoads.delete(def.file);
        changedKeys.push(key as AudioKey);
      }
    }
    if (this.ctx && changedKeys.length > 0) {
      this.preload(changedKeys);
    }
  }

  public getAudioManifest(): Record<string, AudioDefinition> {
    return { ...this.manifest };
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));

    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.volume,
        this.ctx.currentTime,
        0.025
      );
    }
  }

  public setListenerPosition(pos: { x: number; y: number; z: number }): void {
    this.listenerPosition = { x: pos.x, y: pos.y, z: pos.z };
  }

  private getDefinition(key: AudioKey): AudioDefinition {
    return this.manifest[key] ?? AUDIO_MANIFEST[key];
  }

  private getAudioUrl(definition: AudioDefinition): string {
    const base = import.meta.env.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}assets/audio/${definition.file}`;
  }

  private load(key: AudioKey): Promise<AudioBuffer | null> {
    const definition = this.getDefinition(key);
    const cacheKey = definition.file;

    const cached = this.buffers.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const pending = this.pendingLoads.get(cacheKey);
    if (pending) return pending;

    if (this.failedLoads.has(cacheKey)) {
      return Promise.resolve(null);
    }

    const ctx = this.initCtx();
    if (!ctx) return Promise.resolve(null);

    const promise = (async () => {
      try {
        const response = await fetch(
          this.getAudioUrl(definition)
        );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status} for ${definition.file}`
          );
        }

        const data = await response.arrayBuffer();
        const buffer = await ctx.decodeAudioData(data);
        this.buffers.set(cacheKey, buffer);
        return buffer;
      } catch (error) {
        if (!this.failedLoads.has(cacheKey)) {
          this.failedLoads.add(cacheKey);
          console.warn(
            `[AudioSystem] Failed to load ${definition.file}:`,
            error
          );
        }
        return null;
      } finally {
        this.pendingLoads.delete(cacheKey);
      }
    })();

    this.pendingLoads.set(cacheKey, promise);
    return promise;
  }

  private releaseVoice(key: AudioKey): void {
    const count = this.voices.get(key) ?? 0;
    if (count <= 1) {
      this.voices.delete(key);
    } else {
      this.voices.set(key, count - 1);
    }
  }

  private playOneShot(key: AudioKey, origin?: { x: number; y: number; z: number }): void {
    if (this.volume <= 0) return;

    const definition = this.getDefinition(key);
    const activeVoices = this.voices.get(key) ?? 0;
    if (activeVoices >= definition.maxVoices) return;

    const ctx = this.initCtx();
    if (!ctx || !this.masterGain) return;

    this.voices.set(key, activeVoices + 1);

    void this.load(key).then((buffer) => {
      if (!buffer || this.volume <= 0) {
        this.releaseVoice(key);
        return;
      }

      try {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();

        source.buffer = buffer;
        const distance = origin
          ? Math.hypot(
              origin.x - this.listenerPosition.x,
              origin.y - this.listenerPosition.y,
              origin.z - this.listenerPosition.z
            )
          : 0;
        const attenuation = origin && key !== 'hit' ? 1 / (1 + distance / 12) : 1;
        gain.gain.setValueAtTime(
          definition.gain * attenuation,
          ctx.currentTime
        );

        source.connect(gain);
        gain.connect(this.masterGain!);

        source.onended = () => {
          source.disconnect();
          gain.disconnect();
          this.releaseVoice(key);
        };

        source.start();
      } catch {
        this.releaseVoice(key);
      }
    });
  }

  private startLoop(key: LoopAudioKey): void {
    const definition = this.getDefinition(key);
    if (!definition.loop || this.loops.has(key)) return;

    const ctx = this.initCtx();
    if (!ctx || !this.masterGain) return;

    const version = (this.loopVersions.get(key) ?? 0) + 1;
    this.loopVersions.set(key, version);

    void this.load(key).then((buffer) => {
      if (
        !buffer ||
        this.loopVersions.get(key) !== version ||
        this.loops.has(key)
      ) {
        return;
      }

      try {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const now = ctx.currentTime;

        source.buffer = buffer;
        source.loop = true;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(
          definition.gain,
          now + 0.16
        );

        source.connect(gain);
        gain.connect(this.masterGain!);

        source.onended = () => {
          source.disconnect();
          gain.disconnect();
        };

        source.start(now);
        this.loops.set(key, { source, gain });
      } catch {
        this.loops.delete(key);
      }
    });
  }

  private stopLoop(key: LoopAudioKey, fade = 0.18): void {
    this.loopVersions.set(
      key,
      (this.loopVersions.get(key) ?? 0) + 1
    );

    const handle = this.loops.get(key);
    if (!handle || !this.ctx) return;

    this.loops.delete(key);
    const now = this.ctx.currentTime;

    try {
      handle.gain.gain.cancelScheduledValues(now);
      handle.gain.gain.setValueAtTime(
        handle.gain.gain.value,
        now
      );
      handle.gain.gain.linearRampToValueAtTime(0, now + fade);
      handle.source.stop(now + fade + 0.03);
    } catch {
      // The source may have ended while the loop was stopping.
    }
  }

  public stopAllLoops(): void {
    for (const key of [...this.loops.keys()]) {
      this.stopLoop(key, 0.1);
    }

    for (const key of this.loopKeys) {
      this.loopVersions.set(
        key as LoopAudioKey,
        (this.loopVersions.get(key as LoopAudioKey) ?? 0) + 1
      );
    }
  }

  public dispose(): void {
    this.stopAllLoops();
    this.buffers.clear();
    this.pendingLoads.clear();
    this.failedLoads.clear();
    this.voices.clear();

    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
    }
  }

  public playAttackCast(): void {
    this.playOneShot('attackCast');
  }

  public playImpact(origin?: { x: number; y: number; z: number }): void {
    this.playOneShot('impact', origin);
  }

  public playHit(): void {
    this.playOneShot('hit');
  }

  public playDestroy(): void {
    this.playOneShot('destroy');
  }

  public playUiClick(): void {
    this.playOneShot('uiClick');
  }

  public playError(): void {
    this.playOneShot('error');
  }

  public playRepulsor(): void {
    this.playOneShot('repulsor');
  }

  public playMissileLaunch(): void {
    this.playOneShot('missileLaunch');
  }

  public playExplosion(origin?: { x: number; y: number; z: number }): void {
    this.playOneShot('explosion', origin);
  }

  public playBeamBurst(): void {
    this.playOneShot('beamBurst');
  }

  public playBeamClash(): void {
    this.playOneShot('beamClash');
  }

  public playLaserSpin(): void {
    this.startLoop('laserSpin');
  }

  public stopLaserSpin(): void {
    this.stopLoop('laserSpin');
  }

  public startBeamLoop(): void {
    this.startLoop('beamLoop');
  }

  public stopBeamLoop(): void {
    this.stopLoop('beamLoop');
  }

  public playThrusterDash(): void {
    this.playOneShot('thrusterDash');
  }

  public playFlightToggle(isFlying: boolean): void {
    this.playOneShot(isFlying ? 'flightStart' : 'flightStop');
  }

  public playUnibeamCharge(): void {
    this.playOneShot('unibeamCharge');
  }

  public playUnibeamFire(): void {
    this.playOneShot('unibeamFire');
  }

  public playUnibeamSequence(): void {
    this.playOneShot('unibeamSequence');
  }

  public playArcaneBlast(): void {
    this.playOneShot('arcaneBlast');
  }

  public playDarkDrainPulse(): void {
    this.playOneShot('darkDrainPulse');
  }

  public startDarkDrainLoop(): void {
    this.startLoop('darkDrainLoop');
  }

  public stopDarkDrainLoop(): void {
    this.stopLoop('darkDrainLoop');
  }

  public playShadowStep(phase: ShadowStepPhase = 'depart'): void {
    this.playOneShot(
      phase === 'arrive' ? 'shadowArrive' : 'shadowDepart'
    );
  }

  public playArcaneFlight(isFlying: boolean): void {
    if (isFlying) {
      this.startLoop('arcaneFlightLoop');
      this.playOneShot('arcaneFlightStart');
    } else {
      this.playOneShot('arcaneFlightStop');
      this.stopLoop('arcaneFlightLoop');
    }
  }

  public playArcaneChokeStart(): void {
    this.playOneShot('arcaneChokeStart');
  }

  public playArcaneChokeTick(): void {
    this.playOneShot('arcaneChokeTick');
  }

  public startArcaneChokeLoop(): void {
    this.startLoop('arcaneChokeLoop');
  }

  public stopArcaneChokeLoop(): void {
    this.stopLoop('arcaneChokeLoop');
  }

  public playChaosOrbCast(): void {
    this.playOneShot('chaosOrbCast');
  }

  public playChaosOrbImpact(): void {
    this.playOneShot('chaosOrbImpact');
  }

  public playRunicWard(): void {
    this.playOneShot('runicWard');
  }
}

export const audioSystem = new AudioSystem();
