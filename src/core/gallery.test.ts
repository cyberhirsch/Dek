import { describe, expect, it } from 'vitest'
import { GALLERY_GAP, GALLERY_LABEL_GAP, GALLERY_LABEL_H, galleryCells, galleryColumns, galleryItemsOf, replaceGalleryImage, setGalleryLink } from './gallery'

const focus = { x: 10, y: 0, scale: 1.5 }

describe('replaceGalleryImage', () => {
  it('keeps every other cell exactly as it was — links included', () => {
    // The regression: replacing one picture rebuilt every item from image +
    // label only, stripping the link from every cell in the gallery.
    const items = [
      { image: 'a.png', label: 'A', link: 'https://a.io', focus },
      { image: 'b.png', link: 'https://b.io' },
    ]
    expect(replaceGalleryImage(items, 1, 'new.png')[0]).toEqual(items[0])
  })

  it("resets the replaced cell's pan/zoom but keeps its label and link", () => {
    const out = replaceGalleryImage([{ image: 'a.png', label: 'A', link: 'https://a.io', focus }], 0, 'new.png')
    expect(out).toEqual([{ image: 'new.png', label: 'A', link: 'https://a.io' }])
  })
})

describe('setGalleryLink', () => {
  it("changes only the link — the cell's label and pan/zoom survive", () => {
    const out = setGalleryLink([{ image: 'a.png', label: 'A', focus }], 0, 'https://x.io')
    expect(out).toEqual([{ image: 'a.png', label: 'A', focus, link: 'https://x.io' }])
  })

  it('removes the key entirely when clearing', () => {
    expect(setGalleryLink([{ image: 'a.png', link: 'https://x.io' }], 0, undefined)).toEqual([{ image: 'a.png' }])
  })
})

describe('galleryItemsOf', () => {
  it('turns bare strings into items and drops malformed entries', () => {
    expect(galleryItemsOf(['a.png', { image: 'b.png' }, { text: 'not an image' } as never])).toEqual([
      { image: 'a.png' },
      { image: 'b.png' },
    ])
  })
})

describe('galleryCells — rows share the height', () => {
  it('fits the real repro: four pictures, two columns, labelled, under a title', () => {
    // Week 01, slide 63: needed ~750px of a 474px box before the fix.
    const g = galleryCells(4, 2, { w: 1060, h: 474 }, true)
    expect(g.rows).toBe(2)
    expect(g.cellH * g.rows + GALLERY_GAP * (g.rows - 1)).toBeCloseTo(474, 6)
    expect(g.frameH).toBeCloseTo(g.cellH - GALLERY_LABEL_H - GALLERY_LABEL_GAP, 6)
  })

  it('keeps an explicit column count even beyond the picture count', () => {
    expect(galleryCells(2, 4, { w: 1060, h: 474 }, false).cols).toBe(4)
  })

  it('never yields negative sizes in a tiny box', () => {
    const g = galleryCells(9, 3, { w: 10, h: 10 }, true)
    expect(g.cellW).toBeGreaterThanOrEqual(0)
    expect(g.frameH).toBeGreaterThanOrEqual(0)
  })
})

describe('galleryColumns', () => {
  it('honours an explicit count, and caps auto at three', () => {
    expect(galleryColumns(2, 9)).toBe(2)
    expect(galleryColumns('auto', 2)).toBe(2)
    expect(galleryColumns(undefined, 7)).toBe(3)
  })
})
