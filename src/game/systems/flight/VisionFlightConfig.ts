/**
 * VisionFlightConfig.ts
 * Vision flies on psionic energy with a subtle golden trail instead of heavy
 * mechanical jets.
 */

import type { CharacterFlightProfile } from './AgathaFlightConfig';

export const VISION_FLIGHT_PROFILE: CharacterFlightProfile = {
  id: 'vision',
  label: 'Voo Psiónico da Visão',
  hoverHeight: 3.6,
  hoverAmplitude: 0.1,
  hoverFrequency: 0.0042,
  altitudeDamping: 6.5,
  bankLimit: 0.5,
  bankDamping: 11.0,
  footThrusterScale: 0.55,
  handThrusterScale: 0.18,
  movingHandThrusterScale: 0.18,
  dashThrusterScale: 1.45,
  trailColor: 0xffd54a,
};
