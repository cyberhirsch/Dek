// Convert a semantic-layout slide into a freeform canvas of positioned elements.
//
// "Baking" runs when a slide is edited freely (a text box / shape added, or the
// user picks Freeform): the layout's named fields become movable `elements` at
// the positions the layout actually rendered them, so the slide keeps looking
// the same — it's just editable as a canvas now.
//
// Fidelity contract: the numbers here mirror src/styles/slide.css (sizes,
// line-heights, paddings, column splits). If a layout's CSS changes, update the
// matching constants here. Two renderer details make the mirroring exact:
//  - a canvas text box insets its text by ~(10,6)px (rounded-corner padding), so
//    `text()` takes *visual* coordinates and compensates;
//  - boxes carry `lineHeight` / `lineGap` so baked text keeps the CSS rhythm
//    (1.05 headings / 1.45 body / 18px list gaps) instead of the canvas default.

import type { Slide, SlideElement, BoxElement, VideoElement, DiagramElement, CanvasTool, TableData } from './types'
import { BASE } from '../tokens'
import { BOX_DEFAULTS, TEXT_DEFAULTS, ARROW_DEFAULTS } from './defaults'
import { emptyTable } from './table'
import { GALLERY_GAP, GALLERY_LABEL_GAP, GALLERY_LABEL_H, GALLERY_TITLE_GAP, GALLERY_TITLE_H, containRect, effectiveFit, galleryBox, galleryCells, galleryColumns, galleryItemsOf } from './gallery'

/** A gallery label badge (`labelPos: overlay`) — mirrors `.gallery-badge`:
 *  a 40px pill 12px in from the picture's top-left, heading italic 26px in the
 *  accent on a dark translucent fill. Width follows the label, capped at the
 *  cell. Built as a plain box (not `text()`): its size IS the pill, no inset. */
function galleryBadge(label: string, cellX: number, cellY: number, cellW: number): BoxElement {
  const w = Math.min(cellW - 24, Math.max(40, label.length * 26 * 0.5 + 28))
  return {
    type: 'box',
    x: Math.round(cellX + 12),
    y: Math.round(cellY + 12),
    w: Math.round(w),
    h: 40,
    rotation: 0,
    fill: 'rgba(7,8,9,0.72)',
    stroke: 'transparent',
    radius: 20,
    content: label,
    font: 'heading',
    italic: true,
    weight: 300,
    size: 26,
    lineHeight: 1,
    align: 'center',
    valign: 'middle',
    color: 'var(--dek-accent)',
  }
}

/** A deep copy of a table — JSON, not structuredClone, because the slide is
 *  usually a Vue reactive proxy, which structuredClone rejects. Keeps the baked
 *  element from sharing nested arrays with the slide it came from. */
const cloneTable = (t: TableData): TableData => JSON.parse(JSON.stringify(t))

const STAGE_W = BASE.stage.w
const STAGE_H = BASE.stage.h
// dek-pad is `padding: 70px 110px` (slide.css mirrors these token values)
const PAD_X = BASE.pad.x
const PAD_Y = BASE.pad.y
const INNER_W = STAGE_W - PAD_X * 2 // 1060
const INNER_H = STAGE_H - PAD_Y * 2 // 580

// slide.css type constants
const H1 = 64 // .dek-slide h1
const H1_LH = 1.05
const H1_H = Math.round(H1 * H1_LH) // ≈ 67
const BODY = 26 // .dek-slide p, li
const BODY_LH = 1.45
const LIST_GAP = 18 // .dek-list gap

// The canvas text renderer pads text in from the box edge (radius-aware, floor
// 10px x / 6px y). `text()` takes visual coords and grows the box outward so the
// glyphs land exactly where the CSS layout put them.
const INSET_X = 10
const INSET_Y = 6

function text(content: string, visX: number, visY: number, w: number, h: number, extra: Partial<BoxElement> = {}): BoxElement {
  return {
    type: 'box',
    x: Math.round(visX - INSET_X),
    y: Math.round(visY - INSET_Y),
    w: Math.round(w + INSET_X * 2),
    h: Math.round(h + INSET_Y * 2),
    rotation: 0,
    content,
    font: 'body',
    size: BODY,
    lineHeight: BODY_LH,
    ...extra,
  }
}
// A heading box that matches the CSS heading look (Cormorant italic, weight 300,
// tight leading). Passing `bold:true` is intentionally NOT used so the elegant
// light italic survives the bake.
const HEAD: Partial<BoxElement> = { font: 'heading', italic: true, weight: 300, size: H1, lineHeight: H1_LH }
/** Body-list styling: CSS line-height + the 18px list gap expressed in em. */
function listStyle(size = BODY): Partial<BoxElement> {
  return { size, lineHeight: BODY_LH, lineGap: +(LIST_GAP / size).toFixed(2) }
}
// An image is just a box carrying a `src` (transparent fill/stroke), so any box
// can gain or lose a picture later — one element model for shapes, text, images.
function image(src: string, x: number, y: number, w: number, h: number, extra: Partial<BoxElement> = {}): BoxElement {
  return {
    type: 'box',
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    rotation: 0,
    src,
    fit: 'cover',
    fill: 'transparent',
    stroke: 'transparent',
    ...extra,
  }
}

function video(v: string, x: number, y: number, w: number, h: number, poster?: string): VideoElement {
  return { type: 'video', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rotation: 0, video: v, ...(poster ? { poster } : {}) }
}
function diagram(code: string, x: number, y: number, w: number, h: number): DiagramElement {
  return { type: 'diagram', x, y, w, h, rotation: 0, code }
}

// Average glyph advance as a fraction of font size, for wrap estimation
// (Cormorant Garamond italic is a narrow display serif).
const SERIF_RATIO = 0.42
/** Estimated rendered line count of `s` at `size` px wrapped to `maxW`. */
function estLines(s: string, size: number, maxW: number, ratio: number): number {
  const perLine = Math.max(1, Math.floor(maxW / (size * ratio)))
  return s
    .split('\n')
    .reduce((n, ln) => n + Math.max(1, Math.ceil(ln.trim().length / perLine)), 0)
}

/** Build the element list that reproduces a slide's current content. */
/** What bake may know beyond the slide itself. Natural image sizes let a
 *  `contain` gallery picture bake to a box that hugs the picture (so its
 *  border does too); without them it bakes to the full cell. */
export interface BakeOptions {
  naturalSize?: (src: string) => { w: number; h: number } | undefined
}

export function bakeToElements(slide: Slide, opts: BakeOptions = {}): SlideElement[] {
  // Already a canvas — keep whatever elements it has.
  if (slide.layout === 'freeform') return [...(slide.elements ?? [])]

  const els: SlideElement[] = []
  const title = (slide.title ?? '').trim()
  const content = (slide.content ?? '').trim()

  switch (slide.layout) {
    case 'cover': {
      // .l-cover: left-aligned column, vertically centred (mark 220/0.9,
      // sub 48 accent +8, byline 20 +28)
      const markH = estLines(title, 220, INNER_W, SERIF_RATIO) * 220 * 0.9
      const subH = slide.subtitle ? 8 + 48 * 1.2 : 0
      const byH = slide.byline ? 28 + 20 * BODY_LH : 0
      let y = PAD_Y + Math.max(0, (INNER_H - markH - subH - byH) / 2)
      els.push(text(slide.title ?? '', PAD_X, y, INNER_W, markH, { ...HEAD, size: 220, lineHeight: 0.9 }))
      y += markH
      if (slide.subtitle) {
        els.push(text(slide.subtitle, PAD_X, y + 8, INNER_W, 48 * 1.2, { font: 'heading', italic: true, size: 48, lineHeight: 1.2, color: 'var(--dek-accent)' }))
        y += subH
      }
      if (slide.byline) els.push(text(slide.byline, PAD_X, y + 28, INNER_W, 20 * BODY_LH, { size: 20, color: 'rgba(230,236,242,0.7)' }))
      break
    }
    case 'section': {
      // .l-section: centred both ways, h1 at 110
      const h = estLines(title, 110, INNER_W, SERIF_RATIO) * 110 * H1_LH
      const y = PAD_Y + Math.max(0, (INNER_H - h) / 2)
      els.push(text(title, PAD_X, y, INNER_W, h, { ...HEAD, size: 110, align: 'center' }))
      break
    }
    case 'statement': {
      // .l-statement: 56/1.25 serif capped at 1000px wide, centred; cite +28
      const W = 1000
      const body = (slide.text ?? '').trim()
      const textH = estLines(body, 56, W, SERIF_RATIO) * 56 * 1.25
      const citeH = slide.cite ? 28 + 22 * BODY_LH : 0
      const y = PAD_Y + Math.max(0, (INNER_H - textH - citeH) / 2)
      els.push(text(body, (STAGE_W - W) / 2, y, W, textH, { ...HEAD, size: 56, lineHeight: 1.25, align: 'center' }))
      if (slide.cite) els.push(text(`— ${slide.cite}`, PAD_X, y + textH + 28, INNER_W, 22 * BODY_LH, { size: 22, align: 'center', color: 'rgba(230,236,242,0.6)' }))
      break
    }
    case 'speaker': {
      // .l-speaker: left-aligned, vertically centred. 280px portraits (gap 24,
      // +36 below), h1 name, role 24 +10.
      const portraits = (slide.portraits ?? []).filter(Boolean)
      const PW = 280
      const pBlock = portraits.length ? PW + 36 : 0
      const nameH = slide.name ? H1_H : 0
      const roleH = slide.role ? 10 + 24 * BODY_LH : 0
      let y = PAD_Y + Math.max(0, (INNER_H - pBlock - nameH - roleH) / 2)
      portraits.forEach((p, i) => els.push(image(p, PAD_X + i * (PW + 24), y, PW, PW, { radius: 8 })))
      if (portraits.length) y += pBlock
      if (slide.name) {
        els.push(text(slide.name, PAD_X, y, INNER_W, nameH, { ...HEAD }))
        y += nameH
      }
      if (slide.role) els.push(text(slide.role, PAD_X, y + 10, INNER_W, 24 * BODY_LH, { size: 24, color: 'rgba(230,236,242,0.75)' }))
      break
    }
    case 'text': {
      // .l-text: h1 + 16px pad + hairline rule + 36px, then the list
      let y = PAD_Y
      if (title) {
        els.push(text(title, PAD_X, y, INNER_W, H1_H, { ...HEAD }))
        // the h1's border-bottom, kept as a thin box so the look survives
        els.push({ type: 'box', x: PAD_X, y: y + H1_H + 16, w: INNER_W, h: 1, rotation: 0, fill: 'rgba(230,236,242,0.12)', stroke: 'transparent' })
        y += H1_H + 16 + 36
      }
      els.push(text(content, PAD_X, y, INNER_W, STAGE_H - PAD_Y - y, listStyle()))
      break
    }
    case 'text-image': {
      // .l-text-image: h1 +24, then a 2-col grid (gap 32) whose split and body
      // size depend on the image ratio — mirrors the ratio-* rules in slide.css.
      const left = (slide.side ?? 'right') === 'left'
      const ratio = slide.imageRatio ?? '16:9'
      const GAP = 32
      const avail = INNER_W - GAP
      let textW: number, colW: number, imgW: number, imgH: number, bodySize: number
      if (ratio === '16:9') {
        textW = avail / 3.4 // 1fr : 2.4fr ≈ 302
        colW = avail - textW // ≈ 726
        imgW = colW
        imgH = (colW * 9) / 16
        bodySize = 21
      } else if (ratio === '9:16') {
        textW = (avail * 1.9) / 2.9
        colW = avail - textW
        imgH = 460
        imgW = Math.min(colW, (460 * 9) / 16)
        bodySize = BODY
      } else {
        textW = avail / 2
        colW = avail - textW
        imgH = Math.min(460, colW)
        imgW = imgH
        bodySize = BODY
      }
      let y = PAD_Y
      if (title) {
        els.push(text(title, PAD_X, y, INNER_W, H1_H, { ...HEAD }))
        y += H1_H + 24
      }
      const colH = STAGE_H - PAD_Y - y
      const textX = left ? PAD_X + colW + GAP : PAD_X
      const imgX = left ? PAD_X : PAD_X + textW + GAP // image pinned to its column's left
      // The image keeps its full height; an optional caption sits just below it,
      // in the bottom margin (there's ~PAD_Y of room under the column).
      const drawnImgH = Math.min(imgH, colH)
      if (slide.image) els.push(image(slide.image, imgX, y, imgW, drawnImgH, { focus: slide.focus, radius: 12, stroke: 'rgba(230,236,242,0.1)', strokeWidth: 1, link: slide.imageLink, invert: slide.imageInvert, desaturate: slide.imageDesaturate }))
      if (slide.caption) els.push(text(slide.caption, imgX, y + drawnImgH + 12, imgW, Math.round(18 * BODY_LH), { size: 18, color: 'rgba(230,236,242,0.85)' }))
      els.push(text(content, textX, y, textW, colH, listStyle(bodySize)))
      break
    }
    case 'image-full': {
      // full-bleed image; overlay text bottom-anchored inside the pad
      if (slide.image) els.push(image(slide.image, 0, 0, STAGE_W, STAGE_H, { focus: slide.focus, link: slide.imageLink, invert: slide.imageInvert, desaturate: slide.imageDesaturate }))
      const capH = slide.caption ? 22 * BODY_LH : 0
      let bottom = STAGE_H - PAD_Y
      if (slide.caption) {
        els.push(text(slide.caption, PAD_X, bottom - capH, INNER_W, capH, { size: 22, color: 'rgba(230,236,242,0.85)' }))
        bottom -= capH + 8
      }
      if (slide.title) els.push(text(slide.title, PAD_X, bottom - H1_H, INNER_W, H1_H, { ...HEAD }))
      break
    }
    case 'image-caption': {
      // .l-image-caption: frame inset 60px, caption chip 80px into a corner
      if (slide.image) els.push(image(slide.image, 60, 60, STAGE_W - 120, STAGE_H - 120, { fit: 'contain', focus: slide.focus, radius: 12, link: slide.imageLink, invert: slide.imageInvert, desaturate: slide.imageDesaturate }))
      if (slide.caption) {
        const pos = slide.captionPos ?? 'bottom-right'
        const capH = 18 * BODY_LH
        const y = pos.startsWith('top') ? 80 : STAGE_H - 80 - capH
        const align = pos.endsWith('right') ? 'right' : 'left'
        els.push(text(slide.caption, 80, y, STAGE_W - 160, capH, { size: 18, align, color: 'rgba(230,236,242,0.85)' }))
      }
      break
    }
    case 'gallery': {
      // .l-gallery — geometry from core/gallery.ts, the numbers the live grid
      // uses too, so live, freeform and .pptx place every cell alike. Bare
      // string items are pictures as well; they used to be dropped here, so a
      // gallery written as `items: [a.png, b.png]` vanished from export.
      const items = galleryItemsOf(slide.items)
      let y = PAD_Y
      if (title) {
        els.push(text(title, PAD_X, y, INNER_W, GALLERY_TITLE_H, { ...HEAD }))
        y += GALLERY_TITLE_H + GALLERY_TITLE_GAP
      }
      const overlay = slide.labelPos === 'overlay'
      const labelRow = !overlay && items.some((it) => it.label)
      const aspects = items.map((it) => {
        const s = it.image ? opts.naturalSize?.(it.image) : undefined
        return s ? s.w / s.h : undefined
      })
      const cols = galleryColumns(slide.columns, items.length, { aspects, box: galleryBox(!!title), labelRow })
      const g = galleryCells(items.length, cols, { w: INNER_W, h: STAGE_H - PAD_Y - y }, labelRow)
      items.forEach((it, i) => {
        const cx = PAD_X + (i % g.cols) * (g.cellW + GALLERY_GAP)
        const cy = y + Math.floor(i / g.cols) * (g.cellH + GALLERY_GAP)
        // The picture's frame: the whole cell, or — for `contain` with a known
        // size — shrunk to hug the picture, as the live frame does.
        const fit = effectiveFit(it, slide.imageFit)
        const size = fit === 'contain' && it.image ? opts.naturalSize?.(it.image) : undefined
        const r = size ? containRect(size, { x: cx, y: cy, w: g.cellW, h: g.frameH }) : { x: cx, y: cy, w: g.cellW, h: g.frameH }
        if (it.image) els.push(image(it.image, r.x, r.y, r.w, r.h, { radius: 10, stroke: 'rgba(230,236,242,0.1)', strokeWidth: 1, link: it.link, focus: it.focus, ...(fit === 'contain' ? { fit } : {}) }))
        if (it.label && overlay) els.push(galleryBadge(it.label, r.x, r.y, r.w))
        else if (it.label) els.push(text(it.label, cx, cy + g.frameH + GALLERY_LABEL_GAP, g.cellW, GALLERY_LABEL_H, { font: 'heading', italic: true, size: 28, align: 'center', color: 'var(--dek-accent)', lineHeight: 1.2 }))
      })
      break
    }
    case 'table': {
      // A table bakes to ONE `table` element, not a scatter of text/image boxes:
      // the grid stays a grid on the canvas (same TableGrid renderer, same
      // look), and `convert.ts` can un-bake it back into a `table` layout
      // losslessly. Decomposing into boxes here would be a one-way trip.
      // The layout and the element carry the identical `table` object, so
      // this is a copy — no field-by-field translation to drift.
      let y = PAD_Y
      if (title) {
        els.push(text(title, PAD_X, y, INNER_W, H1_H, { ...HEAD }))
        y += H1_H + 24
      }
      els.push({
        type: 'table',
        x: PAD_X,
        y,
        w: INNER_W,
        h: STAGE_H - PAD_Y - y,
        rotation: 0,
        table: cloneTable(slide.table ?? emptyTable(1, 1)),
      })
      break
    }
    case 'video-embed': {
      // .l-video-embed.full: edge-to-edge, no caption (nowhere to put one).
      if (slide.videoFit === 'full') {
        els.push(video(slide.video ?? '', 0, 0, STAGE_W, STAGE_H, slide.poster || undefined))
        break
      }
      // .l-video-embed: 60px padding, 16:9 frame centred, caption +14 below
      const PADV = 60
      const availW = STAGE_W - PADV * 2
      const capH = slide.caption ? 14 + 20 * BODY_LH : 0
      const availH = STAGE_H - PADV * 2 - capH
      const h = Math.min((availW * 9) / 16, availH)
      const w = (h * 16) / 9
      const x = (STAGE_W - w) / 2
      const y = PADV + Math.max(0, (STAGE_H - PADV * 2 - h - capH) / 2)
      els.push(video(slide.video ?? '', x, y, w, h, slide.poster || undefined))
      if (slide.caption) els.push(text(slide.caption, PAD_X, y + h + 14, INNER_W, 20 * BODY_LH, { size: 20, align: 'center', color: 'rgba(230,236,242,0.75)' }))
      break
    }
    case 'diagram': {
      // .l-diagram: 50/70 padding, h1 +18, stage centred in the rest
      const PX = 70
      const PY = 50
      let y = PY
      if (title) {
        els.push(text(title, PX, y, STAGE_W - PX * 2, H1_H, { ...HEAD }))
        y += H1_H + 18
      }
      els.push(diagram(slide.code ?? '', PX, y, STAGE_W - PX * 2, STAGE_H - PY - y))
      break
    }
    default:
      // anything else: salvage what we can.
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, H1_H, { ...HEAD }))
      if (slide.caption) els.push(text(slide.caption, PAD_X, STAGE_H - 120, INNER_W, 40, { size: 22, align: 'center' }))
      break
  }
  return els
}

/** Default dimensions for a tool, used when a create is a plain click (no drag). */
export function defaultSize(tool: CanvasTool): { w: number; h: number } {
  switch (tool) {
    case 'text':
      return { w: 320, h: 60 }
    case 'image':
      return { w: 320, h: 220 }
    case 'rect':
    default:
      return { w: 240, h: 160 }
  }
}

/** A fresh element for the given tool, occupying an explicit rectangle (the area
 *  the user dragged out — top-left `x,y`, size `w,h`). `src` fills an image box. */
export function newElementRect(tool: CanvasTool, rawX: number, rawY: number, rawW: number, rawH: number, src?: string): SlideElement {
  const x = Math.round(rawX)
  const y = Math.round(rawY)
  const w = Math.max(8, Math.round(rawW))
  const h = Math.max(8, Math.round(rawH))
  switch (tool) {
    case 'text':
      // a text box = a box with transparent fill & stroke
      return { type: 'box', x, y, w, h, rotation: 0, content: 'Text', ...TEXT_DEFAULTS }
    case 'image':
      return { type: 'box', x, y, w, h, rotation: 0, src: src ?? '', fit: 'cover', fill: 'transparent', stroke: 'transparent' }
    case 'rect':
    default:
      return { type: 'box', x, y, w, h, rotation: 0, ...BOX_DEFAULTS }
  }
}

/** An arrow built from a drag vector: it runs from the start point (tail) to the
 *  end point (head), encoded as a zero-height box of length = distance, rotated to
 *  the drag angle around its centre (matching the renderer + rotate handle). */
export function newArrow(x0: number, y0: number, x1: number, y1: number): SlideElement {
  const len = Math.max(8, Math.hypot(x1 - x0, y1 - y0))
  const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  return { type: 'arrow', x: Math.round(cx - len / 2), y: Math.round(cy), w: Math.round(len), h: 0, rotation: Math.round(angle), ...ARROW_DEFAULTS }
}
