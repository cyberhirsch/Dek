import { describe, it, expect } from 'vitest'
import { readCrop, cropPixels } from './pptx'

// A minimal stand-in for a <p:pic> element: readCrop only calls
// getElementsByTagName (via firstTag) and getAttribute (via num/attr).
function fakePic(srcRect: Record<string, number> | null): Element {
  const rect =
    srcRect === null
      ? null
      : ({ getAttribute: (n: string) => (n in srcRect ? String(srcRect[n]) : null) } as unknown as Element)
  return {
    getElementsByTagName: (name: string) => (name === 'a:srcRect' && rect ? [rect] : []),
  } as unknown as Element
}

describe('readCrop', () => {
  it('returns undefined when the picture has no srcRect', () => {
    expect(readCrop(fakePic(null))).toBeUndefined()
  })

  it('returns undefined for an all-zero srcRect (no actual crop)', () => {
    expect(readCrop(fakePic({ l: 0, t: 0, r: 0, b: 0 }))).toBeUndefined()
  })

  it('reads edge fractions from ST_Percentage (1000 = 1%)', () => {
    // 25% off left, 10% off bottom
    expect(readCrop(fakePic({ l: 25000, b: 10000 }))).toEqual({ l: 0.25, t: 0, r: 0, b: 0.1 })
  })

  it('ignores negative (outset / zoom-out) crops it cannot reproduce by trimming', () => {
    expect(readCrop(fakePic({ l: -20000 }))).toBeUndefined()
  })

  it('ignores a degenerate crop that leaves no visible width or height', () => {
    expect(readCrop(fakePic({ l: 60000, r: 60000 }))).toBeUndefined()
    expect(readCrop(fakePic({ t: 100000 }))).toBeUndefined()
  })
})

describe('cropPixels', () => {
  it('maps edge fractions to a source-pixel rectangle', () => {
    expect(cropPixels(1000, 500, { l: 0.1, t: 0.2, r: 0.1, b: 0 })).toEqual({
      sx: 100,
      sy: 100,
      sw: 800,
      sh: 400,
    })
  })

  it('a lone left crop keeps full height and trims only the left', () => {
    expect(cropPixels(400, 300, { l: 0.25, t: 0, r: 0, b: 0 })).toEqual({
      sx: 100,
      sy: 0,
      sw: 300,
      sh: 300,
    })
  })
})
