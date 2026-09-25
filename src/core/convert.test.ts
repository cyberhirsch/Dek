import { describe, it, expect } from 'vitest'
import { convertLayout } from './convert'
import type { Slide, BoxElement } from './types'

describe('convertLayout — slot mapping', () => {
  it('reads a statement as text (lede → prose) and parks the cite', () => {
    const stmt: Slide = { layout: 'statement', text: 'A deck is just text.', cite: 'the idea' }
    const text = convertLayout(stmt, 'text')
    expect(text.layout).toBe('text')
    expect(text.content).toBe('A deck is just text.')
    expect(text.title).toBeUndefined()
    // cite has no slot in `text` → kept hidden, not lost
    expect(text.stash?.cite).toBe('the idea')
  })

  it('is reversible: statement → text → statement restores the cite', () => {
    const stmt: Slide = { layout: 'statement', text: 'Big idea.', cite: 'me' }
    const back = convertLayout(convertLayout(stmt, 'text'), 'statement')
    expect(back.layout).toBe('statement')
    expect(back.text).toBe('Big idea.')
    expect(back.cite).toBe('me')
    expect(back.stash).toBeUndefined()
  })

  it('carries heading + prose across text ⇄ text-image', () => {
    const text: Slide = { layout: 'text', title: 'Topic', content: '- a\n- b' }
    const ti = convertLayout(text, 'text-image')
    expect(ti.title).toBe('Topic')
    expect(ti.content).toBe('- a\n- b')
  })
})

describe('convertLayout — canvas elements laid over a layout', () => {
  // The slide that exposed it: a Text layout carrying a QR code as a canvas
  // element. Every layout switch used to delete the element outright.
  const qr: BoxElement = { type: 'box', x: 140, y: 360, w: 280, h: 280, rotation: 0, qr: 'https://modelviewer.dev', link: 'https://modelviewer.dev' }
  const slide: Slide = { layout: 'text', title: 'Scan It', content: '- Scan the code', elements: [qr] }

  it('keeps them, in place, when switching to another layout', () => {
    const ti = convertLayout(slide, 'text-image')
    expect(ti.elements).toEqual([qr])
    expect(ti.title).toBe('Scan It')
  })

  it('keeps them on top of the baked layout when switching to freeform', () => {
    const ff = convertLayout(slide, 'freeform')
    expect(ff.elements!.at(-1)).toEqual(qr)
    // the layout's own content is baked too, underneath
    expect(ff.elements!.some((e) => e.type === 'box' && (e as BoxElement).content === 'Scan It')).toBe(true)
  })

  it('survives a round of switches', () => {
    const back = convertLayout(convertLayout(convertLayout(slide, 'text-image'), 'statement'), 'text')
    expect(back.elements).toEqual([qr])
  })

  it("does not duplicate a freeform slide's own elements — those un-bake into slots", () => {
    const ff: Slide = { layout: 'freeform', elements: [{ type: 'box', x: 0, y: 0, w: 10, h: 10, rotation: 0, content: 'Title' }] }
    const text = convertLayout(ff, 'text')
    expect(text.title).toBe('Title')
    expect(text.elements).toBeUndefined()
  })
})

describe('convertLayout — freeform bake (font fidelity, no doubling)', () => {
  it('bakes a text slide and keeps the heading light + italic (not bold/upright)', () => {
    const text: Slide = { layout: 'text', title: 'Heading', content: 'body' }
    const ff = convertLayout(text, 'freeform')
    expect(ff.layout).toBe('freeform')
    const head = ff.elements!.find((e) => e.type === 'box' && (e as BoxElement).content === 'Heading') as BoxElement
    expect(head.italic).toBe(true)
    expect(head.weight).toBe(300)
    expect(head.bold).toBeFalsy()
  })

  it('converting freeform back to a semantic layout leaves no active elements (no doubling)', () => {
    const text: Slide = { layout: 'text', title: 'H', content: 'B' }
    const ff = convertLayout(text, 'freeform')
    const back = convertLayout(ff, 'text')
    expect(back.layout).toBe('text')
    expect(back.elements).toBeUndefined()
    expect(back.title).toBe('H')
  })
})

describe('convertLayout — best-effort un-bake', () => {
  it('first text box → heading, the rest → prose, and parks leftover canvas', () => {
    const ff: Slide = {
      layout: 'freeform',
      elements: [
        { type: 'box', x: 0, y: 0, w: 100, h: 50, content: 'Title here' },
        { type: 'box', x: 0, y: 60, w: 100, h: 50, content: 'paragraph one' },
        { type: 'arrow', x: 0, y: 200, w: 80, h: 0 },
      ],
    }
    const text = convertLayout(ff, 'text')
    expect(text.title).toBe('Title here')
    expect(text.content).toBe('paragraph one')
    // the arrow has no slot in `text` → parked under stash.elements
    expect(text.stash?.elements?.length).toBe(1)
    expect(text.stash?.elements?.[0].type).toBe('arrow')
  })

  it("keeps each gallery cell's pan/zoom through gallery → freeform → gallery", () => {
    const focus = { x: 20, y: 0, scale: 2 }
    const gal: Slide = { layout: 'gallery', items: [{ image: 'a.png', focus }, { image: 'b.png' }] }
    const back = convertLayout(convertLayout(gal, 'freeform'), 'gallery')
    expect(back.items).toEqual([{ image: 'a.png', focus }, { image: 'b.png' }])
  })

  it('multiple freeform image boxes un-bake into a gallery', () => {
    const ff: Slide = {
      layout: 'freeform',
      elements: [
        { type: 'box', x: 0, y: 0, w: 100, h: 100, src: 'a.png' },
        { type: 'box', x: 110, y: 0, w: 100, h: 100, src: 'b.png' },
      ],
    }
    const gal = convertLayout(ff, 'gallery')
    expect(gal.items?.length).toBe(2)
  })
})

describe('convertLayout — table pooling', () => {
  it('pools gallery items into a one-column table (image + link each)', () => {
    const gal: Slide = { layout: 'gallery', items: [{ image: 'a.png', link: 'https://x.io' }, { image: 'b.png' }] }
    const table = convertLayout(gal, 'table')
    expect(table.layout).toBe('table')
    expect(table.table?.rows).toEqual([[{ image: 'a.png', link: 'https://x.io' }], [{ image: 'b.png' }]])
  })

  it("pools a table's image cells into a gallery, dropping text-only and covered cells", () => {
    const t: Slide = { layout: 'table', table: { rows: [[{ image: 'a.png' }, 'no image', null]] } }
    expect(convertLayout(t, 'gallery').items).toEqual([{ image: 'a.png' }])
  })

  it('pools text bullet lines into one row per line', () => {
    const text: Slide = { layout: 'text', title: 'T', content: '- one\n- two' }
    expect(convertLayout(text, 'table').table?.rows).toEqual([['one'], ['two']])
  })

  it('turns a Markdown pipe table in a text slide into a real grid', () => {
    // Previously each line became one cell of a single column, pipes and the
    // |---| separator included.
    const text: Slide = { layout: 'text', title: 'Tools', content: '| Tool | Share |\n|---|---|\n| Maya | 42 |' }
    const table = convertLayout(text, 'table')
    expect(table.title).toBe('Tools')
    expect(table.table?.rows).toEqual([
      ['Tool', 'Share'],
      ['Maya', 42],
    ])
  })

  it("pools a table's text cells into prose bullet lines", () => {
    const t: Slide = { layout: 'table', table: { rows: [['alpha', 'beta']] } }
    expect(convertLayout(t, 'text').content).toBe('- alpha\n- beta')
  })

  it('keeps the whole table in stash when switching to text, so images survive the round trip', () => {
    // Text can only show the text cells. The table used to be consumed by that
    // lossy projection, and table -> text -> table silently lost every image.
    const t: Slide = {
      layout: 'table',
      table: { rows: [['caption', { image: 'photo.jpg' }]], colWidths: [0.3, 0.7], font: 'heading' },
    }
    const text = convertLayout(t, 'text')
    expect(text.content).toBe('- caption')
    expect(text.stash?.table).toEqual(t.table)

    const back = convertLayout(text, 'table')
    expect(back.table).toEqual(t.table)
  })

  it('round-trips table → freeform → table losslessly (the table-object contract)', () => {
    const table: Slide = {
      layout: 'table',
      title: 'Specs',
      table: {
        rows: [
          [{ text: 'Merged', colspan: 2 }, null],
          [{ image: 'a.jpg', link: 'https://x.io' }, 'plain'],
        ],
        colWidths: [0.3, 0.7],
        rowHeights: [0.4, 0.6],
        font: 'heading',
        size: 30,
      },
    }

    const ff = convertLayout(table, 'freeform')
    expect(ff.elements!.filter((e) => e.type === 'table')).toHaveLength(1)

    const back = convertLayout(ff, 'table')
    expect(back.layout).toBe('table')
    expect(back.table).toEqual(table.table)
    expect(back.title).toBe('Specs')
    expect(back.stash?.elements).toBeUndefined()
  })

  it('un-bakes a hand-placed canvas table into the table layout', () => {
    const ff: Slide = {
      layout: 'freeform',
      elements: [{ type: 'table', x: 0, y: 0, w: 100, h: 100, rotation: 0, table: { rows: [['a', 'b']] } }],
    }
    expect(convertLayout(ff, 'table').table).toEqual({ rows: [['a', 'b']] })
  })
})
