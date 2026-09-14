import { describe, expect, it } from 'vitest'
import { clampSlide, deckKey, readSlidePos } from './position'

describe('deckKey', () => {
  it('distinguishes two bundles whose inner file is both deck.md', () => {
    // The exact collision this key exists to avoid.
    expect(deckKey('deck.md', 'Week 01')).not.toBe(deckKey('deck.md', 'Week 02'))
  })

  it('is stable for the same deck and tolerates missing parts', () => {
    expect(deckKey('deck.md', 'Week 01')).toBe(deckKey('deck.md', 'Week 01'))
    expect(deckKey(undefined, undefined)).toBe('::')
  })
})

describe('clampSlide', () => {
  it('keeps an index inside a deck that has shrunk', () => {
    expect(clampSlide(9, 4)).toBe(3)
  })

  it('floors negatives, empty decks, and non-numbers to 0', () => {
    expect(clampSlide(-2, 10)).toBe(0)
    expect(clampSlide(3, 0)).toBe(0)
    expect(clampSlide(Number.NaN, 10)).toBe(0)
  })

  it('passes a valid index through untouched', () => {
    expect(clampSlide(5, 10)).toBe(5)
  })
})

describe('readSlidePos', () => {
  it('returns 0 when storage is unavailable rather than throwing', () => {
    // The test env is plain Node — no localStorage — which is exactly the
    // "blocked site data / private window" case the try/catch guards.
    expect(readSlidePos('anything', 10)).toBe(0)
  })
})
