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

  it('flags a malformed focus on a gallery item, and accepts a valid one', () => {
    const bad: Deck = { config: {}, slides: [{ layout: 'gallery', items: [{ image: 'a.png', focus: 'center' as never }] }] }
    const good: Deck = { config: {}, slides: [{ layout: 'gallery', items: [{ image: 'a.png', focus: { x: 0, y: 0, scale: 1.5 } }] }] }
    expect(analyzeDeck(bad).issues.some((i) => i.message.includes('malformed focus'))).toBe(true)
    expect(analyzeDeck(good).issues.filter((i) => i.kind === 'schema')).toHaveLength(0)
  })

  it('accepts a gallery imageFit, and flags values that are not cover or contain', () => {
    const ok: Deck = { config: {}, slides: [{ layout: 'gallery', imageFit: 'contain', items: [{ image: 'a.png', fit: 'cover' }] }] }
    const bad: Deck = { config: {}, slides: [{ layout: 'gallery', imageFit: 'fill' as never, items: [{ image: 'a.png', fit: 'stretch' as never }] }] }
    expect(analyzeDeck(ok).issues.filter((i) => i.kind === 'schema')).toHaveLength(0)
    const msgs = analyzeDeck(bad).issues.map((i) => i.message)
    expect(msgs).toContain('imageFit must be cover or contain.')
    expect(msgs).toContain('Gallery item fit must be cover or contain.')
  })

  describe('gallery size and crop (Review)', () => {
    const sized = (w: number, h: number) => ({ naturalSize: () => ({ w, h }) })
    const gallery = (n: number, extra: Partial<Deck['slides'][number]> = {}): Deck => ({
      config: {},
      slides: [{ layout: 'gallery', title: 'T', items: Array.from({ length: n }, (_, i) => ({ image: `p${i}.png`, label: `${i}` })), ...extra }],
    })

    it('warns when pictures come out too small to judge', () => {
      // nine labelled squares: 193×171 each, under the ~250×140 floor
      const issues = analyzeDeck(gallery(9), undefined, sized(500, 500)).issues
      expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'warning', kind: 'review', message: expect.stringContaining('9 gallery pictures show as small as 193×171') })]))
    })

    it('gives the room back with badges: the same nine pass as overlay labels', () => {
      const issues = analyzeDeck(gallery(9, { labelPos: 'overlay' }), undefined, sized(500, 500)).issues
      expect(issues.some((i) => i.message.includes('too small'))).toBe(false)
    })

    it('suggests contain when cover crops away more than about a third', () => {
      // one labelled 4:1 panorama filling a 1060×420 frame: 1 − 1060/1680 = 37% cut away
      const issues = analyzeDeck(gallery(1), undefined, sized(4000, 1000)).issues
      expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'info', message: expect.stringContaining('crops away up to 37%') })]))
      const whole = analyzeDeck(gallery(1, { imageFit: 'contain' }), undefined, sized(4000, 1000)).issues
      expect(whole.some((i) => i.message.includes('crops away'))).toBe(false)
    })

    it('counts zoom as cropping, even in contain', () => {
      const d = gallery(1, { imageFit: 'contain', items: [{ image: 'p.png', focus: { x: 0, y: 0, scale: 2 } }] })
      expect(analyzeDeck(d, undefined, sized(1600, 900)).issues.some((i) => i.message.includes('crops away up to 75%'))).toBe(true)
    })

    it('judges nothing without sizes — no guessing', () => {
      expect(analyzeDeck(gallery(9)).issues.some((i) => i.message.includes('too small'))).toBe(false)
    })
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
          table: { rows: [['A', 'B'], ['C', 42]], colWidths: [0.3, 0.7], rowHeights: [0.5, 0.5], font: 'heading', size: 30 },
        },
      ],
    }

    expect(analyzeDeck(deck).issues.filter((i) => i.kind === 'schema')).toHaveLength(0)
  })

  it('warns about a table slide with no grid', () => {
    const deck: Deck = { config: {}, slides: [{ layout: 'table', title: 'Empty' }] }

    expect(analyzeDeck(deck).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'schema', field: 'table' })]),
    )
  })

  // Highest-priority case: this is the exact regression class that once let the
  // Review panel offer to delete an image that was still in use by a slide.
  it('does not orphan a table cell image', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'table', table: { rows: [[{ image: '/Deck Assets/cell.jpg' }, '']] } }],
    }

    const a = analyzeDeck(deck, ['cell.jpg'])

    expect(a.assets.some((x) => x.kind === 'orphan')).toBe(false)
    expect(a.assets.some((x) => x.uses.some((u) => u.field === 'table.rows[0][0].image'))).toBe(true)
  })

  it('reports a table cell image as orphaned once the cell is removed', () => {
    // The inverse: proves the shrink confirm-dialog's premise. A second slide
    // keeps a live local reference so this isn't mistaken for the "deck
    // references no local files" empty-folder guard.
    const deck: Deck = {
      config: {},
      slides: [
        { layout: 'table', table: { rows: [['']] } },
        { layout: 'image-full', image: '/Deck Assets/kept.jpg' },
      ],
    }

    const a = analyzeDeck(deck, ['cell.jpg', 'kept.jpg'])

    expect(a.assets.filter((x) => x.kind === 'orphan').map((x) => x.filename)).toEqual(['cell.jpg'])
  })

  // Same regression class, one nesting level deeper: once a table is baked to
  // freeform its pictures live in elements[].table.
  it('does not orphan an image inside a canvas table element', () => {
    const deck: Deck = {
      config: {},
      slides: [
        {
          layout: 'freeform',
          elements: [{ type: 'table', x: 0, y: 0, w: 100, h: 100, rotation: 0, table: { rows: [[{ image: '/Deck Assets/baked.jpg' }, '']] } }],
        },
      ],
    }

    const a = analyzeDeck(deck, ['baked.jpg'])

    expect(a.assets.some((x) => x.kind === 'orphan')).toBe(false)
    expect(a.assets.some((x) => x.uses.some((u) => u.field === 'elements[0].table.rows[0][0].image'))).toBe(true)
  })

  it('accepts both video flavors without a "field isn\'t rendered" warning', () => {
    const deck: Deck = {
      config: {},
      slides: [
        { layout: 'video-embed', video: 'https://youtu.be/x', caption: 'c' },
        { layout: 'video-embed', video: 'https://youtu.be/y', videoFit: 'full' },
      ],
    }

    expect(analyzeDeck(deck).issues.filter((i) => i.kind === 'schema')).toHaveLength(0)
  })

  it('skips covered (merge-placeholder) cells when collecting table assets', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'table', table: { rows: [[{ image: '/Deck Assets/a.jpg', colspan: 2 }, null]] } }],
    }

    expect(analyzeDeck(deck, ['a.jpg']).assets.filter((x) => x.kind !== 'orphan')).toHaveLength(1)
  })

  // ── stash ──
  // A layout switch parks what the target can't show in `stash`, and switching
  // back restores it. Those parked images ARE in use; the scan used to skip
  // stash entirely, so the Review panel offered to delete them.

  it('does not orphan an image parked in stash by a layout switch', () => {
    const deck: Deck = {
      config: {},
      slides: [{ layout: 'text', title: 'Was an image slide', content: '- a', stash: { image: '/Deck Assets/parked.jpg' } }],
    }

    const a = analyzeDeck(deck, ['parked.jpg'])

    expect(a.assets.some((x) => x.kind === 'orphan')).toBe(false)
    expect(a.assets.some((x) => x.uses.some((u) => u.field === 'stash.image'))).toBe(true)
  })

  it('does not orphan table, gallery, or canvas images parked in stash', () => {
    const deck: Deck = {
      config: {},
      slides: [
        {
          layout: 'text',
          title: 'T',
          content: '- a',
          stash: {
            table: { rows: [[{ image: '/Deck Assets/cell.jpg' }]] },
            items: ['/Deck Assets/g.jpg'],
            elements: [{ type: 'box', x: 0, y: 0, w: 10, h: 10, rotation: 0, src: '/Deck Assets/box.jpg' }],
          },
        },
      ],
    }

    const a = analyzeDeck(deck, ['cell.jpg', 'g.jpg', 'box.jpg'])

    expect(a.assets.filter((x) => x.kind === 'orphan')).toEqual([])
  })
})
