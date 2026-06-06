// Convert a semantic-layout slide into a freeform canvas of positioned elements.
//
// "Baking" runs when a slide is edited freely (a text box / shape added, or the
// user picks Freeform): the layout's named fields become movable `elements` at
// roughly the positions the layout rendered them, so nothing is lost and the
// slide keeps looking the same — it's just editable as a canvas now.

import type { Slide, SlideElement, TextElement, ImageElement } from './types'

const STAGE_W = 1280
const STAGE_H = 720
// dek-pad is `padding: 70px 110px`
const PAD_X = 110
const PAD_Y = 70
const INNER_W = STAGE_W - PAD_X * 2 // 1060
const INNER_H = STAGE_H - PAD_Y * 2 // 580

function text(content: string, x: number, y: number, w: number, h: number, extra: Partial<TextElement> = {}): TextElement {
  return { type: 'text', x, y, w, h, rotation: 0, content, ...extra }
}
function image(src: string, x: number, y: number, w: number, h: number, extra: Partial<ImageElement> = {}): ImageElement {
  return { type: 'image', x, y, w, h, rotation: 0, src, fit: 'cover', ...extra }
}

/** True for layouts we can fully bake without losing content in this version.
 *  (video-embed and diagram need element types that don't exist yet.) */
export function canBake(layout: string): boolean {
  return layout !== 'video-embed' && layout !== 'diagram'
}

/** Build the element list that reproduces a slide's current content. */
export function bakeToElements(slide: Slide): SlideElement[] {
  // Already a canvas — keep whatever elements it has.
  if (slide.layout === 'freeform') return [...(slide.elements ?? [])]

  const els: SlideElement[] = []
  const title = (slide.title ?? '').trim()
  const content = (slide.content ?? '').trim()

  switch (slide.layout) {
    case 'cover':
      els.push(text(slide.title ?? '', PAD_X, 250, INNER_W, 240, { size: 200, align: 'center', bold: true }))
      if (slide.subtitle) els.push(text(slide.subtitle, PAD_X, 470, INNER_W, 80, { size: 48, align: 'center' }))
      if (slide.byline) els.push(text(slide.byline, PAD_X, 580, INNER_W, 40, { size: 20, align: 'center' }))
      break
    case 'section':
      els.push(text(slide.title ?? '', PAD_X, 280, INNER_W, 160, { size: 110, align: 'center', bold: true }))
      break
    case 'statement':
      els.push(text(slide.text ?? '', PAD_X, 230, INNER_W, 200, { size: 56, align: 'center' }))
      if (slide.cite) els.push(text(`— ${slide.cite}`, PAD_X, 470, INNER_W, 40, { size: 22, align: 'center' }))
      break
    case 'speaker': {
      const portraits = slide.portraits ?? []
      const pw = 220
      const gap = 24
      const totalW = portraits.length * pw + Math.max(0, portraits.length - 1) * gap
      let px = (STAGE_W - totalW) / 2
      for (const p of portraits) {
        if (p) els.push(image(p, px, 120, pw, pw))
        px += pw + gap
      }
      if (slide.name) els.push(text(slide.name, PAD_X, 380, INNER_W, 80, { size: 64, align: 'center', bold: true }))
      if (slide.role) els.push(text(slide.role, PAD_X, 470, INNER_W, 40, { size: 24, align: 'center' }))
      break
    }
    case 'text':
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 90, { size: 48, bold: true }))
      els.push(text(content, PAD_X, PAD_Y + 110, INNER_W, INNER_H - 110, { size: 28 }))
      break
    case 'text-image': {
      const left = (slide.side ?? 'right') === 'left'
      const half = INNER_W / 2 - 20
      const imgX = left ? PAD_X : PAD_X + half + 40
      const txtX = left ? PAD_X + half + 40 : PAD_X
      if (slide.image) els.push(image(slide.image, imgX, PAD_Y + 110, half, INNER_H - 110, { focus: slide.focus }))
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 90, { size: 48, bold: true }))
      els.push(text(content, txtX, PAD_Y + 110, half, INNER_H - 110, { size: 26 }))
      break
    }
    case 'image-full':
      if (slide.image) els.push(image(slide.image, 0, 0, STAGE_W, STAGE_H, { focus: slide.focus }))
      if (slide.title) els.push(text(slide.title, PAD_X, 560, INNER_W, 70, { size: 48, bold: true }))
      if (slide.caption) els.push(text(slide.caption, PAD_X, 640, INNER_W, 40, { size: 22 }))
      break
    case 'image-caption':
      if (slide.image) els.push(image(slide.image, PAD_X, PAD_Y, INNER_W, INNER_H - 60, { fit: 'contain', focus: slide.focus }))
      if (slide.caption) els.push(text(slide.caption, PAD_X, STAGE_H - 120, INNER_W, 40, { size: 22, align: 'right' }))
      break
    case 'gallery': {
      const items = (slide.items ?? []).filter(
        (it): it is { image: string; label?: string } => !!it && typeof it === 'object' && 'image' in it,
      )
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 70, { size: 40, bold: true }))
      const cols = Math.min(items.length || 1, 3)
      const gap = 24
      const cellW = (INNER_W - gap * (cols - 1)) / cols
      const cellH = 280
      items.forEach((it, i) => {
        const cx = PAD_X + (i % cols) * (cellW + gap)
        const cy = PAD_Y + 90 + Math.floor(i / cols) * (cellH + gap)
        if (it.image) els.push(image(it.image, cx, cy, cellW, cellH - 40, { fit: 'contain' }))
        if (it.label) els.push(text(it.label, cx, cy + cellH - 36, cellW, 32, { size: 18, align: 'center' }))
      })
      break
    }
    default:
      // video-embed / diagram / anything else: salvage what we can.
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 90, { size: 48, bold: true }))
      if (slide.poster) els.push(image(slide.poster, PAD_X, PAD_Y + 110, INNER_W, INNER_H - 160, { fit: 'contain' }))
      if (slide.caption) els.push(text(slide.caption, PAD_X, STAGE_H - 120, INNER_W, 40, { size: 22, align: 'center' }))
      break
  }
  return els
}

/** A fresh element of the given type, centred near a drop point. */
export function newElement(type: SlideElement['type'], x: number, y: number): SlideElement {
  switch (type) {
    case 'text':
      return { type: 'text', x: x - 160, y: y - 30, w: 320, h: 60, rotation: 0, content: 'Text', size: 32 }
    case 'rect':
      return { type: 'rect', x: x - 120, y: y - 80, w: 240, h: 160, rotation: 0, fill: '#7fc7ff22', stroke: '#7fc7ff', strokeWidth: 2, radius: 8 }
    case 'arrow':
      return { type: 'arrow', x: x - 120, y, w: 240, h: 0, rotation: 0, stroke: '#e6ecf2', strokeWidth: 3 }
    case 'image':
      return { type: 'image', x: x - 160, y: y - 100, w: 320, h: 200, rotation: 0, src: '', fit: 'cover' }
  }
}
