import { describe, expect, it } from 'vitest'
import { CLOUD_MAX_WORDS, cloudData, cloudLayout } from './cloud'
import type { CloudWord } from './cloud'
import type { TableData } from './types'

const t = (rows: TableData['rows'], header = false): TableData => ({ rows, header })

const boxOf = (w: CloudWord) => ({ x0: w.x - w.w / 2, x1: w.x + w.w / 2, y0: w.y - w.h / 2, y1: w.y + w.h / 2 })

describe('cloudData', () => {
  it('takes words from column 1 and weights from a numeric column', () => {
    expect(cloudData(t([['Light', 2], ['Form', 5]]))).toEqual([
      { text: 'Light', weight: 2 },
      { text: 'Form', weight: 5 },
    ])
  })

  it('gives every word equal weight when there are no numbers', () => {
    expect(cloudData(t([['a'], ['b']])).map((d) => d.weight)).toEqual([1, 1])
  })

  it('skips the header row and blank words', () => {
    expect(cloudData(t([['Word', 'Weight'], ['', 3], ['Form', 5]], true))).toEqual([{ text: 'Form', weight: 5 }])
  })

  it('gives a word with an unreadable weight the lightest weight, not zero', () => {
    const d = cloudData(t([['a', 4], ['b', 'n/a'], ['c', 2]]))
    expect(d.find((x) => x.text === 'b')?.weight).toBe(2)
  })
})

describe('cloudLayout', () => {
  const table = t([
    ['Gestalt', 9],
    ['Proximity', 6],
    ['Closure', 5],
    ['Figure', 4],
    ['Ground', 4],
    ['Similarity', 3],
    ['Continuity', 2],
    ['Symmetry', 1],
  ])

  it('is deterministic — the same table always lays out identically', () => {
    expect(cloudLayout(table, 1060, 500)).toEqual(cloudLayout(table, 1060, 500))
  })

  it('places every word without overlaps', () => {
    const words = cloudLayout(table, 1060, 500)
    expect(words).toHaveLength(8)
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const a = boxOf(words[i])
        const b = boxOf(words[j])
        const overlap = a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
        expect(overlap, `${words[i].text} overlaps ${words[j].text}`).toBe(false)
      }
    }
  })

  it('keeps every word inside the box', () => {
    for (const w of cloudLayout(table, 1060, 500)) {
      const b = boxOf(w)
      expect(b.x0).toBeGreaterThanOrEqual(0)
      expect(b.y0).toBeGreaterThanOrEqual(0)
      expect(b.x1).toBeLessThanOrEqual(1060)
      expect(b.y1).toBeLessThanOrEqual(500)
    }
  })

  it('sizes heavier words larger, and sets the biggest in the heading face', () => {
    const words = cloudLayout(table, 1060, 500)
    const gestalt = words.find((w) => w.text === 'Gestalt')!
    const symmetry = words.find((w) => w.text === 'Symmetry')!
    expect(gestalt.size).toBeGreaterThan(symmetry.size)
    expect(gestalt.heading).toBe(true)
    expect(symmetry.heading).toBe(false)
  })

  it('accents exactly the three heaviest words', () => {
    const accented = cloudLayout(table, 1060, 500).filter((w) => w.accent).map((w) => w.text)
    expect(accented.sort()).toEqual(['Closure', 'Gestalt', 'Proximity'])
  })

  it('accents nothing when all weights are equal — there is no "top" to mark', () => {
    const words = cloudLayout(t([['a'], ['b'], ['c'], ['d']]), 1060, 500)
    expect(words.some((w) => w.accent)).toBe(false)
    expect(new Set(words.map((w) => w.size)).size).toBe(1)
  })

  it('drops the lightest words past the readable maximum', () => {
    const many = t(Array.from({ length: CLOUD_MAX_WORDS + 15 }, (_, i) => [`w${i}`, i + 1]))
    expect(cloudLayout(many, 1060, 500)).toHaveLength(CLOUD_MAX_WORDS)
  })

  it('is empty for no words or no room', () => {
    expect(cloudLayout(t([['', 3]]), 1060, 500)).toEqual([])
    expect(cloudLayout(table, 0, 500)).toEqual([])
  })
})
