import { describe, expect, it } from 'vitest'
import { galleryItemsOf, replaceGalleryImage, setGalleryLink } from './gallery'

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
