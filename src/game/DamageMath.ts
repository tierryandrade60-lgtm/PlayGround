/**
 * DamageMath.ts
 * Shared one-decimal damage rounding used by every combat path.
 */

export const DAMAGE_DECIMALS = 1;

export function roundDamage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** DAMAGE_DECIMALS;
  return Math.max(0, Math.round(value * scale) / scale);
}

export function formatDamage(value: number): string {
  const rounded = roundDamage(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(DAMAGE_DECIMALS);
}
