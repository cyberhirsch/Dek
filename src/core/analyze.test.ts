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

  it('does not orphan freeform canvas images (box/image element src)', () => {
    const deck: Deck = {
      config: {},
      slides: [
        {
          layout: 'freeform',
          elements: [
            { type: 'box', x: 0, y: 0, w: 10, h: 10, rotation: 0, src: 'Assets/canvas.png' },
            { type: 'image', x: 0, y: 0, w: 10, h: 10, rotation: 0, src: '/Deck Assets/photo.jpg' },
          ],
        },
      ],
    } as never

    const a = analyzeDeck(deck, ['canvas.png', 'photo.jpg'])

    expect(a.assets.some((x) => x.kind === 'orphan')).toBe(false)
  })

  it('does NOT mass-flag a full folder when the deck references no local files', () => {
    // A deck with no local file refs + a full folder is the signature of an
    // unloaded/wrong deck. Flagging everything orphan is how a whole folder gets
    // one-click deleted — so we report nothing rather than risk it.
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'cover', title: 'Just text, no images' }],
    }

    const a = analyzeDeck(deck, ['a.jpg', 'b.png', 'c.webp'])

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

  it('does not flag imageFit/imageLink on single-image layouts', () => {
    const deck: Deck = {
      config: {},
      slides: [
        { layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg', imageFit: 'contain', imageLink: 'https://x.io' },
        { layout: 'image-full', image: '/i.jpg', imageFit: 'cover', imageLink: 'https://x.io' },
        { layout: 'image-caption', image: '/i.jpg', caption: 'c', imageFit: 'contain', imageLink: 'https://x.io' },
      ],
    }

    const a = analyzeDeck(deck)

    expect(a.issues.some((i) => i.field === 'imageFit' || i.field === 'imageLink')).toBe(false)
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

  it('accepts a well-formed table slide with no "field isn\'t rendered" warnings', () => {
    const deck: Deck = {
      config: {},
      slides: [
        {
          layout: 'table',
          title: 'Grid',
          tableRows: 2,
          tableCols: 2,
          tableCells: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
        },
      ],
    }

    const a = analyzeDeck(deck)

    expect(a.issues.filter((i) => i.kind === 'schema')).toHaveLength(0)
  })

  // Highest-priority case: this is the exact regression class that once let the
  // Review panel offer to delete an image that was still in use by a slide.
  it('does not orphan a table cell image', () => {
    const deck: Deck = {
      config: {},
      slides: [
        {
          layout: 'table',
          tableRows: 1,
          tableCols: 2,
          tableCells: [{ image: '/Deck Assets/cell.jpg' }, { text: '' }],
        },
      ],
    }

    const a = analyzeDeck(deck, ['cell.jpg'])

    expect(a.assets.some((x) => x.kind === 'orphan')).toBe(false)
    expect(a.assets.some((x) => x.uses.some((u) => u.field === 'tableCells[0].image'))).toBe(true)
  })

  it('reports a table cell image as orphaned once the cell is removed', () => {
    // The inverse of the above: proves the shrink confirm-dialog's premise —
    // dropping a cell for real does surface as an orphan on the next scan. A
    // second slide keeps a live local reference so this isn't mistaken for the
    // "deck references no local files" empty-folder guard above.
    const deck: Deck = {
      config: {},
      slides: [
        { layout: 'table', tableRows: 1, tableCols: 1, tableCells: [{ text: '' }] },
        { layout: 'image-full', image: '/Deck Assets/kept.jpg' },
      ],
    }

    const a = analyzeDeck(deck, ['cell.jpg', 'kept.jpg'])

    expect(a.assets.filter((x) => x.kind === 'orphan').map((x) => x.filename)).toEqual(['cell.jpg'])
  })

  // Same regression class as the layout case above, one nesting level deeper:
  // once a table is baked to freeform its pictures live in elements[].cells[].
  it('does not orphan an image inside a baked (canvas) table element', () => {
    const deck: Deck = {
      config: {},
      slides: [
        {
          layout: 'freeform',
          elements: [
            {
              type: 'table',
              x: 0, y: 0, w: 100, h: 100, rotation: 0,
              rows: 1, cols: 2,
              cells: [{ image: '/Deck Assets/baked.jpg' }, { text: '' }],
            },
          ],
        },
      ],
    }

    const a = analyzeDeck(deck, ['baked.jpg'])

    expect(a.assets.some((x) => x.kind === 'orphan')).toBe(false)
    expect(a.assets.some((x) => x.uses.some((u) => u.field === 'elements[0].cells[0].image'))).toBe(true)
  })

  it('accepts a table slide with dragged track sizes and custom typography', () => {
    // tableColWidths/RowHeights/Font/Size must all be in KNOWN_FIELDS — otherwise
    // every table with a dragged divider raises a bogus "isn't rendered" warning.
    const deck: Deck = {
      config: {},
      slides: [
        {
          layout: 'table',
          tableRows: 1,
          tableCols: 2,
          tableCells: [{ text: 'a' }, { text: 'b' }],
          tableColWidths: [0.3, 0.7],
          tableRowHeights: [1],
          tableFont: 'heading',
          tableSize: 30,
        },
      ],
    }

    expect(analyzeDeck(deck).issues.filter((i) => i.kind === 'schema')).toHaveLength(0)
  })

  it('skips covered (merge-placeholder) cells when collecting table assets', () => {
    const deck: Deck = {
      config: {},
      slides: [
        {
          layout: 'table',
          tableRows: 1,
          tableCols: 2,
          tableCells: [{ image: '/Deck Assets/a.jpg', colspan: 2 }, { covered: true, image: '/Deck Assets/a.jpg' }],
        },
      ],
    }

    const a = analyzeDeck(deck, ['a.jpg'])

    expect(a.assets.filter((x) => x.kind !== 'orphan')).toHaveLength(1)
  })
})
