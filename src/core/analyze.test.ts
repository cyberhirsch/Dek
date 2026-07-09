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

  it('flags on-disk files no slide references as orphans', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'image-full', image: '/Deck Assets/used.jpg' }],
    }

    const a = analyzeDeck(deck, ['used.jpg', 'stale.png', 'old-logo.svg'])

    const orphans = a.assets.filter((x) => x.kind === 'orphan')
    expect(orphans.map((o) => o.filename).sort()).toEqual(['old-logo.svg', 'stale.png'])
    expect(a.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'asset', severity: 'info', field: 'stale.png', slide: 0 }),
      ]),
    )
  })

  it('matches references to disk files by basename (no false orphans)', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'gallery', items: [{ image: '/Deck Assets/a.jpg' }, { image: 'b.png' }] }],
    }

    const a = analyzeDeck(deck, ['a.jpg', 'b.png'])

    expect(a.assets.some((x) => x.kind === 'orphan')).toBe(false)
  })

  it('reports no orphans when the disk listing is omitted', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'image-full', image: '/Deck Assets/used.jpg' }],
    }

    const a = analyzeDeck(deck)

    expect(a.assets.some((x) => x.kind === 'orphan')).toBe(false)
  })

  it('flags fields a layout will not render (LLM/typo protection)', () => {
    const deck: Deck = {
      config: {},
      slides: [
        // `subtitle` isn't a section field; `titel` is a typo for `title`.
        { layout: 'section', title: 'S', subtitle: 'nope', titel: 'oops' } as never,
      ],
    }

    const a = analyzeDeck(deck)

    expect(a.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'schema', field: 'subtitle', severity: 'warning' }),
        expect.objectContaining({ kind: 'schema', field: 'titel', severity: 'warning' }),
      ]),
    )
  })

  it('does not flag universal fields (notes, group, stash, elements)', () => {
    const deck: Deck = {
      config: {},
      slides: [
        { layout: 'text', title: 'A', content: '- x', notes: 'hi', group: 'Intro', stash: { cite: 'z' }, elements: [] },
      ],
    }

    const a = analyzeDeck(deck)

    expect(a.issues.filter((i) => i.kind === 'schema')).toHaveLength(0)
  })

  it('flags a malformed focus', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'image-full', image: '/a.jpg', focus: 'center' } as never],
    }

    const a = analyzeDeck(deck)

    expect(a.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'schema', field: 'focus', severity: 'warning' }),
      ]),
    )
  })

  it('accepts a well-formed focus', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'image-full', image: '/a.jpg', focus: { x: 0.2, y: 0.3, scale: 1.5 } }],
    }

    const a = analyzeDeck(deck)

    expect(a.issues.some((i) => i.field === 'focus')).toBe(false)
  })

  it('flags a referenced local image missing from the folder', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'image-full', image: '/Deck Assets/gone.jpg' }],
    }

    const a = analyzeDeck(deck, ['other.jpg'])

    expect(a.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'asset', field: 'image', severity: 'warning', slide: 1 }),
      ]),
    )
  })

  it('does not flag missing files when there is no folder listing', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'image-full', image: '/Deck Assets/a.jpg' }],
    }

    // Empty/omitted listing is ambiguous (no folder vs. empty folder) — skip.
    expect(analyzeDeck(deck, []).issues.some((i) => i.message.includes('not found'))).toBe(false)
    expect(analyzeDeck(deck).issues.some((i) => i.message.includes('not found'))).toBe(false)
  })
})
