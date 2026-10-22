/**
 * AgathaFlightConfig.ts
 * Agatha hovers on arcane energy instead of mechanical thrusters.
 */

export interface CharacterFlightProfile {
  id: 'agatha' | 'ironman' | 'classic';
  label: string;
  hoverHeight: number;
  hoverAmplitude: number;
  hoverFrequency: number;
  altitudeDamping: number;
  bankLimit: number;
  bankDamping: number;
  footThrusterScale: number;
  handThrusterScale: number;
  movingHandThrusterScale: number;
  dashThrusterScale: number;
  trailColor: number;
}

export const AGATHA_FLIGHT_PROFILE: CharacterFlightProfile = {
  id: 'agatha',
  label: 'Voo Arcano da Agatha',
  hoverHeight: 3.6,
  hoverAmplitude: 0.12,
  hoverFrequency: 0.0035,
  altitudeDamping: 6.0,
  bankLimit: 0.42,
  bankDamping: 12.0,
  footThrusterScale: 1,
  handThrusterScale: 0.6,
  movingHandThrusterScale: 0.6,
  dashThrusterScale: 2.2,
  trailColor: 0xa855f7,
};
