// Locks the bake-to-freeform geometry contract (#18): bakeToElements mirrors the
// pixel numbers in src/styles/slide.css, and nothing else catches drift between
// the two. These assertions pin the load-bearing constants — heading 64/1.05,
// body 26/1.45, 280px portraits, the text-image column split — so an accidental
// change to bake.ts (or a CSS tweak that isn't mirrored here) fails a test
// instead of silently shifting every baked slide.
import { describe, expect, it } from 'vitest'
import { bakeToElements } from './bake'
import type { BoxElement, Slide, SlideElement } from './types'

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

  it('carries a gallery cell link onto its baked box', () => {
    const els = bakeToElements({
      layout: 'gallery',
      items: [{ image: 'g.png', link: 'https://y.io' }],
    })
    const img = boxes(els).find((b) => b.src === 'g.png')!
    expect(img.link).toBe('https://y.io')
  })

  it('produces finite geometry for every layout, even with empty fields', () => {
    const layouts: Slide['layout'][] = [
      'cover', 'section', 'statement', 'speaker', 'text', 'text-image',
      'image-full', 'image-caption', 'video-embed', 'gallery', 'diagram',
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
