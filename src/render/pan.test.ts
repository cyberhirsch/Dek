import { describe, expect, it } from 'vitest'
import { clampPan, minScale, panBounds, placePicture } from './pan'

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

describe('placePicture — what the frame shows, as a rect + source crop', () => {
  const wide = { w: 2000, h: 1000 } // 2:1
  const square = { w: 100, h: 100 }

  it('cover: fills the frame and crops the overflow evenly', () => {
    const p = placePicture(wide, square, 'cover')!
    expect([p.x, p.y, p.w, p.h]).toEqual([0, 0, 100, 100])
    expect(p.crop.l).toBeCloseTo(0.25, 9)
    expect(p.crop.r).toBeCloseTo(0.25, 9)
    expect(p.crop.t).toBeCloseTo(0, 9)
  })

  it('contain: shrinks to the picture, centred, with nothing cropped', () => {
    const p = placePicture(wide, square, 'contain')!
    expect([p.x, p.y, p.w, p.h]).toEqual([0, 25, 100, 50])
    expect(p.crop).toEqual({ l: 0, t: 0, r: 0, b: 0 })
  })

  it('zoom crops further, about the centre', () => {
    const p = placePicture({ w: 100, h: 100 }, square, 'cover', { scale: 2 })!
    expect([p.x, p.y, p.w, p.h]).toEqual([0, 0, 100, 100])
    for (const side of ['l', 't', 'r', 'b'] as const) expect(p.crop[side]).toBeCloseTo(0.25, 9)
  })

  it('pan moves the crop window, clamped as on screen', () => {
    // 2:1 in a square, cover: 50px of overflow each side; a far pan clamps to it
    const p = placePicture(wide, square, 'cover', { x: 999, y: 0, scale: 1 })!
    expect(p.crop.l).toBeCloseTo(0, 9)
    expect(p.crop.r).toBeCloseTo(0.5, 9)
  })

  it('is null with no size to work from', () => {
    expect(placePicture({ w: 0, h: 0 }, square, 'cover')).toBeNull()
  })
})

describe('minScale — how far out a picture may zoom', () => {
  it('lets cover zoom out until the whole picture fits', () => {
    // 2:1 in a square: cover is 0.1, contain 0.05 — half the cover scale
    expect(minScale({ w: 2000, h: 1000 }, { w: 100, h: 100 }, 'cover')).toBeCloseTo(0.5, 9)
  })

  it('keeps contain at its fit, which already shows everything', () => {
    expect(minScale({ w: 2000, h: 1000 }, { w: 100, h: 100 }, 'contain')).toBe(1)
  })

  it('is 1 before the picture has a size', () => {
    expect(minScale({ w: 0, h: 0 }, { w: 100, h: 100 }, 'cover')).toBe(1)
  })

  it('at that floor a cover picture is shown whole, exactly as contain', () => {
    const wide = { w: 2000, h: 1000 }
    const square = { w: 100, h: 100 }
    const out = placePicture(wide, square, 'cover', { scale: minScale(wide, square, 'cover') })!
    expect(out).toEqual(placePicture(wide, square, 'contain'))
    expect(out.crop).toEqual({ l: 0, t: 0, r: 0, b: 0 })
  })
})
