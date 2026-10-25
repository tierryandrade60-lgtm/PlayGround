const STORAGE_KEY = 'oi.muted'

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export class Sound {
  constructor() {
    this.muted = readMuted()
    this.ctx = null
    this.master = null
    this.ambientGain = null
    this.chargeVoice = null
    this.noiseBuffer = null
  }

  get ready() {
    return Boolean(this.ctx) && this.ctx.state === 'running'
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {})
      return
    }
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return
    try {
      this.ctx = new Ctor()
      const compressor = this.ctx.createDynamicsCompressor()
      compressor.threshold.value = -18
      compressor.knee.value = 22
      compressor.ratio.value = 6
      compressor.attack.value = 0.004
      compressor.release.value = 0.22
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.85
      this.master.connect(compressor)
      compressor.connect(this.ctx.destination)
      this.noiseBuffer = this.makeNoise(2)
      this.startAmbience()
    } catch {
      this.ctx = null
    }
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate
    const buffer = this.ctx.createBuffer(1, rate * seconds, rate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1
      last = last * 0.965 + white * 0.035
      data[i] = last * 3.2
    }
    return buffer
  }

  startAmbience() {
    if (!this.ctx || this.ambientGain) return
    const source = this.ctx.createBufferSource()
    source.buffer = this.noiseBuffer
    source.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 0.4
    const gain = this.ctx.createGain()
    gain.gain.value = 0.0001
    gain.gain.exponentialRampToValueAtTime(0.05, this.ctx.currentTime + 2.4)
    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    source.start()
    this.ambientGain = gain
  }

  setMuted(muted) {
    this.muted = Boolean(muted)
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0')
    } catch {
      /* storage is optional */
    }
    if (!this.ctx) return
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now)
    this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.85, now + 0.18)
    if (this.muted) this.stopCharge()
  }

  toggle() {
    this.setMuted(!this.muted)
    if (!this.muted) this.unlock()
    return this.muted
  }

  tone({ freq = 440, endFreq = freq, type = 'sine', dur = 0.2, gain = 0.1, attack = 0.008, delay = 0, detune = 0 }) {
    if (!this.ready || this.muted) return
    const ctx = this.ctx
    const start = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(20, freq), start)
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + dur)
    osc.detune.value = detune
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur)
    osc.connect(env)
    env.connect(this.master)
    osc.start(start)
    osc.stop(start + dur + 0.03)
  }

  whoosh({ dur = 0.32, gain = 0.16, from = 900, to = 240 } = {}) {
    if (!this.ready || this.muted) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = this.noiseBuffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 0.9
    filter.frequency.setValueAtTime(from, now)
    filter.frequency.exponentialRampToValueAtTime(to, now + dur)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, now)
    env.gain.exponentialRampToValueAtTime(gain, now + dur * 0.25)
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    source.connect(filter)
    filter.connect(env)
    env.connect(this.master)
    source.start(now)
    source.stop(now + dur + 0.02)
  }

  startCharge() {
    if (!this.ready || this.muted || this.chargeVoice) return
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const env = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    osc.type = 'triangle'
    osc2.type = 'sine'
    osc.frequency.value = 150
    osc2.frequency.value = 226
    filter.type = 'lowpass'
    filter.frequency.value = 900
    env.gain.setValueAtTime(0.0001, ctx.currentTime)
    env.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.12)
    osc.connect(filter)
    osc2.connect(filter)
    filter.connect(env)
    env.connect(this.master)
    osc.start()
    osc2.start()
    this.chargeVoice = { osc, osc2, env, filter }
  }

  updateCharge(value) {
    if (!this.chargeVoice || !this.ctx) return
    const { osc, osc2, filter } = this.chargeVoice
    const now = this.ctx.currentTime
    const freq = 150 + value * 280
    const overtone = 226 + value * 420
    osc.frequency.setTargetAtTime(freq, now, 0.045)
    osc2.frequency.setTargetAtTime(overtone, now, 0.045)
    filter.frequency.setTargetAtTime(700 + value * 2200, now, 0.05)
  }

  stopCharge() {
    if (!this.chargeVoice || !this.ctx) {
      this.chargeVoice = null
      return
    }
    const { osc, osc2, env } = this.chargeVoice
    const now = this.ctx.currentTime
    env.gain.cancelScheduledValues(now)
    env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), now)
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    try {
      osc.stop(now + 0.12)
      osc2.stop(now + 0.12)
    } catch {
      /* already stopped */
    }
    this.chargeVoice = null
  }

  play(name, variation = 0) {
    if (!this.ready || this.muted) return
    switch (name) {
      case 'jump':
        this.tone({ freq: 320, endFreq: 620 + variation * 90, type: 'triangle', dur: 0.18, gain: 0.07 })
        this.whoosh({ dur: 0.34, gain: 0.11, from: 1300, to: 320 })
        break
      case 'land':
        this.tone({ freq: 130, endFreq: 62, type: 'sine', dur: 0.22, gain: 0.22 })
        this.tone({ freq: 330, endFreq: 290, type: 'triangle', dur: 0.16, gain: 0.05 })
        this.whoosh({ dur: 0.18, gain: 0.07, from: 500, to: 180 })
        break
      case 'perfect':
        this.tone({ freq: 784, type: 'triangle', dur: 0.26, gain: 0.08 })
        this.tone({ freq: 988, type: 'triangle', dur: 0.3, gain: 0.07, delay: 0.07 })
        this.tone({ freq: 1318, type: 'sine', dur: 0.42, gain: 0.06, delay: 0.15 })
        break
      case 'collect':
        this.tone({ freq: 1180 + variation * 70, endFreq: 1560 + variation * 80, type: 'sine', dur: 0.2, gain: 0.055 })
        this.tone({ freq: 1760, type: 'sine', dur: 0.24, gain: 0.025, delay: 0.03 })
        break
      case 'fail':
        this.tone({ freq: 340, endFreq: 110, type: 'triangle', dur: 0.5, gain: 0.12 })
        this.tone({ freq: 170, endFreq: 54, type: 'sine', dur: 0.7, gain: 0.09, delay: 0.08 })
        break
      case 'ui':
        this.tone({ freq: 620, endFreq: 820, type: 'sine', dur: 0.1, gain: 0.05 })
        break
      default:
        break
    }
  }

  startGame() {
    this.unlock()
    this.play('ui')
    this.tone({ freq: 392, type: 'triangle', dur: 0.18, gain: 0.05 })
    this.tone({ freq: 523, type: 'triangle', dur: 0.24, gain: 0.05, delay: 0.1 })
    this.tone({ freq: 659, type: 'triangle', dur: 0.32, gain: 0.05, delay: 0.2 })
  }

  stopAll() {
    this.stopCharge()
  }
}
