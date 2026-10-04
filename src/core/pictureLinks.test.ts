import { describe, expect, it } from 'vitest'
import { pictureLinkPatch, slidePictures } from './pictureLinks'
import type { Slide } from './types'

const box = (src?: string, link?: string) =>
  ({ type: 'box', x: 0, y: 0, w: 10, h: 10, rotation: 0, ...(src ? { src } : {}), ...(link ? { link } : {}) }) as never

describe('slidePictures', () => {
  it('finds every picture that can carry a link, with its current link', () => {
    const slide = {
      layout: 'gallery',
      items: [{ image: 'a.png', link: 'https://a.io' }, 'b.png'],
      elements: [box('c.png'), box(), { type: 'table', x: 0, y: 0, w: 1, h: 1, rotation: 0, table: { rows: [[{ image: 'd.png' }, 'x']] } }],
    } as unknown as Slide
    expect(slidePictures(slide)).toEqual([
      { ref: { kind: 'gallery', index: 0 }, src: 'a.png', link: 'https://a.io' },
      { ref: { kind: 'gallery', index: 1 }, src: 'b.png', link: undefined },
      { ref: { kind: 'box', el: 0 }, src: 'c.png', link: undefined },
      { ref: { kind: 'table', cell: 0, el: 2 }, src: 'd.png', link: undefined },
    ])
  })

  it('leaves out speaker portraits, which have nowhere to keep a link', () => {
    expect(slidePictures({ layout: 'speaker', portraits: ['p.png'] } as Slide)).toEqual([])
  })
})

describe('pictureLinkPatch', () => {
  it('links the single layout image', () => {
    expect(pictureLinkPatch({ layout: 'image-full', image: 'a.png' } as Slide, { kind: 'image' }, 'https://x.io')).toEqual({
      imageLink: 'https://x.io',
    })
  })

  it('links a gallery picture, keeping the others', () => {
    const p = pictureLinkPatch({ layout: 'gallery', items: ['a.png', 'b.png'] } as Slide, { kind: 'gallery', index: 1 }, 'https://x.io')
    expect(p?.items).toEqual([{ image: 'a.png' }, { image: 'b.png', link: 'https://x.io' }])
  })

  it('links a table cell picture, in a layout table and on the canvas', () => {
    const t = { rows: [[{ image: 'a.png' }]] }
    expect(pictureLinkPatch({ layout: 'table', table: t } as Slide, { kind: 'table', cell: 0 }, 'https://x.io')?.table?.rows).toEqual([
      [{ image: 'a.png', link: 'https://x.io' }],
    ])
    const s = { layout: 'freeform', elements: [{ type: 'table', x: 0, y: 0, w: 1, h: 1, rotation: 0, table: t }] } as unknown as Slide
    const els = pictureLinkPatch(s, { kind: 'table', cell: 0, el: 0 }, 'https://x.io')?.elements as unknown as { table: typeof t }[]
    expect(els[0].table.rows).toEqual([[{ image: 'a.png', link: 'https://x.io' }]])
  })

  it('links a canvas box picture', () => {
    const s = { layout: 'freeform', elements: [box('a.png')] } as unknown as Slide
    expect((pictureLinkPatch(s, { kind: 'box', el: 0 }, 'https://x.io')?.elements as unknown as { link: string }[])[0].link).toBe('https://x.io')
  })

  it('does nothing when the reference points at nothing', () => {
    expect(pictureLinkPatch({ layout: 'text' } as Slide, { kind: 'image' }, 'https://x.io')).toBeNull()
    expect(pictureLinkPatch({ layout: 'text' } as Slide, { kind: 'box', el: 3 }, 'https://x.io')).toBeNull()
  })
})
