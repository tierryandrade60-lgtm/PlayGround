import { describe, expect, it } from 'vitest'
import {
  difficultyFor,
  formatScore,
  hopScore,
  landingQuality,
  triangleWave,
} from '../src/game/score.js'

describe('triangleWave', () => {
  it('starts at zero and rises to one at the halfway point', () => {
    expect(triangleWave(0, 2)).toBe(0)
    expect(triangleWave(0.5, 2)).toBeCloseTo(0.5)
    expect(triangleWave(1, 2)).toBeCloseTo(1)
  })

  it('comes back down and wraps cleanly', () => {
    expect(triangleWave(1.5, 2)).toBeCloseTo(0.5)
    expect(triangleWave(2, 2)).toBeCloseTo(0)
    expect(triangleWave(2.5, 2)).toBeCloseTo(0.5)
  })

  it('stays inside [0, 1] for negative and large inputs', () => {
    for (let t = -8; t < 20; t += 0.17) {
      const value = triangleWave(t, 2.35)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('handles invalid periods without throwing', () => {
    expect(triangleWave(1, 0)).toBe(0)
    expect(triangleWave(1, Number.NaN)).toBe(0)
  })
})

describe('landingQuality', () => {
  it('rewards landings near the centre', () => {
    expect(landingQuality(0, 3)).toBe('perfect')
    expect(landingQuality(0.9, 3)).toBe('perfect')
    expect(landingQuality(1.4, 3)).toBe('good')
    expect(landingQuality(2.4, 3)).toBe('edge')
    expect(landingQuality(3, 3)).toBe('edge')
  })

  it('falls back to edge for invalid radii', () => {
    expect(landingQuality(0, 0)).toBe('edge')
    expect(landingQuality(1, Number.NaN)).toBe('edge')
  })
})

describe('hopScore', () => {
  it('always awards base points for a hop', () => {
    expect(hopScore(1, 'edge')).toBe(10)
    expect(hopScore(1, 'good')).toBe(13)
    expect(hopScore(1, 'perfect')).toBe(18)
  })

  it('grows with the flow streak but has a ceiling', () => {
    expect(hopScore(5, 'good')).toBeGreaterThan(hopScore(2, 'good'))
    expect(hopScore(40, 'good')).toBe(hopScore(400, 'good'))
  })

  it('ranks perfect above good above edge at the same flow', () => {
    for (const flow of [1, 4, 12]) {
      expect(hopScore(flow, 'perfect')).toBeGreaterThan(hopScore(flow, 'good'))
      expect(hopScore(flow, 'good')).toBeGreaterThan(hopScore(flow, 'edge'))
    }
  })
})

describe('difficultyFor', () => {
  it('increases gaps as the run gets longer', () => {
    const start = difficultyFor(0)
    const late = difficultyFor(60)
    expect(late.gapMin).toBeGreaterThan(start.gapMin)
    expect(late.gapMax).toBeGreaterThan(start.gapMax)
  })

  it('shrinks islands without making them impossible', () => {
    const late = difficultyFor(200)
    expect(late.radiusMin).toBeGreaterThan(1.8)
    expect(late.radiusMin).toBeLessThan(difficultyFor(0).radiusMin)
    expect(late.radiusMax).toBeLessThan(difficultyFor(0).radiusMax)
  })

  it('handles negative indexes safely', () => {
    expect(difficultyFor(-10)).toEqual(difficultyFor(0))
  })
})

describe('formatScore', () => {
  it('rounds, clamps, and groups thousands', () => {
    expect(formatScore(0)).toBe('0')
    expect(formatScore(-4)).toBe('0')
    expect(formatScore(12.9)).toBe('12')
    expect(formatScore(12345)).toBe('12,345')
  })
})
