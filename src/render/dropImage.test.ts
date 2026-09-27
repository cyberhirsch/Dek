import { describe, expect, it } from 'vitest'
import { droppedImage, fileNameFor, imageUrlFromHtml } from './dropImage'

/** A stand-in DataTransfer: just the parts droppedImage reads. */
function dt(data: Record<string, string>, files: File[] = []): DataTransfer {
  return { files, getData: (t: string) => data[t] ?? '' } as unknown as DataTransfer
}

describe('imageUrlFromHtml', () => {
  it('finds the picture in dragged HTML, whatever the quoting', () => {
    expect(imageUrlFromHtml('<a href="https://x.io/page"><img alt="a" src="https://x.io/p.jpg?w=1&amp;h=2"></a>')).toBe(
      'https://x.io/p.jpg?w=1&h=2',
    )
    expect(imageUrlFromHtml("<img src='https://x.io/a.png'>")).toBe('https://x.io/a.png')
    expect(imageUrlFromHtml('<img src=https://x.io/b.png>')).toBe('https://x.io/b.png')
  })

  it('does not read data-src or similar attributes as the source', () => {
    expect(imageUrlFromHtml('<img data-src="https://x.io/lazy.png" src="https://x.io/real.png">')).toBe('https://x.io/real.png')
  })

  it('is undefined without an <img>', () => {
    expect(imageUrlFromHtml('<p>hi</p>')).toBeUndefined()
  })
})

describe('droppedImage', () => {
  it('prefers a dropped image file', () => {
    const f = new File(['x'], 'a.png', { type: 'image/png' })
    expect(droppedImage(dt({ 'text/uri-list': 'https://x.io/a.png' }, [f])).file).toBe(f)
  })

  it('takes the <img> over the uri-list, which is the surrounding link', () => {
    const d = droppedImage(
      dt({ 'text/html': '<a href="https://x.io/article"><img src="https://cdn.x.io/pic.webp"></a>', 'text/uri-list': 'https://x.io/article' }),
    )
    expect(d.url).toBe('https://cdn.x.io/pic.webp')
  })

  it('accepts a bare link only when it names a picture file', () => {
    expect(droppedImage(dt({ 'text/uri-list': 'https://x.io/pic.JPG?x=1' })).url).toBe('https://x.io/pic.JPG?x=1')
    expect(droppedImage(dt({ 'text/uri-list': 'https://x.io/article' })).url).toBeUndefined()
  })

  it('never follows a script or file URL', () => {
    expect(droppedImage(dt({ 'text/html': '<img src="javascript:alert(1)">' })).url).toBeUndefined()
  })
})

describe('fileNameFor', () => {
  it("names the file after the URL, with the extension of what was sent", () => {
    expect(fileNameFor('https://x.io/img/Horizon%20Shot.jpg?w=800', 'image/webp')).toBe('Horizon-Shot.webp')
    expect(fileNameFor('https://x.io/', 'image/png')).toBe('image.png')
    expect(fileNameFor('data:image/png;base64,AAA', 'image/png')).toBe('image.png')
  })
})
