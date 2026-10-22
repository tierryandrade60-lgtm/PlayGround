/**
 * GameplayRestrictions.ts
 * Centralized, typed gameplay restriction and status system.
 * Standardized identifiers genuinely enforced by the game loop and combat systems.
 */

export type RestrictionType =
  | 'NoPowers'
  | 'NoMovement'
  | 'NoFlight'
  | 'NoBasicAttack'
  | 'IsShield'
  | 'Anchored'
  | 'Invulnerable'
  | 'Stunned'
  | 'Silenced';

export interface ActiveRestriction {
  type: RestrictionType;
  source: string;
  duration?: number;
  timeRemaining?: number;
  appliedAt: number;
  metadata?: Record<string, unknown>;
}

export type RestrictionListener = (restrictions: ActiveRestriction[]) => void;

export class GameplayRestrictionsManager {
  private activeRestrictions: Map<string, ActiveRestriction> = new Map();
  private listeners: Set<RestrictionListener> = new Set();

  private makeKey(type: RestrictionType, source: string): string {
    return `${type}::${source}`;
  }

  /**
   * Apply a gameplay restriction.
   * If a duration is specified, the restriction automatically expires after duration seconds.
   */
  public applyRestriction(
    type: RestrictionType,
    source: string,
    duration?: number,
    metadata?: Record<string, unknown>
  ): void {
    const key = this.makeKey(type, source);
    const restriction: ActiveRestriction = {
      type,
      source,
      duration,
      timeRemaining: duration !== undefined ? duration : undefined,
      appliedAt: performance.now(),
      metadata,
    };
    this.activeRestrictions.set(key, restriction);
    this.notify();
  }

  /**
   * Remove a specific restriction owned by a particular source.
   * Prevents one ability from clearing restrictions applied by another system!
   */
  public removeRestriction(type: RestrictionType, source: string): boolean {
    const key = this.makeKey(type, source);
    const existed = this.activeRestrictions.delete(key);
    if (existed) {
      this.notify();
    }
    return existed;
  }

  /**
   * Cleans up all restrictions that were applied by a specific source.
   * Useful when an ability is canceled or finishes its execution.
   */
  public clearRestrictionsBySource(source: string): number {
    let count = 0;
    for (const [key, restriction] of Array.from(this.activeRestrictions.entries())) {
      if (restriction.source === source) {
        this.activeRestrictions.delete(key);
        count++;
      }
    }
    if (count > 0) {
      this.notify();
    }
    return count;
  }

  /**
   * Check if any system has currently enforced this restriction type.
   */
  public hasRestriction(type: RestrictionType): boolean {
    for (const restriction of this.activeRestrictions.values()) {
      if (restriction.type === type) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a specific source has applied a given restriction.
   */
  public hasRestrictionFromSource(type: RestrictionType, source: string): boolean {
    return this.activeRestrictions.has(this.makeKey(type, source));
  }

  /**
   * Returns all active restrictions as an array for debugging, UI inspection, and telemetry.
   */
  public getActiveRestrictions(): ActiveRestriction[] {
    return Array.from(this.activeRestrictions.values());
  }

  /**
   * Clear all active restrictions (e.g., on player respawn or full game reset).
   */
  public clearAll(): void {
    if (this.activeRestrictions.size > 0) {
      this.activeRestrictions.clear();
      this.notify();
    }
  }

  /**
   * Frame-by-frame tick to decrement timed restrictions and automatically remove expired ones.
   */
  public update(dt: number): void {
    let changed = false;
    for (const [key, restriction] of Array.from(this.activeRestrictions.entries())) {
      if (restriction.timeRemaining !== undefined) {
        restriction.timeRemaining -= dt;
        if (restriction.timeRemaining <= 0) {
          this.activeRestrictions.delete(key);
          changed = true;
        }
      }
    }
    if (changed) {
      this.notify();
    }
  }

  /**
   * Subscribe to restriction state changes.
   */
  public subscribe(listener: RestrictionListener): () => void {
    this.listeners.add(listener);
    listener(this.getActiveRestrictions());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const list = this.getActiveRestrictions();
    this.listeners.forEach((fn) => {
      try {
        fn(list);
      } catch (err) {
        console.error('Error in restriction listener:', err);
      }
    });
  }
}

export const gameplayRestrictions = new GameplayRestrictionsManager();
