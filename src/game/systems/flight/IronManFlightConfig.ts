/**
 * IronManFlightConfig.ts
 * Iron Man uses hand and foot thrusters with a slightly wider banking arc.
 */

import type { CharacterFlightProfile } from './AgathaFlightConfig';

export const IRONMAN_FLIGHT_PROFILE: CharacterFlightProfile = {
  id: 'ironman',
  label: 'Voo com Propulsores do Homem de Ferro',
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
  trailColor: 0x00f0ff,
};
