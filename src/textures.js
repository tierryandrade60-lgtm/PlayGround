import * as THREE from 'three'

let ANISOTROPY = 4
export function setTextureAnisotropy(value) { ANISOTROPY = Math.max(1, value) }

function canvas(size) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

function rand(seed) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smooth(t) { return t * t * (3 - 2 * t) }

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = smooth(x - xi), yf = smooth(y - yi)
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed)
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf
}

export function fbm(x, y, seed = 1, oct = 5, gain = 0.5, lac = 2) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 71)
    norm += amp
    amp *= gain; freq *= lac
  }
  return sum / norm
}

function toTexture(c, { srgb = true, repeat = 1 } = {}) {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = ANISOTROPY
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

function heightToNormal(height, size, strength = 2.2) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const d = img.data
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255
      d[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

export function asphaltSet(size = 1024) {
  const S = size
  const c = canvas(S), ctx = c.getContext('2d')
  const rc = canvas(S), rctx = rc.getContext('2d')
  const img = ctx.createImageData(S, S), rimg = rctx.createImageData(S, S)
  const d = img.data, rd = rimg.data
  const height = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const nx = x / S * 8, ny = y / S * 8
      const grain = fbm(nx * 9, ny * 9, 11, 4)
      const blotch = fbm(nx * 1.8, ny * 1.8, 23, 4)
      const fine = hash2(x, y, 5)
      let v = 30 + grain * 26 + blotch * 20 + (fine - 0.5) * 16
      const wet = Math.max(0, fbm(nx * 1.2 + 4, ny * 1.2, 91, 3) - 0.52) * 2.1
      v -= wet * 16
      d[i] = v * 0.82; d[i + 1] = v * 0.9; d[i + 2] = v * 0.98; d[i + 3] = 255
      let rough = 120 + grain * 80 - wet * 85
      rd[i] = rough * 0.95; rd[i + 1] = rough; rd[i + 2] = rough * 1.05; rd[i + 3] = 255
      height[y * S + x] = grain * 0.7 + fine * 0.3 - wet * 0.3
    }
  }
  ctx.putImageData(img, 0, 0); rctx.putImageData(rimg, 0, 0)
  const rng = rand(77)
  ctx.globalAlpha = 0.16
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = i % 3 ? '#0a0c0f' : '#565f66'
    ctx.lineWidth = 0.6 + rng() * 1.4
    ctx.beginPath()
    let x = rng() * S, y = rng() * S
    ctx.moveTo(x, y)
    for (let s = 0; s < 6; s++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 60; ctx.lineTo(x, y) }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const map = toTexture(c, { repeat: 18 })
  const normalMap = toTexture(heightToNormal(height, S, 1.5), { srgb: false, repeat: 18 })
  const roughnessMap = toTexture(rc, { srgb: false, repeat: 18 })
  return { map, normalMap, roughnessMap }
}

export function concreteSet(tint = [122, 124, 120]) {
  const S = 512
  const c = canvas(S), ctx = c.getContext('2d')
  const img = ctx.createImageData(S, S), d = img.data
  const height = new Float32Array(S * S)
  const [tr, tg, tb] = tint
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const n = fbm(x / S * 6, y / S * 6, 31, 5)
      const stain = fbm(x / S * 2 + 9, y / S * 2, 57, 3)
      const fine = hash2(x, y, 3)
      const v = 0.62 + n * 0.46 + (fine - 0.5) * 0.1 - Math.max(0, stain - 0.55) * 0.55
      d[i] = tr * v; d[i + 1] = tg * v; d[i + 2] = tb * v; d[i + 3] = 255
      height[y * S + x] = n * 0.8 + fine * 0.2
    }
  }
  ctx.putImageData(img, 0, 0)
  const rng = rand(133)
  ctx.strokeStyle = 'rgba(30,32,32,0.5)'; ctx.lineWidth = 0.8
  for (let i = 0; i < 14; i++) {
    ctx.beginPath(); let x = rng() * S, y = rng() * S; ctx.moveTo(x, y)
    for (let s = 0; s < 5; s++) { x += (rng() - 0.5) * 38; y += (rng() - 0.5) * 38; ctx.lineTo(x, y) }
    ctx.stroke()
  }
  return { map: toTexture(c), normalMap: toTexture(heightToNormal(height, S, 1.8), { srgb: false }) }
}

export function metalSet(base = '#3b4148', accent = '#6c757d', seed = 9) {
  const S = 512
  const c = canvas(S), ctx = c.getContext('2d')
  const rng = rand(seed)
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S)
  const img = ctx.getImageData(0, 0, S, S), d = img.data
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const scratch = hash2(x, y >> 1, seed) * 0.1 + fbm(x / S * 4, y / S * 1.2, seed + 4, 3) * 0.16
      d[i] = Math.min(255, d[i] * (0.88 + scratch))
      d[i + 1] = Math.min(255, d[i + 1] * (0.9 + scratch))
      d[i + 2] = Math.min(255, d[i + 2] * (0.94 + scratch))
    }
  }
  ctx.putImageData(img, 0, 0)
  for (let i = 0; i < 170; i++) {
    const x = rng() * S, y = rng() * S
    ctx.strokeStyle = rng() > 0.82 ? 'rgba(140,92,52,0.25)' : 'rgba(210,225,235,0.07)'
    ctx.lineWidth = rng() * 1.2
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 90, y + (rng() - 0.5) * 6); ctx.stroke()
  }
  ctx.fillStyle = accent; ctx.globalAlpha = 0.12
  for (let i = 0; i < 26; i++) ctx.fillRect(rng() * S, rng() * S, rng() * 26, rng() * 10)
  return { map: toTexture(c) }
}

export function containerSet(color = '#445562', seed = 21, size = 512) {
  const S = size
  const c = canvas(S), ctx = c.getContext('2d')
  ctx.fillStyle = color; ctx.fillRect(0, 0, S, S)
  const img = ctx.getImageData(0, 0, S, S), d = img.data
  for (let x = 0; x < S; x++) {
    const ridge = Math.sin(x / S * Math.PI * 34)
    const shade = 0.76 + 0.26 * Math.max(0, ridge) + 0.08 * ridge
    for (let y = 0; y < S; y++) {
      const i = (y * S + x) * 4
      const wear = fbm(x / S * 4, y / S * 4, seed, 4)
      const rust = Math.max(0, fbm(x / S * 3 + 2, y / S * 3, seed + 8, 3) - 0.58) * 2.4
      const f = shade * (0.9 + wear * 0.24)
      d[i] = Math.min(255, d[i] * f + rust * 68)
      d[i + 1] = Math.min(255, d[i + 1] * f + rust * 34)
      d[i + 2] = Math.min(255, d[i + 2] * f + rust * 14)
    }
  }
  ctx.putImageData(img, 0, 0)
  const rng = rand(seed + 2)
  for (let i = 0; i < 90; i++) {
    const x = rng() * S, y = rng() * S
    ctx.fillStyle = `rgba(18,22,25,${0.06 + rng() * 0.12})`
    ctx.fillRect(x, y, rng() * 6, rng() * 2)
  }
  ctx.strokeStyle = 'rgba(12,16,20,0.45)'; ctx.lineWidth = 3
  ctx.strokeRect(4, 4, S - 8, S - 8)
  return { map: toTexture(c) }
}

export function sandbagSet() {
  const S = 512
  const c = canvas(S), ctx = c.getContext('2d')
  ctx.fillStyle = '#8a7b57'; ctx.fillRect(0, 0, S, S)
  const img = ctx.getImageData(0, 0, S, S), d = img.data
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      const weave = (Math.sin(x * 0.55) * 0.5 + 0.5) * 0.12 + (Math.sin(y * 0.55) * 0.5 + 0.5) * 0.08
      const n = fbm(x / S * 7, y / S * 7, 71, 4)
      const f = 0.82 + n * 0.26 + weave
      d[i] = Math.min(255, d[i] * f); d[i + 1] = Math.min(255, d[i + 1] * f); d[i + 2] = Math.min(255, d[i + 2] * f)
    }
  }
  ctx.putImageData(img, 0, 0)
  return { map: toTexture(c) }
}

export function chainlinkTexture() {
  const S = 256
  const c = canvas(S), ctx = c.getContext('2d')
  ctx.clearRect(0, 0, S, S)
  ctx.strokeStyle = 'rgba(178,192,200,0.95)'; ctx.lineWidth = 2.2
  const gap = 32
  for (let i = -S; i < S * 2; i += gap) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + S, S); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(i + S, 0); ctx.lineTo(i, S); ctx.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = ANISOTROPY
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function scorchTexture() {
  const S = 128
  const c = canvas(S), ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(6,6,6,1)')
  g.addColorStop(0.28, 'rgba(15,14,13,0.96)')
  g.addColorStop(0.6, 'rgba(28,24,20,0.6)')
  g.addColorStop(1, 'rgba(30,26,22,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
  const rng = rand(44)
  ctx.strokeStyle = 'rgba(10,8,6,0.55)'; ctx.lineWidth = 1
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, r = 7 + rng() * 12
    ctx.beginPath(); ctx.moveTo(S / 2 + Math.cos(a) * 4, S / 2 + Math.sin(a) * 4)
    ctx.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); ctx.stroke()
  }
  return toTexture(c, { srgb: true })
}

export function flashTexture() {
  const S = 256
  const c = canvas(S), ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,245,1)')
  g.addColorStop(0.12, 'rgba(255,240,190,1)')
  g.addColorStop(0.3, 'rgba(255,170,70,0.82)')
  g.addColorStop(0.62, 'rgba(255,110,30,0.18)')
  g.addColorStop(1, 'rgba(255,80,10,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = 'rgba(255,225,170,0.9)'; ctx.lineWidth = 3
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2)
    ctx.lineTo(S / 2 + Math.cos(a) * (60 + (i % 3) * 24), S / 2 + Math.sin(a) * (60 + (i % 3) * 24)); ctx.stroke()
  }
  return toTexture(c, { srgb: true })
}

export function softTexture() {
  const S = 128
  const c = canvas(S), ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S)
  return toTexture(c, { srgb: true })
}

export function warningTexture() {
  const S = 256
  const c = canvas(S), ctx = c.getContext('2d')
  ctx.fillStyle = '#d8a21c'; ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = '#141619'
  for (let i = -S; i < S * 2; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 32, 0); ctx.lineTo(i + 32 - S, S); ctx.lineTo(i - S, S); ctx.closePath(); ctx.fill()
  }
  ctx.globalAlpha = 0.28; ctx.fillStyle = '#2a2416'
  for (let i = 0; i < 90; i++) ctx.fillRect(Math.random() * S, Math.random() * S, Math.random() * 8, Math.random() * 3)
  return toTexture(c)
}

export function cityTexture() {
  const S = 512
  const c = canvas(S), ctx = c.getContext('2d')
  ctx.fillStyle = '#05080e'; ctx.fillRect(0, 0, S, S)
  const rng = rand(303)
  for (let i = 0; i < 220; i++) {
    const x = rng() * S, y = rng() * S, w = 2 + rng() * 7, h = 2 + rng() * 9
    const warm = rng() > 0.35
    ctx.fillStyle = warm ? `rgba(255,${150 + rng() * 60 | 0},${70 + rng() * 50 | 0},${0.25 + rng() * 0.65})` : `rgba(${110 + rng() * 80 | 0},${190 + rng() * 50 | 0},255,${0.2 + rng() * 0.6})`
    ctx.fillRect(x, y, w, h)
  }
  return toTexture(c)
}

export function noiseTexture(size = 128, alpha = 0.5) {
  const c = canvas(size), ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size), d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = 125 + (Math.random() - 0.5) * 190
    d[i] = d[i + 1] = d[i + 2] = v
    d[i + 3] = 255 * alpha
  }
  ctx.putImageData(img, 0, 0)
  return toTexture(c, { srgb: false })
}

export function buildAllTextures(quality = 'balanced') {
  const high = quality === 'high'
  const asphaltSize = high ? 1024 : 512
  const containerSize = high ? 512 : 256
  return {
    asphalt: asphaltSet(asphaltSize),
    concrete: concreteSet(),
    metal: metalSet(),
    containerA: containerSet('#3c4d58', 21, containerSize),
    containerB: containerSet('#4c4034', 38, containerSize),
    containerC: containerSet('#324a42', 57, containerSize),
    sandbag: sandbagSet(),
    chainlink: chainlinkTexture(),
    scorch: scorchTexture(),
    flash: flashTexture(),
    soft: softTexture(),
    warning: warningTexture(),
    city: cityTexture()
  }
}
