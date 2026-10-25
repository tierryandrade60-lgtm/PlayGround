export function triangleWave(elapsed, period = 2.35) {
  if (!Number.isFinite(period) || period <= 0) return 0
  const cycle = ((elapsed % period) + period) % period
  const half = period / 2
  return cycle < half ? cycle / half : 2 - cycle / half
}

export function landingQuality(offset, radius) {
  if (!Number.isFinite(radius) || radius <= 0) return 'edge'
  const ratio = Math.max(0, offset) / radius
  if (ratio <= 0.34) return 'perfect'
  if (ratio <= 0.72) return 'good'
  return 'edge'
}

export function hopScore(flow, quality) {
  const streak = Math.max(1, Math.floor(flow))
  const base = 10 + Math.min(streak - 1, 9) * 2
  const bonus = quality === 'perfect' ? 8 : quality === 'good' ? 3 : 0
  return base + bonus
}

export function difficultyFor(index) {
  const safe = Math.max(0, Math.floor(index))
  const t = Math.min(safe / 34, 1)
  const bump = Math.min(Math.floor(safe / 8), 2)
  return {
    gapMin: 5.9 + t * 1.4 + bump * 0.28,
    gapMax: 7.4 + t * 1.9 + bump * 0.42,
    radiusMin: 2.3 - t * 0.34 - bump * 0.05,
    radiusMax: 2.85 - t * 0.42 - bump * 0.06,
    heightRange: 1.15 + t * 1.25,
    perfectRatio: 0.34,
  }
}

export function formatScore(value) {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}
