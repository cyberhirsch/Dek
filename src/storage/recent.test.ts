import { describe, expect, it } from 'vitest'
import { RECENT_MAX, dropRecent, pushRecent, readRecent, sameDeck, type RecentDeck } from './recent'

const r = (file: string, path: string[] = [], name = file.replace(/\.dek$/, '')): RecentDeck => ({ file, path, name })

describe('recent decks', () => {
  it('puts the latest first', () => {
    const list = pushRecent(pushRecent([], r('A.dek')), r('B.dek'))
    expect(list.map((x) => x.file)).toEqual(['B.dek', 'A.dek'])
  })

  it('moves a reopened deck to the front instead of listing it twice', () => {
    const list = pushRecent([r('A.dek'), r('B.dek'), r('C.dek')], r('C.dek'))
    expect(list.map((x) => x.file)).toEqual(['C.dek', 'A.dek', 'B.dek'])
  })

  it(`keeps at most ${RECENT_MAX}`, () => {
    let list: RecentDeck[] = []
    for (let i = 0; i < RECENT_MAX + 5; i++) list = pushRecent(list, r(`D${i}.dek`))
    expect(list).toHaveLength(RECENT_MAX)
    expect(list[0].file).toBe(`D${RECENT_MAX + 4}.dek`)
  })

  it('tells same-named decks in different folders apart', () => {
    // Two courses can each have a "Week 01" — identity is the location.
    const a = r('Week 01.dek', ['S1_Design'])
    const b = r('Week 01.dek', ['S2_3D'])
    expect(sameDeck(a, b)).toBe(false)
    expect(pushRecent([a], b)).toHaveLength(2)
  })

  it('drops one entry by location', () => {
    expect(dropRecent([r('A.dek'), r('B.dek')], r('A.dek')).map((x) => x.file)).toEqual(['B.dek'])
  })

  it('reads as empty, never throws, when storage is unavailable', () => {
    // plain Node: no localStorage — the blocked-storage case
    expect(readRecent()).toEqual([])
  })
})
