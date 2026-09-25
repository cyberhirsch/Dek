// Locks the bake-to-freeform geometry contract (#18): bakeToElements mirrors the
// pixel numbers in src/styles/slide.css, and nothing else catches drift between
// the two. These assertions pin the load-bearing constants — heading 64/1.05,
// body 26/1.45, 280px portraits, the text-image column split — so an accidental
// change to bake.ts (or a CSS tweak that isn't mirrored here) fails a test
// instead of silently shifting every baked slide.
import { describe, expect, it } from 'vitest'
import { bakeToElements } from './bake'
import type { BoxElement, Slide, SlideElement, TableElement } from './types'

const boxes = (els: SlideElement[]) => els.filter((e): e is BoxElement => e.type === 'box')
const withContent = (els: SlideElement[], text: string) =>
  boxes(els).find((b) => b.content === text)
const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n)

describe('bakeToElements geometry contract', () => {
  it('bakes a heading with the CSS heading look (Cormorant italic 300, 64/1.05)', () => {
    const els = bakeToElements({ layout: 'text', title: 'Heading', content: '- one' })
    const h = withContent(els, 'Heading')!
    expect(h).toBeDefined()
    expect(h.font).toBe('heading')
    expect(h.italic).toBe(true)
    expect(h.weight).toBe(300)
    expect(h.size).toBe(64)
    expect(h.lineHeight).toBe(1.05)
  })

  it('bakes body text at 26/1.45 with the 18px list gap in em', () => {
    const els = bakeToElements({ layout: 'text', title: 'T', content: '- a\n- b' })
    const body = withContent(els, '- a\n- b')!
    expect(body.size).toBe(26)
    expect(body.lineHeight).toBe(1.45)
    expect(body.lineGap).toBeCloseTo(18 / 26, 2)
  })

  it('bakes speaker portraits as 280×280 boxes', () => {
    const els = bakeToElements({ layout: 'speaker', name: 'Ada', portraits: ['/a.jpg', '/b.jpg'] })
    const imgs = boxes(els).filter((b) => b.src)
    expect(imgs).toHaveLength(2)
    for (const im of imgs) {
      expect(im.w).toBe(280)
      expect(im.h).toBe(280)
    }
    // portraits sit left-to-right with a 24px gap: 280 + 24 apart
    expect(imgs[1].x - imgs[0].x).toBe(280 + 24)
  })

  it('centres the statement column at 1000px wide', () => {
    const els = bakeToElements({ layout: 'statement', text: 'A bold claim.' })
    const t = withContent(els, 'A bold claim.')!
    expect(t.size).toBe(56)
    expect(t.align).toBe('center')
    // 1000px visual width, grown by the (10px) text inset on each side
    expect(t.w).toBe(1000 + 20)
  })

  it('drops the text-image body to 21px on a 16:9 image but keeps 26px on 1:1', () => {
    const wide = bakeToElements({ layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg', imageRatio: '16:9' })
    const square = bakeToElements({ layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg', imageRatio: '1:1' })
    expect(withContent(wide, '- x')!.size).toBe(21)
    expect(withContent(square, '- x')!.size).toBe(26)
  })

  it('bakes an optional text-image caption as a box under the image', () => {
    const withCap = bakeToElements({ layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg', caption: 'Fig 1. A credit' })
    const cap = withContent(withCap, 'Fig 1. A credit')
    expect(cap).toBeDefined()
    expect(cap!.size).toBe(18)
    const img = boxes(withCap).find((b) => b.src)!
    // caption sits below the image's bottom edge and clears the stage floor
    expect(cap!.y).toBeGreaterThanOrEqual(img.y + img.h)
    expect(cap!.y + cap!.h).toBeLessThanOrEqual(720)
    // no caption field → no caption box at all
    const noCap = bakeToElements({ layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg' })
    expect(withContent(noCap, 'Fig 1. A credit')).toBeUndefined()
    // the caption doesn't shrink the image — the frame keeps its full height
    // whether or not a caption is present (the caption sits in the bottom margin)
    const tallCap = bakeToElements({ layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg', imageRatio: '9:16', caption: 'c' })
    const tallNo = bakeToElements({ layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg', imageRatio: '9:16' })
    expect(boxes(tallCap).find((b) => b.src)!.h).toBe(boxes(tallNo).find((b) => b.src)!.h)
  })

  it('respects the image side: text and image swap columns', () => {
    const right = bakeToElements({ layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg', side: 'right' })
    const left = bakeToElements({ layout: 'text-image', title: 'T', content: '- x', image: '/i.jpg', side: 'left' })
    const textR = withContent(right, '- x')!
    const imgR = boxes(right).find((b) => b.src)!
    const textL = withContent(left, '- x')!
    const imgL = boxes(left).find((b) => b.src)!
    // right layout: text on the left of the image; left layout: the reverse
    expect(textR.x).toBeLessThan(imgR.x)
    expect(textL.x).toBeGreaterThan(imgL.x)
  })

  it('makes image-full a full-bleed 1280×720 image carrying its focus', () => {
    const focus = { x: 0.2, y: 0.3, scale: 1.4 }
    const els = bakeToElements({ layout: 'image-full', image: '/i.jpg', focus })
    const img = boxes(els).find((b) => b.src)!
    expect([img.x, img.y, img.w, img.h]).toEqual([0, 0, 1280, 720])
    expect(img.focus).toEqual(focus)
  })

  it('returns a freeform slide’s own elements untouched (already a canvas)', () => {
    const el: SlideElement = { type: 'box', x: 10, y: 10, w: 100, h: 40, rotation: 0, content: 'hi' }
    const slide: Slide = { layout: 'freeform', elements: [el] }
    const out = bakeToElements(slide)
    expect(out).toEqual([el])
    expect(out).not.toBe(slide.elements) // a copy, not the same array
  })

  it('carries a layout image link onto the baked box (so export links work)', () => {
    const els = bakeToElements({ layout: 'image-full', image: 'a.png', imageLink: 'https://x.io' })
    const img = boxes(els).find((b) => b.src === 'a.png')!
    expect(img.link).toBe('https://x.io')
  })

  it('carries invert/desaturate onto the baked box (so bake-to-freeform preserves the filter)', () => {
    const els = bakeToElements({ layout: 'image-full', image: 'a.png', imageInvert: true, imageDesaturate: true })
    const img = boxes(els).find((b) => b.src === 'a.png')!
    expect(img.invert).toBe(true)
    expect(img.desaturate).toBe(true)
  })

  it('never places a gallery cell outside the stage — any count, columns, title, labels', () => {
    for (let n = 1; n <= 9; n++) {
      for (const columns of [1, 2, 3, 4, 5, 'auto'] as const) {
        for (const title of ['', 'A Title']) {
          for (const label of [undefined, 'Label']) {
            const items = Array.from({ length: n }, (_, i) => ({ image: `p${i}.png`, label }))
            for (const b of boxes(bakeToElements({ layout: 'gallery', title, columns, items }))) {
              expect(b.x).toBeGreaterThanOrEqual(0)
              expect(b.y).toBeGreaterThanOrEqual(0)
              expect(b.x + b.w, `${n} × cols ${columns}`).toBeLessThanOrEqual(1280)
              expect(b.y + b.h, `${n} × cols ${columns}, title "${title}", label ${label}`).toBeLessThanOrEqual(720)
            }
          }
        }
      }
    }
  })

  it('draws overlay labels as badges on the picture, giving the label row back', () => {
    const items = [{ image: 'a.png', label: '1' }, { image: 'b.png', label: '2' }]
    const below = bakeToElements({ layout: 'gallery', items })
    const badge = bakeToElements({ layout: 'gallery', items, labelPos: 'overlay' })
    const picBelow = boxes(below).find((b) => b.src === 'a.png')!
    const picBadge = boxes(badge).find((b) => b.src === 'a.png')!
    // the picture is taller by exactly the label row it no longer needs
    expect(picBadge.h - picBelow.h).toBe(44 + 10)
    // the label sits inside the picture's top-left corner, as a pill
    const pill = boxes(badge).find((b) => b.content === '1')!
    expect(pill.x).toBe(picBadge.x + 12)
    expect(pill.y).toBe(picBadge.y + 12)
    expect(pill.radius).toBe(20)
    expect(pill.color).toBe('var(--dek-accent)')
  })

  it('bakes a gallery written as bare strings — those used to vanish from export', () => {
    const els = bakeToElements({ layout: 'gallery', items: ['a.png', 'b.png'] as never })
    expect(boxes(els).filter((b) => b.src).map((b) => b.src)).toEqual(['a.png', 'b.png'])
  })

  it("carries each gallery cell's pan/zoom onto its baked box", () => {
    const focus = { x: 12, y: -8, scale: 1.6 }
    const els = bakeToElements({ layout: 'gallery', items: [{ image: 'g.png', focus }, { image: 'h.png' }] })
    expect(boxes(els).find((b) => b.src === 'g.png')!.focus).toEqual(focus)
    expect(boxes(els).find((b) => b.src === 'h.png')!.focus).toBeUndefined()
  })

  it('carries a gallery cell link onto its baked box', () => {
    const els = bakeToElements({
      layout: 'gallery',
      items: [{ image: 'g.png', link: 'https://y.io' }],
    })
    const img = boxes(els).find((b) => b.src === 'g.png')!
    expect(img.link).toBe('https://y.io')
  })

  it('bakes a framed video as a centred 16:9 frame with its caption below', () => {
    const els = bakeToElements({ layout: 'video-embed', video: 'https://youtu.be/x', caption: 'Fig 2.' })
    const vid = els.find((e) => e.type === 'video')!
    expect(vid.w / vid.h).toBeCloseTo(16 / 9, 3)
    expect(vid.x).toBeGreaterThan(0) // inset, not full-bleed
    const cap = withContent(els, 'Fig 2.')!
    expect(cap.y).toBeGreaterThanOrEqual(vid.y + vid.h)
  })

  it('bakes a fullscreen video edge-to-edge and drops the caption', () => {
    const els = bakeToElements({ layout: 'video-embed', video: 'https://youtu.be/x', caption: 'Fig 2.', videoFit: 'full' })
    const vid = els.find((e) => e.type === 'video')!
    expect([vid.x, vid.y, vid.w, vid.h]).toEqual([0, 0, 1280, 720])
    // the stage is itself 16:9, so full-bleed is still 16:9
    expect(vid.w / vid.h).toBeCloseTo(16 / 9, 3)
    // nowhere for a caption to sit on a full-bleed frame
    expect(withContent(els, 'Fig 2.')).toBeUndefined()
  })

  it('bakes a table to ONE table element carrying the same table object', () => {
    // The grid has to survive as a grid: decomposing into per-cell boxes here
    // would make table -> freeform a one-way trip (see the convert.ts
    // round-trip test), and would lose merges, track sizes, and typography.
    const table = { rows: [['A', 'B'], ['C', 42]], colWidths: [0.25, 0.75], font: 'heading', size: 30 }
    const els = bakeToElements({ layout: 'table', title: 'Grid', table })
    const tables = els.filter((e): e is TableElement => e.type === 'table')
    expect(tables).toHaveLength(1)
    expect(tables[0].table).toEqual(table)
    // a copy, not the slide's own object — edits to one can't leak into the other
    expect(tables[0].table).not.toBe(table)
    // the title still bakes as its own heading box above the grid
    const head = withContent(els, 'Grid')!
    expect(head.font).toBe('heading')
    expect(tables[0].y).toBeGreaterThan(head.y)
  })

  it('bakes a table with no title flush to the top padding', () => {
    const els = bakeToElements({ layout: 'table', table: { rows: [['A']] } })
    expect(els).toHaveLength(1)
    expect(els[0].y).toBe(70)
  })

  it('produces finite geometry for every layout, even with empty fields', () => {
    const layouts: Slide['layout'][] = [
      'cover', 'section', 'statement', 'speaker', 'text', 'text-image',
      'image-full', 'image-caption', 'video-embed', 'gallery', 'diagram', 'table',
    ]
    for (const layout of layouts) {
      const els = bakeToElements({ layout })
      for (const e of els) {
        expect(finite(e.x) && finite(e.y) && finite(e.w) && finite(e.h)).toBe(true)
        expect(e.w).toBeGreaterThanOrEqual(0)
        expect(e.h).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
