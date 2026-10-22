/**
 * CooldownSystem.ts
 * Deterministic cooldown bookkeeping shared by the combat HUD.
 */

export class CooldownSystem {
  private remainingMs = new Map<string, number>();
  private durationMs = new Map<string, number>();

  public start(key: string, seconds: number): void {
    const duration = Math.max(0, seconds) * 1000;
    this.durationMs.set(key, duration);
    this.remainingMs.set(key, duration);
  }

  public update(deltaSeconds: number): boolean {
    if (this.remainingMs.size === 0) return false;
    const deltaMs = Math.max(0, deltaSeconds) * 1000;
    let changed = false;

    for (const [key, remaining] of this.remainingMs) {
      if (remaining <= 0) continue;
      const next = Math.max(0, remaining - deltaMs);
      this.remainingMs.set(key, next);
      changed = true;
    }
    return changed;
  }

  public getRemaining(key: string): number {
    return (this.remainingMs.get(key) || 0) / 1000;
  }

  public getTotal(key: string): number {
    return (this.durationMs.get(key) || 0) / 1000;
  }

  public isReady(key: string): boolean {
    return this.getRemaining(key) <= 0;
  }

  public clear(key: string): void {
    this.remainingMs.delete(key);
    this.durationMs.delete(key);
  }

  public reset(): void {
    this.remainingMs.clear();
    this.durationMs.clear();
  }
}

export const cooldownSystem = new CooldownSystem();
