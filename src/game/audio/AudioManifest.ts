export interface AudioDefinition {
  file: string;
  gain: number;
  maxVoices: number;
  loop?: boolean;
}

export const AUDIO_MANIFEST = {
  attackCast: { file: 'shared/attack-cast.mp3', gain: 0.72, maxVoices: 3 },
  impact: { file: 'shared/impact.mp3', gain: 0.78, maxVoices: 4 },
  hit: { file: 'shared/hit.mp3', gain: 0.62, maxVoices: 5 },
  destroy: { file: 'shared/destroy.mp3', gain: 0.82, maxVoices: 2 },
  uiClick: { file: 'shared/ui-click.mp3', gain: 0.46, maxVoices: 2 },
  error: { file: 'shared/error.mp3', gain: 0.58, maxVoices: 2 },

  repulsor: { file: 'ironman/repulsor.mp3', gain: 0.72, maxVoices: 4 },
  missileLaunch: { file: 'ironman/missile-launch.mp3', gain: 0.82, maxVoices: 3 },
  explosion: { file: 'ironman/explosion.mp3', gain: 0.92, maxVoices: 2 },
  beamBurst: { file: 'ironman/beam-burst.mp3', gain: 0.84, maxVoices: 2 },
  beamClash: { file: 'ironman/beam-clash.mp3', gain: 0.86, maxVoices: 2 },
  laserSpin: { file: 'ironman/laser-spin-loop.wav', gain: 0.5, maxVoices: 1, loop: true },
  thrusterDash: { file: 'ironman/thruster-dash.mp3', gain: 0.78, maxVoices: 3 },
  flightStart: { file: 'ironman/flight-start.mp3', gain: 0.78, maxVoices: 1 },
  flightStop: { file: 'ironman/flight-stop.mp3', gain: 0.72, maxVoices: 1 },
  unibeamCharge: { file: 'ironman/unibeam-charge.mp3', gain: 0.78, maxVoices: 1 },
  unibeamFire: { file: 'ironman/unibeam-fire.mp3', gain: 0.9, maxVoices: 2 },
  unibeamSequence: { file: 'ironman/unibeam-sequence.mp3', gain: 0.9, maxVoices: 1 },
  beamLoop: { file: 'ironman/beam-loop.wav', gain: 0.38, maxVoices: 1, loop: true },

  arcaneBlast: { file: 'agatha/arcane-blast.mp3', gain: 0.82, maxVoices: 3 },
  darkDrainPulse: { file: 'agatha/dark-drain-pulse.mp3', gain: 0.76, maxVoices: 2 },
  shadowDepart: { file: 'agatha/shadow-depart.mp3', gain: 0.78, maxVoices: 2 },
  shadowArrive: { file: 'agatha/shadow-arrive.mp3', gain: 0.82, maxVoices: 2 },
  arcaneFlightStart: { file: 'agatha/arcane-flight-start.mp3', gain: 0.68, maxVoices: 1 },
  arcaneFlightStop: { file: 'agatha/arcane-flight-stop.mp3', gain: 0.62, maxVoices: 1 },
  arcaneChokeStart: { file: 'agatha/choke-start.mp3', gain: 0.8, maxVoices: 1 },
  arcaneChokeTick: { file: 'agatha/choke-tick.mp3', gain: 0.58, maxVoices: 2 },
  chaosOrbCast: { file: 'agatha/chaos-cast.mp3', gain: 0.8, maxVoices: 1 },
  chaosOrbImpact: { file: 'agatha/chaos-impact.mp3', gain: 0.92, maxVoices: 2 },
  runicWard: { file: 'agatha/runic-ward.mp3', gain: 0.72, maxVoices: 2 },
  arcaneFlightLoop: { file: 'agatha/arcane-flight-loop.wav', gain: 0.3, maxVoices: 1, loop: true },
  darkDrainLoop: { file: 'agatha/dark-drain-loop.wav', gain: 0.42, maxVoices: 1, loop: true },
  arcaneChokeLoop: { file: 'agatha/choke-loop.wav', gain: 0.34, maxVoices: 1, loop: true },
} as const satisfies Record<string, AudioDefinition>;

export type AudioKey = keyof typeof AUDIO_MANIFEST;
export type LoopAudioKey = {
  [K in AudioKey]: (typeof AUDIO_MANIFEST)[K] extends { loop: true } ? K : never;
}[AudioKey];

export const LOOP_AUDIO_KEYS: LoopAudioKey[] = [
  'laserSpin',
  'beamLoop',
  'arcaneFlightLoop',
  'darkDrainLoop',
  'arcaneChokeLoop',
];
