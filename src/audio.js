const clamp = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
const rand = (min, max) => min + Math.random() * (max - min);

export class AudioEngine {
  constructor() {
    this.ctx = null; this.master = null; this.compressor = null; this.reverb = null;
    this.reverbSend = null; this.noiseBuffer = null; this.music = null; this.ambience = null;
    this.volume = 0.8; this._muted = false;
  }

  get muted() { return this._muted; }

  async resume() {
    if (typeof window === 'undefined') return;
    if (this.ctx && this.ctx.state === 'closed') { this.ctx = null; this.master = null; this.music = null; this.ambience = null; }
    if (this.ctx) {
      if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch (error) {} }
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20; compressor.knee.value = 18; compressor.ratio.value = 8;
      compressor.attack.value = 0.004; compressor.release.value = 0.24;
      master.gain.value = this._muted ? 0 : this.volume * 0.9;
      master.connect(compressor); compressor.connect(ctx.destination);
      const reverb = ctx.createConvolver();
      reverb.buffer = this._makeImpulse(ctx, 2.2, 2.6);
      const reverbSend = ctx.createGain();
      const reverbGain = ctx.createGain();
      reverbGain.gain.value = 0.3;
      reverbSend.connect(reverb); reverb.connect(reverbGain); reverbGain.connect(master);
      Object.assign(this, { ctx, master, compressor, reverb, reverbSend, noiseBuffer: this._makeNoise(ctx, 2) });
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (error) {} }
    } catch (error) {
      this.ctx = null; this.master = null; this.compressor = null; this.reverb = null; this.reverbSend = null; this.noiseBuffer = null;
    }
  }

  suspend() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    try { const promise = this.ctx.suspend(); if (promise && promise.catch) promise.catch(() => {}); } catch (error) {}
  }

  setMuted(muted) {
    this._muted = Boolean(muted);
    if (this._ready()) this.master.gain.setTargetAtTime(this._muted ? 0 : this.volume * 0.9, this.ctx.currentTime, 0.02);
  }

  setMasterVolume(value) {
    this.volume = clamp(value, 0, 1);
    if (this._ready()) this.master.gain.setTargetAtTime(this._muted ? 0 : this.volume * 0.9, this.ctx.currentTime, 0.02);
  }

  update(dt) {
    if (!this._ready()) return;
    const step = clamp(dt, 0, 0.25);
    if (this.music && !this.music.stopping) {
      this.music.time += step;
      if (this.music.time >= this.music.nextPulse) { this._musicPulse(); this.music.nextPulse += 2.7; }
    }
    if (this.ambience) this.ambience.time += step;
  }

  startMusic() {
    if (!this._ready() || this.music) return;
    const c = this.ctx, now = c.currentTime, out = this._out(0, 0.35);
    const gain = c.createGain(), lowpass = c.createBiquadFilter();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 3);
    gain.connect(out.input);
    lowpass.type = 'lowpass'; lowpass.frequency.value = 240; lowpass.Q.value = 0.7; lowpass.connect(gain);
    const sources = [], nodes = [...out.nodes, gain, lowpass];
    const add = (type, frequency, level, detune = 0) => {
      const osc = c.createOscillator(), levelGain = c.createGain();
      osc.type = type; osc.frequency.value = frequency; osc.detune.value = detune; levelGain.gain.value = level;
      osc.connect(levelGain); levelGain.connect(lowpass); osc.start(now); sources.push(osc); nodes.push(osc, levelGain);
    };
    add('sawtooth', 55, 0.1, -5); add('sawtooth', 55, 0.08, 6); add('sine', 27.5, 0.22); add('triangle', 82.5, 0.035);
    const noise = this._noiseSource(0.8), filter = c.createBiquadFilter(), noiseGain = c.createGain();
    const lfo = c.createOscillator(), lfoGain = c.createGain();
    noise.loop = true; filter.type = 'bandpass'; filter.frequency.value = 500; filter.Q.value = 0.6; noiseGain.gain.value = 0.035;
    lfo.frequency.value = 0.05; lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start(now);
    noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(gain); noise.start(now);
    sources.push(noise, lfo); nodes.push(noise, filter, noiseGain, lfo, lfoGain);
    this.music = { gain, nodes, sources, time: 0, nextPulse: 1.2, stopping: false };
  }

  stopMusic() { if (this.music) { this._stop(this.music, 2.2); this.music = null; } }

  startAmbience() {
    if (!this._ready() || this.ambience) return;
    const c = this.ctx, now = c.currentTime, out = this._out(0, 0.2);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 3);
    gain.connect(out.input);
    const sources = [], nodes = [...out.nodes, gain];
    const rain = this._noiseSource(rand(0.96, 1.04)), rainHigh = c.createBiquadFilter(), rainLow = c.createBiquadFilter();
    const rainGain = c.createGain();
    rain.loop = true; rainHigh.type = 'highpass'; rainHigh.frequency.value = 650;
    rainLow.type = 'lowpass'; rainLow.frequency.value = 5200; rainGain.gain.value = 0.2;
    rain.connect(rainHigh); rainHigh.connect(rainLow); rainLow.connect(rainGain); rainGain.connect(gain); rain.start(now);
    const wind = this._noiseSource(0.72), windFilter = c.createBiquadFilter(), windGain = c.createGain();
    const lfo = c.createOscillator(), lfoGain = c.createGain();
    wind.loop = true; windFilter.type = 'lowpass'; windFilter.frequency.value = 300; windFilter.Q.value = 0.9; windGain.gain.value = 0.32;
    lfo.frequency.value = 0.07; lfoGain.gain.value = 160;
    lfo.connect(lfoGain); lfoGain.connect(windFilter.frequency);
    wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(gain); wind.start(now); lfo.start(now);
    sources.push(rain, wind, lfo); nodes.push(rain, rainHigh, rainLow, rainGain, wind, windFilter, windGain, lfo, lfoGain);
    this.ambience = { gain, nodes, sources, time: 0 };
  }

  stopAmbience() { if (this.ambience) { this._stop(this.ambience, 1.8); this.ambience = null; } }

  gunshot(kind = 'rifle') {
    if (!this._ready()) return;
    const presets = {
      rifle: { crack: 0.4, thump: 0.34, body: 0.26, tail: 0.075 },
      smg: { crack: 0.29, thump: 0.23, body: 0.2, tail: 0.055 },
      pistol: { crack: 0.33, thump: 0.21, body: 0.19, tail: 0.065 }
    };
    const config = presets[kind] || presets.rifle, pan = rand(-0.14, 0.14), pitch = rand(0.93, 1.07);
    this._burst(0.12, 0.17, config.crack, 'highpass', 1600 * pitch, 0.7, pan, 0.16, rand(0.9, 1.12));
    this._blip(125 * pitch, 0.24, config.thump, 'sine', pan, 0.08, 0, 48);
    this._burst(0, 0.3, config.body, 'lowpass', 280, 0.9, pan, 0.18, 0.65);
    this._burst(0.015, 0.34, config.tail, 'bandpass', 2400 * pitch, 5.5, pan, 0.28, 1.2);
  }

  enemyShot(distance = 20, pan = 0) {
    if (!this._ready()) return;
    const d = Math.max(0, Number.isFinite(distance) ? distance : 20);
    const attenuation = 1 / (1 + d * 0.09), cutoff = Math.max(150, 1400 - d * 45);
    this._burst(0, 0.23, 0.34 * attenuation, 'lowpass', cutoff, 1, pan, 0.24, rand(0.8, 1.1));
    this._blip(92, 0.4, 0.24 * attenuation, 'sine', pan, 0.2, 0, 42);
    this._burst(0.02, 0.26, 0.08 * attenuation, 'bandpass', 1200, 2.5, pan, 0.2);
  }

  dryFire() {
    if (!this._ready()) return;
    this._blip(2100, 0.025, 0.05, 'square', rand(-0.1, 0.1), 0.02, 0, 900);
    this._burst(0, 0.03, 0.06, 'highpass', 1800, 0.8, 0, 0.03);
  }

  reload() {
    if (!this._ready()) return;
    this._blip(310, 0.05, 0.075, 'square', -0.08, 0.02, 0.05, 180);
    this._burst(0.06, 0.05, 0.06, 'bandpass', 900, 1.2, -0.08, 0.03);
    this._burst(0.52, 0.08, 0.065, 'bandpass', 1700, 2.2, 0.1, 0.04);
    this._blip(170, 0.06, 0.1, 'triangle', 0.08, 0.03, 1.02, 90);
    this._burst(1.04, 0.05, 0.06, 'lowpass', 700, 0.9, 0.08, 0.03);
    this._blip(1150, 0.045, 0.08, 'square', -0.04, 0.03, 1.52, 520);
    this._burst(1.53, 0.08, 0.055, 'bandpass', 2200, 2, -0.04, 0.04);
    this._blip(760, 0.035, 0.06, 'square', -0.04, 0.03, 1.7, 420);
  }

  hitmarker(headshot = false) {
    if (!this._ready()) return;
    const base = headshot ? 1250 : 900;
    this._blip(base, 0.06, 0.11, 'square', 0, 0.02, 0, base * 0.8);
    this._blip(base * 1.35, 0.09, headshot ? 0.09 : 0.065, 'sine', 0, 0.04, 0.025, base);
    if (headshot) this._burst(0.02, 0.14, 0.035, 'highpass', 3200, 0.8, 0, 0.12);
  }

  kill() {
    if (!this._ready()) return;
    this._blip(660, 0.11, 0.085, 'triangle', 0, 0.18);
    this._blip(990, 0.16, 0.075, 'triangle', 0, 0.2, 0.07);
    this._blip(1320, 0.28, 0.065, 'triangle', 0, 0.24, 0.14, 1180);
    this._burst(0.05, 0.32, 0.035, 'highpass', 2600, 0.7, 0, 0.24);
  }

  hurt() {
    if (!this._ready()) return;
    this._blip(72, 0.42, 0.28, 'sine', 0, 0.04, 0, 38);
    this._burst(0, 0.2, 0.1, 'lowpass', 320, 0.9, 0, 0.08);
    this._blip(4400, 1.1, 0.024, 'sine', rand(-0.2, 0.2), 0.14, 0.02, 3900);
  }

  footstep(surface = 'concrete', intensity = 1) {
    if (!this._ready()) return;
    const presets = {
      concrete: ['lowpass', 620, 0.8, 0.13], metal: ['bandpass', 2100, 1.4, 0.08],
      wood: ['bandpass', 850, 1, 0.11], grass: ['lowpass', 1800, 0.4, 0.055],
      dirt: ['lowpass', 420, 0.7, 0.1], water: ['bandpass', 1200, 0.5, 0.1]
    };
    const config = presets[surface] || presets.concrete;
    this._burst(rand(0, 0.012), 0.09, config[3] * clamp(intensity, 0, 2), config[0], config[1] * rand(0.9, 1.1), config[2], rand(-0.06, 0.06), 0.02, rand(0.85, 1.15));
  }

  jump() {
    if (!this._ready()) return;
    this._burst(0, 0.12, 0.06, 'bandpass', 1400, 1, rand(-0.08, 0.08), 0.03, rand(0.9, 1.1));
    this._blip(145, 0.11, 0.04, 'sine', 0, 0.02, 0, 95);
  }

  land() {
    if (!this._ready()) return;
    this._burst(0, 0.14, 0.16, 'lowpass', 520, 0.8, 0, 0.2, 0.7);
    this._blip(88, 0.25, 0.17, 'sine', 0, 0.1, 0, 42);
  }

  explosion(distance = 10) {
    if (!this._ready()) return;
    const d = Math.max(0, Number.isFinite(distance) ? distance : 10);
    const attenuation = 1 / (1 + d * 0.065), cutoff = Math.max(120, 900 - d * 30);
    this._burst(0, 0.75, 0.6 * attenuation, 'lowpass', cutoff, 1.1, 0, 0.38, 0.55);
    this._blip(88, 0.85, 0.48 * attenuation, 'sine', 0, 0.3, 0, 26);
    this._burst(0.025, 0.48, 0.18 * attenuation, 'highpass', 950, 0.7, 0, 0.24);
  }

  uiClick() { this._blip(880, 0.05, 0.06, 'sine', 0, 0.02, 0, 620); }
  uiHover() { this._blip(1450, 0.03, 0.024, 'sine', 0, 0.01, 0, 1300); }

  waveStart() {
    if (!this._ready()) return;
    this._blip(110, 0.8, 0.12, 'sawtooth', 0, 0.28, 0, 220);
    this._blip(164, 0.9, 0.055, 'triangle', 0, 0.29, 0.06, 328);
    this._burst(0.02, 0.7, 0.035, 'bandpass', 700, 0.8, 0, 0.25, 0.8);
  }

  victory() {
    if (!this._ready()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._blip(f, 0.3, 0.08, 'triangle', 0, 0.22, i * 0.11, f * 0.995));
    this._blip(261.63, 0.8, 0.06, 'sine', 0, 0.28, 0.3, 261.63);
  }

  defeat() {
    if (!this._ready()) return;
    [220, 196, 164.81, 110].forEach((f, i) => this._blip(f, 0.42, 0.08, 'triangle', 0, 0.26, i * 0.22, f * 0.97));
    this._blip(55, 1.1, 0.1, 'sine', 0, 0.2, 0.68, 41);
  }

  shellDrop() { this._blip(rand(2400, 3200), 0.03, 0.018, 'triangle', rand(-0.2, 0.2), 0.03, 0, 1800); }

  bulletWhiz(pan = 0) {
    if (!this._ready()) return;
    const c = this.ctx, now = c.currentTime, out = this._out(pan, 0.08);
    const source = this._noiseSource(rand(0.95, 1.1)), filter = c.createBiquadFilter(), gain = c.createGain();
    filter.type = 'bandpass'; filter.Q.value = 3.2;
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(2800, now + 0.09);
    filter.frequency.exponentialRampToValueAtTime(650, now + 0.22);
    this._env(gain.gain, 0.11, 0.012, 0.2, now);
    source.connect(filter); filter.connect(gain); gain.connect(out.input);
    source.start(now); source.stop(now + 0.24);
    this._clean(source, [...out.nodes, source, filter, gain]);
  }

  _ready() { return Boolean(this.ctx && this.master && this.ctx.state !== 'closed'); }

  _makeNoise(ctx, seconds) {
    const length = Math.floor(ctx.sampleRate * seconds), buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _makeImpulse(ctx, seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds), buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    const attack = Math.max(1, Math.floor(ctx.sampleRate * 0.012));
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay) * (i < attack ? i / attack : 1);
    }
    return buffer;
  }

  _noiseSource(rate = 1) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer; source.playbackRate.value = rate;
    return source;
  }

  _pan(value) {
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = clamp(value, -1, 1);
    return panner;
  }

  _out(pan = 0, wet = 0) {
    const input = this.ctx.createGain(), nodes = [input];
    let tail = input;
    if (pan) { const panner = this._pan(pan); tail.connect(panner); tail = panner; nodes.push(panner); }
    tail.connect(this.master);
    if (wet > 0 && this.reverbSend) {
      const send = this.ctx.createGain();
      send.gain.value = wet; tail.connect(send); send.connect(this.reverbSend); nodes.push(send);
    }
    return { input, nodes };
  }

  _env(parameter, peak, attack, decay, at) {
    const start = Number.isFinite(at) ? at : this.ctx.currentTime;
    const rise = Math.max(0.001, attack), fall = Math.max(0.01, decay);
    parameter.cancelScheduledValues(start);
    parameter.setValueAtTime(0.0001, start);
    parameter.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + rise);
    parameter.exponentialRampToValueAtTime(0.0001, start + rise + fall);
  }

  _clean(source, nodes) {
    source.onended = () => {
      for (const node of nodes) { try { node.disconnect(); } catch (error) {} }
    };
  }

  _blip(frequency, duration, volume, type = 'sine', pan = 0, wet = 0, delay = 0, endFrequency) {
    if (!this._ready()) return;
    const c = this.ctx, now = c.currentTime + Math.max(0, delay), out = this._out(pan, wet);
    const osc = c.createOscillator(), gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, frequency), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency || frequency * 0.7), now + duration);
    this._env(gain.gain, volume, 0.003, duration, now);
    osc.connect(gain); gain.connect(out.input); osc.start(now); osc.stop(now + duration + 0.04);
    this._clean(osc, [...out.nodes, osc, gain]);
  }

  _burst(delay, duration, volume, type, frequency, q, pan = 0, wet = 0, rate = 1) {
    if (!this._ready()) return;
    const c = this.ctx, now = c.currentTime + Math.max(0, delay), out = this._out(pan, wet);
    const source = this._noiseSource(rate), filter = c.createBiquadFilter(), gain = c.createGain();
    filter.type = type; filter.frequency.value = Math.max(20, frequency); filter.Q.value = q;
    this._env(gain.gain, volume, 0.002, duration, now);
    source.connect(filter); filter.connect(gain); gain.connect(out.input);
    source.start(now); source.stop(now + duration + 0.03);
    this._clean(source, [...out.nodes, source, filter, gain]);
  }

  _musicPulse() {
    if (!this._ready() || !this.music) return;
    const c = this.ctx, now = c.currentTime, osc = c.createOscillator(), gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(50, now);
    osc.frequency.exponentialRampToValueAtTime(33, now + 0.55);
    this._env(gain.gain, 0.42, 0.01, 0.62, now);
    osc.connect(gain); gain.connect(this.music.gain); osc.start(now); osc.stop(now + 0.7);
    this._clean(osc, [osc, gain]);
  }

  _stop(group, time) {
    if (!group || !this._ready()) return;
    const now = this.ctx.currentTime, level = group.gain.gain;
    level.cancelScheduledValues(now);
    level.setValueAtTime(Math.max(0.0001, level.value), now);
    level.exponentialRampToValueAtTime(0.0001, now + time);
    for (const source of group.sources) { try { source.stop(now + time + 0.1); } catch (error) {} }
    const last = group.sources[group.sources.length - 1];
    if (last) last.onended = () => { for (const node of group.nodes) { try { node.disconnect(); } catch (error) {} } };
  }
}
