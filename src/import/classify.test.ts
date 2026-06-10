import { describe, it, expect } from 'vitest'
import { classifySlide } from './classify'
import type { Para, TextShape, PicShape, Shape } from './ooxml'

function para(md: string, o: Partial<Para> = {}): Para {
  return { md, bullet: o.bullet ?? false, level: o.level ?? 0, align: o.align, sizePt: o.sizePt ?? 18 }
}
function text(paras: Para[], o: Partial<TextShape> = {}): TextShape {
  return {
    kind: 'text',
    x: o.x ?? 100,
    y: o.y ?? 100,
    w: o.w ?? 1000,
    h: o.h ?? 200,
    ph: o.ph,
    paras,
    plain: paras.map((p) => p.md).join(' '),
  }
}
function pic(o: Partial<PicShape> = {}): PicShape {
  return { kind: 'pic', src: o.src ?? 'data:image/png;base64,AA', x: o.x ?? 100, y: o.y ?? 100, w: o.w ?? 400, h: o.h ?? 300 }
}
const run = (shapes: Shape[], index = 1) => classifySlide(shapes, { index, ptToPx: 1.78 })

describe('classifySlide', () => {
  it('first slide with a title → cover', () => {
    const s = run([text([para('Welcome', { sizePt: 40 })], { ph: 'title' })], 0)
    expect(s.layout).toBe('cover')
    expect(s.title).toBe('Welcome')
  })

  it('lone centred title (not first) → section', () => {
    const s = run([text([para('Part Two', { sizePt: 54, align: 'center' })], { ph: 'title' })], 7)
    expect(s.layout).toBe('section')
    expect(s.title).toBe('Part Two')
  })

  it('quote with attribution → statement + cite', () => {
    const s = run([
      text([
        para('If you are not failing, you are not innovating.', { sizePt: 30, align: 'center' }),
        para('— Woody Allen', { sizePt: 20, align: 'center' }),
      ]),
    ])
    expect(s.layout).toBe('statement')
    expect(s.text).toContain('not innovating')
    expect(s.cite).toBe('Woody Allen')
  })

  it('title + bullets → text', () => {
    const s = run([
      text([para('The Four Freedoms', { sizePt: 32 })], { ph: 'title' }),
      text([para('Run it', { bullet: true }), para('Study it', { bullet: true })], { ph: 'body', y: 320 }),
    ])
    expect(s.layout).toBe('text')
    expect(s.content).toContain('- Run it')
    expect(s.content).toContain('- Study it')
  })

  it('title + body + side image → text-image (side from x)', () => {
    const s = run([
      text([para('Linux', { sizePt: 32 })], { ph: 'title' }),
      text([para('96% of servers', { bullet: true })], { ph: 'body', x: 80, w: 560, y: 300 }),
      pic({ x: 760, y: 200, w: 420, h: 300 }),
    ])
    expect(s.layout).toBe('text-image')
    expect(s.side).toBe('right')
    expect(s.image).toContain('data:image')
  })

  it('full-bleed picture → image-full', () => {
    const s = run([pic({ x: 0, y: 0, w: 1280, h: 720 }), text([para('A caption', { sizePt: 18 })], { y: 640 })])
    expect(s.layout).toBe('image-full')
    expect(s.image).toContain('data:image')
    expect(s.caption).toBe('A caption')
  })

  it('several pictures, no body → gallery', () => {
    const s = run([pic({ x: 100 }), pic({ x: 500 }), pic({ x: 900 })])
    expect(s.layout).toBe('gallery')
    expect((s.items ?? []).length).toBe(3)
  })

  it('single framed image with a short caption, no title → image-caption', () => {
    const s = run([pic({ x: 300, y: 150, w: 680, h: 380 }), text([para('Fig. 1 — the rig', { sizePt: 16 })], { y: 560 })])
    expect(s.layout).toBe('image-caption')
    expect(s.caption).toContain('Fig. 1')
  })

  it('messy slide → freeform with elements', () => {
    const s = run([
      text([para('Heading', { sizePt: 30 })], { ph: 'title' }),
      text([para('left blurb')], { x: 60 }),
      text([para('right blurb')], { x: 700 }),
      pic({ x: 60, y: 400 }),
      pic({ x: 700, y: 400 }),
    ])
    expect(s.layout).toBe('freeform')
    expect((s.elements ?? []).length).toBe(5)
  })

  it('tidies all-caps headings, keeps acronyms', () => {
    const s = run([text([para('FILM AND POSTPRODUKTION VFX', { sizePt: 40 })], { ph: 'title' })], 0)
    expect(s.title).toBe('Film And Postproduktion VFX')
  })

  it('empty slide → empty section', () => {
    const s = run([])
    expect(s.layout).toBe('section')
    expect(s.title).toBe('')
  })
})
