import { describe, expect, it } from 'vitest'
import { clampPan, panBounds } from './pan'

// A 16:9 picture in a square frame — the case in the editor that exposed the
// bug: a drag could pull the picture clean off its frame, showing background on
// one side and running the picture out the other.
const wide = { w: 1600, h: 900 }
const square = { w: 500, h: 500 }

describe('panBounds', () => {
  it('allows horizontal pan for a wide picture in a square frame (cover)', () => {
    const b = panBounds(wide, square, 'cover', 1)
    // cover ratio 500/900; rendered 888.9 x 500 — 388.9 of overflow, half each side
    expect(b.x).toBeCloseTo(194.4, 1)
    expect(b.y).toBe(0) // fits exactly on this axis: nothing hidden to reveal
  })

  it('allows NO pan when the whole picture is already visible (contain, scale 1)', () => {
    const b = panBounds(wide, square, 'contain', 1)
    expect(b).toEqual({ x: 0, y: 0 })
  })

  it('opens both axes once zoomed past the fit', () => {
    const b = panBounds(wide, square, 'contain', 2)
    expect(b.x).toBeCloseTo(250, 1)
    expect(b.y).toBeCloseTo(31.25, 2)
  })

  it('allows no pan when the picture matches the frame aspect exactly', () => {
    expect(panBounds({ w: 1000, h: 1000 }, square, 'cover', 1)).toEqual({ x: 0, y: 0 })
  })

  it('allows no pan before the image has loaded, or in a zero-sized frame', () => {
    expect(panBounds({ w: 0, h: 0 }, square, 'cover', 1)).toEqual({ x: 0, y: 0 })
    expect(panBounds(wide, { w: 0, h: 0 }, 'cover', 1)).toEqual({ x: 0, y: 0 })
  })

  it('never returns a negative bound', () => {
    const b = panBounds({ w: 100, h: 100 }, square, 'contain', 1)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y).toBeGreaterThanOrEqual(0)
  })
})

describe('clampPan', () => {
  it('holds an offset inside the bound', () => {
    expect(clampPan(500, 194.4)).toBeCloseTo(194.4, 1)
    expect(clampPan(-500, 194.4)).toBeCloseTo(-194.4, 1)
    expect(clampPan(50, 194.4)).toBe(50)
  })

  it('pins to 0 when there is no room to pan', () => {
    expect(clampPan(120, 0)).toBe(0)
    expect(clampPan(-120, 0)).toBe(0)
  })
})
