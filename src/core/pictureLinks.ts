// Pictures on a slide that can carry a link — the single layout image,
// gallery pictures, table-cell pictures (layout table or canvas table) and
// canvas boxes — addressed uniformly, so "read the QR code in this picture and
// link it" works the same wherever the picture sits. Speaker portraits and
// video posters have no link field and are left out.
import type { BoxElement, Slide, TableElement } from './types'
import { galleryItemsOf, setGalleryLink } from './gallery'
import { setTableCell, tableShape } from './table'

export type PictureRef =
  | { kind: 'image' }
  | { kind: 'gallery'; index: number }
  | { kind: 'table'; cell: number; el?: number }
  | { kind: 'box'; el: number }

export interface Picture {
  ref: PictureRef
  src: string
  link?: string
}

export function slidePictures(slide: Slide): Picture[] {
  const out: Picture[] = []
  if (slide.image) out.push({ ref: { kind: 'image' }, src: slide.image, link: slide.imageLink })
  if (slide.layout === 'gallery') {
    galleryItemsOf(slide.items).forEach((it, index) => {
      if (it.image) out.push({ ref: { kind: 'gallery', index }, src: it.image, link: it.link })
    })
  }
  const cells = (table: Slide['table'], el?: number) =>
    tableShape(table).cells.forEach((c, cell) => {
      if (c.image && !c.covered) out.push({ ref: { kind: 'table', cell, ...(el != null ? { el } : {}) }, src: c.image, link: c.link })
    })
  if (slide.table) cells(slide.table)
  slide.elements?.forEach((e, el) => {
    if (e.type === 'box' && (e as BoxElement).src) out.push({ ref: { kind: 'box', el }, src: (e as BoxElement).src!, link: (e as BoxElement).link })
    if (e.type === 'table') cells((e as TableElement).table, el)
  })
  return out
}

/** The slide with `link` set on the picture `ref` points at (unchanged if it
 *  points at nothing). Returns a patch for the fields that changed. */
export function pictureLinkPatch(slide: Slide, ref: PictureRef, link: string): Partial<Slide> | null {
  switch (ref.kind) {
    case 'image':
      return slide.image ? { imageLink: link } : null
    case 'gallery':
      return galleryItemsOf(slide.items)[ref.index] ? { items: setGalleryLink(slide.items, ref.index, link) } : null
    case 'table': {
      if (ref.el == null) return slide.table ? { table: setTableCell(slide.table, ref.cell, { link }) } : null
      const el = slide.elements?.[ref.el]
      if (el?.type !== 'table') return null
      const table = setTableCell((el as TableElement).table, ref.cell, { link })
      return { elements: slide.elements!.map((e, i) => (i === ref.el ? ({ ...e, table } as TableElement) : e)) }
    }
    case 'box': {
      const el = slide.elements?.[ref.el]
      if (el?.type !== 'box') return null
      return { elements: slide.elements!.map((e, i) => (i === ref.el ? ({ ...e, link } as BoxElement) : e)) }
    }
  }
}
