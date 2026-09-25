// Gallery item edits, kept pure so they can be tested. The rule every one of
// them follows: change only the field being edited and keep everything else on
// every item — a rebuild from a subset of fields once stripped the link from
// every cell of a gallery whenever a single picture was replaced.

import type { GalleryItem, Slide } from './types'

// ── geometry — ONE source for the live slide, bake, and PPTX export ──────────
// The live grid and bake used to size galleries differently: live rows grew to
// each picture's natural height and ran off the stage, while bake shared the
// height out. They also disagreed on the title (78 vs 67px) and label (62+10 vs
// 43.6px) boxes. Every number below is used by both, so they can't drift.

/** Gap between cells, in stage px. */
export const GALLERY_GAP = 24
/** The label box beneath a picture. The label is shrink-to-fit text, so this
 *  only needs one comfortable line of the 28px label. */
export const GALLERY_LABEL_H = 44
/** Space between a picture and its label. */
export const GALLERY_LABEL_GAP = 10
/** The title box and the space beneath it. */
export const GALLERY_TITLE_H = 78
export const GALLERY_TITLE_GAP = 28

export interface GalleryCells {
  rows: number
  cols: number
  cellW: number
  /** Whole cell, label included. */
  cellH: number
  /** The picture's frame: the cell minus any label row beneath it. */
  frameH: number
}

/**
 * Share a w×h box out between `n` cells in `cols` columns. Rows split the height
 * equally, so the grid can never be taller than its box — whatever the
 * pictures' shapes, however many rows. `labelRow` reserves a label beneath
 * every picture (all or none, so frames in a row line up).
 */
export function galleryCells(n: number, cols: number, box: { w: number; h: number }, labelRow: boolean): GalleryCells {
  // An explicit column count is kept even beyond `n` — an author may set
  // `columns: 4` on a two-picture slide to match cell sizes across slides.
  const c = Math.max(1, Math.floor(cols) || 1)
  const rows = Math.max(1, Math.ceil(n / c))
  const cellW = Math.max(0, (box.w - GALLERY_GAP * (c - 1)) / c)
  const cellH = Math.max(0, (box.h - GALLERY_GAP * (rows - 1)) / rows)
  const frameH = Math.max(0, cellH - (labelRow ? GALLERY_LABEL_H + GALLERY_LABEL_GAP : 0))
  return { rows, cols: c, cellW, cellH, frameH }
}

/** The gallery's column count: an explicit `columns`, else `auto`. */
export function galleryColumns(columns: Slide['columns'], n: number): number {
  if (typeof columns === 'number' && columns > 0) return Math.floor(columns)
  return Math.min(Math.max(1, n), 3)
}

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

/** Set one cell's fit override; `undefined` returns it to the gallery's own. */
export function setGalleryFit(items: Slide['items'], index: number, fit: 'cover' | 'contain' | undefined): GalleryItem[] {
  return galleryItemsOf(items).map((it, i) => {
    if (i !== index) return it
    const { fit: _old, ...rest } = it
    return fit ? { ...rest, fit } : rest
  })
}

/** The fit a gallery picture actually uses: its own override, else the
 *  gallery's `imageFit`, else `cover`. */
export function effectiveFit(item: GalleryItem, imageFit: Slide['imageFit']): 'cover' | 'contain' {
  return item.fit ?? imageFit ?? 'cover'
}

/** The largest rect of a picture's shape that fits inside a box, centred —
 *  what a `contain` frame shrinks to so its border hugs the picture. */
export function containRect(natural: { w: number; h: number }, box: { x: number; y: number; w: number; h: number }) {
  if (!(natural.w > 0 && natural.h > 0 && box.w > 0 && box.h > 0)) return box
  const k = Math.min(box.w / natural.w, box.h / natural.h)
  const w = natural.w * k
  const h = natural.h * k
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h }
}

/** Set or clear (`undefined`) one cell's link, keeping its other fields. */
export function setGalleryLink(items: Slide['items'], index: number, link: string | undefined): GalleryItem[] {
  return galleryItemsOf(items).map((it, i) => {
    if (i !== index) return it
    const { link: _old, ...rest } = it
    return link ? { ...rest, link } : rest
  })
}
