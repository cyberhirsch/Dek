// Gallery item edits, kept pure so they can be tested. The rule every one of
// them follows: change only the field being edited and keep everything else on
// every item — a rebuild from a subset of fields once stripped the link from
// every cell of a gallery whenever a single picture was replaced.

import type { GalleryItem, Slide } from './types'
import { BASE } from '../tokens'

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

/** The grid's box on the 1280×720 stage: inside the layout padding, below the
 *  title when there is one. The same numbers bake uses, so an `auto` column
 *  choice made here is the one bake and export make. */
export function galleryBox(hasTitle: boolean): { w: number; h: number } {
  const w = BASE.stage.w - BASE.pad.x * 2
  const h = BASE.stage.h - BASE.pad.y * 2 - (hasTitle ? GALLERY_TITLE_H + GALLERY_TITLE_GAP : 0)
  return { w, h }
}

/**
 * The column count that shows the pictures largest. For each count, every
 * picture is fitted whole into its cell; a count scores by its SMALLEST fitted
 * picture, because one postage stamp in a gallery is the failure worth
 * avoiding. A near-tie (within 1%) goes to fewer rows; with the rows equal,
 * to fewer columns — 2×2 rather than 3 + 1 when the pictures come out the
 * same size, since that leaves no empty cells. `aspects` are width/height.
 */
export function bestColumns(aspects: number[], box: { w: number; h: number }, gap: number, labelH: number): number {
  const n = aspects.length
  if (n <= 1) return 1
  let best = 1
  let bestScore = -1
  let bestRows = Infinity
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c)
    const cw = (box.w - gap * (c - 1)) / c
    const ch = (box.h - gap * (rows - 1)) / rows - labelH
    if (cw <= 0 || ch <= 0) continue
    const score = Math.min(...aspects.map((a) => {
      const w = Math.min(cw, ch * a)
      return w * (w / a)
    }))
    const clearlyBetter = score > bestScore * 1.01
    const tieWithFewerRows = score >= bestScore * 0.99 && rows < bestRows
    if (clearlyBetter || tieWithFewerRows) {
      best = c
      bestRows = rows
      bestScore = Math.max(bestScore, score)
    }
  }
  return best
}

/**
 * The gallery's column count: an explicit `columns`, else `auto`. With every
 * picture's shape known, `auto` picks by `bestColumns`; until then it falls
 * back to up to three, and re-lays out once the shapes arrive.
 */
export function galleryColumns(
  columns: Slide['columns'],
  n: number,
  fit?: { aspects: Array<number | undefined>; box: { w: number; h: number }; labelRow: boolean },
): number {
  if (typeof columns === 'number' && columns > 0) return Math.floor(columns)
  if (fit && n > 0 && fit.aspects.length === n && fit.aspects.every((a) => a != null && a > 0)) {
    return bestColumns(fit.aspects as number[], fit.box, GALLERY_GAP, fit.labelRow ? GALLERY_LABEL_H + GALLERY_LABEL_GAP : 0)
  }
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
