// Gallery item edits, kept pure so they can be tested. The rule every one of
// them follows: change only the field being edited and keep everything else on
// every item — a rebuild from a subset of fields once stripped the link from
// every cell of a gallery whenever a single picture was replaced.

import type { GalleryItem, Slide } from './types'

/** A slide's gallery items as objects: bare strings become `{ image }`, and
 *  anything malformed is dropped. */
export function galleryItemsOf(items: Slide['items']): GalleryItem[] {
  return (items ?? []).flatMap((it): GalleryItem[] => {
    if (typeof it === 'string') return [{ image: it }]
    if (it && typeof it === 'object' && typeof (it as GalleryItem).image === 'string') return [{ ...(it as GalleryItem) }]
    return []
  })
}

/** Put a new picture in one cell. Its pan/zoom resets — the old framing was
 *  for the old picture — while its label and link, and every other cell,
 *  are kept as they were. */
export function replaceGalleryImage(items: Slide['items'], index: number, image: string): GalleryItem[] {
  return galleryItemsOf(items).map((it, i) => {
    if (i !== index) return it
    const { focus: _old, ...rest } = it
    return { ...rest, image }
  })
}

/** Set or clear (`undefined`) one cell's link, keeping its other fields. */
export function setGalleryLink(items: Slide['items'], index: number, link: string | undefined): GalleryItem[] {
  return galleryItemsOf(items).map((it, i) => {
    if (i !== index) return it
    const { link: _old, ...rest } = it
    return link ? { ...rest, link } : rest
  })
}
