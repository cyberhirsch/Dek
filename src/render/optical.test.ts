import { describe, expect, it } from 'vitest'
import { leadingGlyph, opticalMarginLeft } from './optical'

describe('leadingGlyph', () => {
  it('returns the first non-whitespace character', () => {
    expect(leadingGlyph('Visual Hierarchy')).toBe('V')
    expect(leadingGlyph('  Visual')).toBe('V')
  })

  it('returns null for blank or whitespace-only text', () => {
    expect(leadingGlyph('')).toBeNull()
    expect(leadingGlyph('   ')).toBeNull()
  })

  it('treats an astral character (e.g. emoji) as one glyph, not a stray surrogate half', () => {
    expect(leadingGlyph('🎨 Design')).toBe('🎨')
  })

  it('measures punctuation too, not just letters', () => {
    expect(leadingGlyph('"quoted"')).toBe('"')
  })
})

// opticalMarginLeft needs a canvas to measure real glyph ink — this project runs
// vitest under plain Node with no jsdom/canvas, so its actual measurement logic
// is exercised live in the browser, not here. What IS worth locking down here is
// the safe fallback: with no canvas available, it must return 0 (no correction)
// rather than throw, so FittedText.vue's fit() cycle never breaks on a platform
// that can't measure text.
describe('opticalMarginLeft (no-canvas fallback)', () => {
  it('returns 0 when there is no canvas to measure with', () => {
    expect(opticalMarginLeft('Visual', 'italic 300 220px "Cormorant Garamond"')).toBe(0)
  })

  it('returns 0 for blank text regardless', () => {
    expect(opticalMarginLeft('', 'italic 300 220px "Cormorant Garamond"')).toBe(0)
  })
})
