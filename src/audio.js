export class AudioEngine {
  constructor() {
    this.ctx = null
    this.ready = false
    this.muted = false
    this.lastStep = 0
    this.ambientNodes = []
    this.thunderTimer = 7
    this.intensity = 0
  }

  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.72
    this.comp = ctx.createDynamicsCompressor()
    this.comp.threshold.value = -18
    this.comp.knee.value = 18
    this.comp.ratio.value = 7
    this.comp.attack.value = 0.003
    this.comp.release.value = 0.22
    this.master.connect(this.comp)
    this.comp.connect(ctx.destination)

    this.reverb = ctx.createConvolver()
    this.reverb.buffer = this.makeImpulse(2.6, 2.4)
    this.reverbGain = ctx.createGain()
    this.reverbGain.gain.value = 0.3
    this.reverb.connect(this.reverbGain)
    this.reverbGain.connect(this.master)

    this.noise = this.makeNoise(2, false)
    this.brown = this.makeNoise(2, true)
    this.ready = true
    if (ctx.state === 'suspended') await ctx.resume()
  }

  makeNoise(seconds, brown) {
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2 } else d[i] = w
    }
    return buf
  }

  makeImpulse(seconds, decay) {
    const ctx = this.ctx
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
    }
    return buf
  }

  connect(node, reverb = 0.15, pan = 0) {
    if (!this.ready) return
    let out = node
    if (pan) {
      const p = this.ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      node.connect(p)
      out = p
    }
    out.connect(this.master)
    if (reverb > 0) {
      const g = this.ctx.createGain()
      g.gain.value = reverb
      out.connect(g)
      g.connect(this.reverb)
    }
  }

  noiseBurst({ duration = 0.12, gain = 0.5, freq = 1200, q = 0.7, type = 'lowpass', sweep = 0, pan = 0, reverb = 0.2, attack = 0.002 }) {
    if (!this.ready || this.muted) return
    const ctx = this.ctx, t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.playbackRate.value = 0.85 + Math.random() * 0.3
    const f = ctx.createBiquadFilter()
    f.type = type; f.frequency.setValueAtTime(freq, t)
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t + duration)
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    src.connect(f); f.connect(g)
    this.connect(g, reverb, pan)
    src.start(t, Math.random() * 1.5)
    src.stop(t + duration + 0.02)
  }

  tone({ freq = 440, endFreq = 0, duration = 0.2, gain = 0.2, type = 'sine', pan = 0, reverb = 0.1, attack = 0.003 }) {
    if (!this.ready || this.muted) return
    const ctx = this.ctx, t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    o.connect(g)
    this.connect(g, reverb, pan)
    o.start(t)
    o.stop(t + duration + 0.02)
  }

  startAmbient() {
    if (!this.ready || this.ambientNodes.length) return
    const ctx = this.ctx
    const wind = ctx.createBufferSource(); wind.buffer = this.brown; wind.loop = true
    const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380; wf.Q.value = 0.6
    const wg = ctx.createGain(); wg.gain.value = 0.11
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.06
    lfo.connect(lfoGain); lfoGain.connect(wg.gain)
    wind.connect(wf); wf.connect(wg); wg.connect(this.master)
    wind.start(); lfo.start()

    const rain = ctx.createBufferSource(); rain.buffer = this.noise; rain.loop = true
    const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2200
    const rg = ctx.createGain(); rg.gain.value = 0.028
    rain.connect(rf); rf.connect(rg); rg.connect(this.master)
    rain.start()

    const padGain = ctx.createGain(); padGain.gain.value = 0.028
    const padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 240; padFilter.Q.value = 1.2
    padGain.connect(padFilter); padFilter.connect(this.master)
    const oscs = []
    for (const [f, det] of [[55, 0], [82.4, 4], [110, -5], [164.8, 7]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det
      const g = ctx.createGain(); g.gain.value = 0.2
      o.connect(g); g.connect(padGain); o.start()
      oscs.push(o)
    }
    const padLfo = ctx.createOscillator(); padLfo.frequency.value = 0.04
    const padLfoGain = ctx.createGain(); padLfoGain.gain.value = 0.012
    padLfo.connect(padLfoGain); padLfoGain.connect(padGain.gain); padLfo.start()
    this.ambientNodes.push(wind, lfo, rain, padLfo, ...oscs)
  }

  stopAmbient() {
    for (const n of this.ambientNodes) { try { n.stop() } catch {} }
    this.ambientNodes.length = 0
  }

  gunshot() {
    const p = (Math.random() - 0.5) * 0.12
    this.noiseBurst({ duration: 0.09, gain: 0.62, freq: 3400, q: 0.55, type: 'lowpass', sweep: -3000, pan: p, reverb: 0.28, attack: 0.001 })
    this.noiseBurst({ duration: 0.24, gain: 0.18, freq: 900, q: 0.9, type: 'bandpass', sweep: -600, pan: p, reverb: 0.4 })
    this.tone({ freq: 105, endFreq: 44, duration: 0.13, gain: 0.34, type: 'triangle', pan: p, reverb: 0.12 })
    this.tone({ freq: 2100, endFreq: 900, duration: 0.035, gain: 0.05, type: 'square', pan: p, reverb: 0.05 })
  }

  enemyShot(pan = 0) {
    this.noiseBurst({ duration: 0.11, gain: 0.22, freq: 1500, q: 0.8, type: 'bandpass', sweep: -900, pan, reverb: 0.45 })
    this.tone({ freq: 180, endFreq: 60, duration: 0.16, gain: 0.13, type: 'sawtooth', pan, reverb: 0.3 })
  }

  reloadStart() {
    this.noiseBurst({ duration: 0.06, gain: 0.2, freq: 1600, q: 1.5, type: 'bandpass', reverb: 0.05 })
    this.tone({ freq: 420, endFreq: 180, duration: 0.08, gain: 0.06, type: 'square', reverb: 0.03 })
  }

  reloadEnd() {
    this.noiseBurst({ duration: 0.05, gain: 0.26, freq: 2400, q: 2, type: 'bandpass', reverb: 0.08 })
    this.tone({ freq: 740, endFreq: 320, duration: 0.07, gain: 0.07, type: 'square', reverb: 0.04 })
    setTimeout(() => {
      this.noiseBurst({ duration: 0.04, gain: 0.2, freq: 1300, q: 2, type: 'bandpass', reverb: 0.05 })
      this.tone({ freq: 240, endFreq: 130, duration: 0.06, gain: 0.05, type: 'square', reverb: 0.03 })
    }, 90)
  }

  empty() {
    this.noiseBurst({ duration: 0.03, gain: 0.18, freq: 2600, q: 3, type: 'bandpass', reverb: 0.02 })
    this.tone({ freq: 620, endFreq: 120, duration: 0.045, gain: 0.05, type: 'square', reverb: 0.01 })
  }

  hitmarker(head = false) {
    if (head) {
      this.tone({ freq: 1650, endFreq: 820, duration: 0.07, gain: 0.13, type: 'sine', reverb: 0.02 })
      this.tone({ freq: 2350, endFreq: 1200, duration: 0.05, gain: 0.06, type: 'triangle', reverb: 0.02 })
    } else {
      this.tone({ freq: 1150, endFreq: 700, duration: 0.05, gain: 0.09, type: 'sine', reverb: 0.02 })
    }
  }

  kill() {
    this.tone({ freq: 320, endFreq: 640, duration: 0.14, gain: 0.09, type: 'triangle', reverb: 0.15 })
    this.tone({ freq: 640, endFreq: 980, duration: 0.18, gain: 0.05, type: 'sine', reverb: 0.2 })
  }

  damage() {
    this.noiseBurst({ duration: 0.16, gain: 0.24, freq: 600, q: 0.8, type: 'lowpass', reverb: 0.15 })
    this.tone({ freq: 72, endFreq: 38, duration: 0.22, gain: 0.22, type: 'sine', reverb: 0.05 })
  }

  footstep(sprint = false) {
    const now = performance.now()
    if (now - this.lastStep < (sprint ? 240 : 340)) return
    this.lastStep = now
    this.noiseBurst({ duration: 0.055, gain: sprint ? 0.09 : 0.06, freq: 520, q: 0.7, type: 'lowpass', reverb: 0.2 })
    this.tone({ freq: 120, endFreq: 60, duration: 0.07, gain: 0.04, type: 'sine', reverb: 0.04 })
  }

  pickup() {
    this.tone({ freq: 620, endFreq: 980, duration: 0.12, gain: 0.1, type: 'sine', reverb: 0.15 })
    this.tone({ freq: 1240, endFreq: 1560, duration: 0.14, gain: 0.05, type: 'triangle', reverb: 0.2 })
  }

  waveHorn(boss = false) {
    this.tone({ freq: boss ? 48 : 62, endFreq: boss ? 34 : 48, duration: boss ? 1.1 : 0.8, gain: 0.24, type: 'sawtooth', reverb: 0.5 })
    this.tone({ freq: boss ? 72 : 93, endFreq: boss ? 51 : 70, duration: boss ? 1.0 : 0.7, gain: 0.12, type: 'triangle', reverb: 0.55 })
    this.noiseBurst({ duration: 0.9, gain: 0.1, freq: 260, q: 0.7, type: 'lowpass', sweep: -120, reverb: 0.6 })
  }

  explosion() {
    this.noiseBurst({ duration: 0.6, gain: 0.5, freq: 900, q: 0.5, type: 'lowpass', sweep: -800, reverb: 0.8 })
    this.tone({ freq: 90, endFreq: 26, duration: 0.55, gain: 0.4, type: 'sine', reverb: 0.4 })
  }

  death() {
    this.tone({ freq: 220, endFreq: 40, duration: 1.4, gain: 0.3, type: 'sawtooth', reverb: 0.7 })
    this.noiseBurst({ duration: 1.1, gain: 0.2, freq: 700, q: 0.6, type: 'lowpass', sweep: -600, reverb: 0.8 })
  }

  thunder() {
    const d = 1.6 + Math.random() * 1.6
    this.noiseBurst({ duration: d, gain: 0.13, freq: 260, q: 0.5, type: 'lowpass', sweep: -180, reverb: 0.9, attack: 0.12 })
  }

  update(dt, intensity = 0) {
    if (!this.ready) return
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 0.7)
    this.thunderTimer -= dt
    if (this.thunderTimer <= 0) {
      this.thunderTimer = 12 + Math.random() * 22
      this.thunder()
    }
    if (this.reverbGain) this.reverbGain.gain.value = 0.24 + this.intensity * 0.12
  }
}
