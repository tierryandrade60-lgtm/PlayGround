/**
 * SoundSystem.ts
 * Semantic facade for the project's single Web Audio implementation.
 * Keeps the existing AudioSystem API as the source of truth.
 */

import { audioSystem } from '../AudioSystem';

export const soundSystem = audioSystem;
export type SoundSystem = typeof audioSystem;

export { audioSystem };
