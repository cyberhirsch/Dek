import { describe, expect, it } from 'vitest'
import { analyzeDeck } from './analyze'
import type { Deck } from './types'

describe('analyzeDeck', () => {
  it('reports missing required fields by layout', () => {
    const deck: Deck = {
      config: {},
      slides: [
        { layout: 'cover', title: '' },
        { layout: 'text-image', title: 'A', content: '- one', image: '' },
      ],
    }

    const a = analyzeDeck(deck)

    expect(a.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slide: 1, field: 'title', severity: 'warning' }),
        expect.objectContaining({ slide: 2, field: 'image', severity: 'warning' }),
      ]),
    )
    expect(a.counts.warning).toBe(2)
  })

  it('accepts a Markdown content block with bullets and a paragraph', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'text', title: 'A', content: '- bullet\nplain text' }],
    }

    const a = analyzeDeck(deck)

    expect(a.issues.filter((i) => i.kind === 'schema')).toHaveLength(0)
  })

  it('flags import-review candidates without treating them as hard errors', () => {
    const deck: Deck = {
      config: {},
      slides: [
        { layout: 'freeform', body: '<table></table>' },
        { layout: 'text', title: 'A', content: Array.from({ length: 10 }, (_, i) => `- item ${i}`).join('\n') },
      ],
    }

    const a = analyzeDeck(deck)

    expect(a.issues.filter((i) => i.kind === 'review')).toHaveLength(2)
    expect(a.counts.error).toBe(0)
  })

  it('inventories assets and warns about large embedded images', () => {
    const big = `data:image/png;base64,${'a'.repeat(1600000)}`
    const deck: Deck = {
      config: {},
      slides: [
        { layout: 'image-full', image: big },
        { layout: 'gallery', items: [{ image: '/Assets/a.jpg' }, { image: 'https://example.com/b.jpg' }] },
      ],
    }

    const a = analyzeDeck(deck)

    expect(a.assets.map((x) => x.kind)).toEqual(['data', 'remote', 'local'])
    expect(a.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'asset', severity: 'warning', field: 'image' }),
        expect.objectContaining({ kind: 'asset', severity: 'info', field: 'items[1].image' }),
      ]),
    )
  })
})
