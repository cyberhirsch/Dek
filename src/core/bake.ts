// Convert a semantic-layout slide into a freeform canvas of positioned elements.
//
// "Baking" runs when a slide is edited freely (a text box / shape added, or the
// user picks Freeform): the layout's named fields become movable `elements` at
// roughly the positions the layout rendered them, so nothing is lost and the
// slide keeps looking the same — it's just editable as a canvas now. Fonts are
// carried over via the 'heading' / 'body' tokens so conversion preserves the look.

import type { Slide, SlideElement, BoxElement, ImageElement, VideoElement, DiagramElement, CanvasTool } from './types'

const STAGE_W = 1280
const STAGE_H = 720
// dek-pad is `padding: 70px 110px`
const PAD_X = 110
const PAD_Y = 70
const INNER_W = STAGE_W - PAD_X * 2 // 1060
const INNER_H = STAGE_H - PAD_Y * 2 // 580

function text(content: string, x: number, y: number, w: number, h: number, extra: Partial<BoxElement> = {}): BoxElement {
  return { type: 'box', x, y, w, h, rotation: 0, content, font: 'body', size: 28, ...extra }
}
function image(src: string, x: number, y: number, w: number, h: number, extra: Partial<ImageElement> = {}): ImageElement {
  return { type: 'image', x, y, w, h, rotation: 0, src, fit: 'cover', ...extra }
}

function video(v: string, x: number, y: number, w: number, h: number, poster?: string): VideoElement {
  return { type: 'video', x, y, w, h, rotation: 0, video: v, ...(poster ? { poster } : {}) }
}
function diagram(code: string, x: number, y: number, w: number, h: number): DiagramElement {
  return { type: 'diagram', x, y, w, h, rotation: 0, code }
}

/** Build the element list that reproduces a slide's current content. */
export function bakeToElements(slide: Slide): SlideElement[] {
  // Already a canvas — keep whatever elements it has.
  if (slide.layout === 'freeform') return [...(slide.elements ?? [])]

  const els: SlideElement[] = []
  const title = (slide.title ?? '').trim()
  const content = (slide.content ?? '').trim()
  const H = 'heading' // heading-font token
  const B = 'body'

  switch (slide.layout) {
    case 'cover':
      els.push(text(slide.title ?? '', PAD_X, 250, INNER_W, 240, { size: 200, align: 'center', bold: true, font: H }))
      if (slide.subtitle) els.push(text(slide.subtitle, PAD_X, 470, INNER_W, 80, { size: 48, align: 'center', font: B }))
      if (slide.byline) els.push(text(slide.byline, PAD_X, 580, INNER_W, 40, { size: 20, align: 'center', font: B }))
      break
    case 'section':
      els.push(text(slide.title ?? '', PAD_X, 280, INNER_W, 160, { size: 110, align: 'center', bold: true, font: H }))
      break
    case 'statement':
      els.push(text(slide.text ?? '', PAD_X, 230, INNER_W, 200, { size: 56, align: 'center', font: H }))
      if (slide.cite) els.push(text(`— ${slide.cite}`, PAD_X, 470, INNER_W, 40, { size: 22, align: 'center', font: B }))
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
      if (slide.name) els.push(text(slide.name, PAD_X, 380, INNER_W, 80, { size: 64, align: 'center', bold: true, font: H }))
      if (slide.role) els.push(text(slide.role, PAD_X, 470, INNER_W, 40, { size: 24, align: 'center', font: B }))
      break
    }
    case 'text':
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 90, { size: 48, bold: true, font: H }))
      els.push(text(content, PAD_X, PAD_Y + 110, INNER_W, INNER_H - 110, { size: 28, font: B }))
      break
    case 'text-image': {
      const left = (slide.side ?? 'right') === 'left'
      const half = INNER_W / 2 - 20
      const imgX = left ? PAD_X : PAD_X + half + 40
      const txtX = left ? PAD_X + half + 40 : PAD_X
      if (slide.image) els.push(image(slide.image, imgX, PAD_Y + 110, half, INNER_H - 110, { focus: slide.focus }))
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 90, { size: 48, bold: true, font: H }))
      els.push(text(content, txtX, PAD_Y + 110, half, INNER_H - 110, { size: 26, font: B }))
      break
    }
    case 'image-full':
      if (slide.image) els.push(image(slide.image, 0, 0, STAGE_W, STAGE_H, { focus: slide.focus }))
      if (slide.title) els.push(text(slide.title, PAD_X, 560, INNER_W, 70, { size: 48, bold: true, font: H }))
      if (slide.caption) els.push(text(slide.caption, PAD_X, 640, INNER_W, 40, { size: 22, font: B }))
      break
    case 'image-caption':
      if (slide.image) els.push(image(slide.image, PAD_X, PAD_Y, INNER_W, INNER_H - 60, { fit: 'contain', focus: slide.focus }))
      if (slide.caption) els.push(text(slide.caption, PAD_X, STAGE_H - 120, INNER_W, 40, { size: 22, align: 'right', font: B }))
      break
    case 'gallery': {
      const items = (slide.items ?? []).filter(
        (it): it is { image: string; label?: string } => !!it && typeof it === 'object' && 'image' in it,
      )
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 70, { size: 40, bold: true, font: H }))
      const cols = Math.min(items.length || 1, 3)
      const gap = 24
      const cellW = (INNER_W - gap * (cols - 1)) / cols
      const cellH = 280
      items.forEach((it, i) => {
        const cx = PAD_X + (i % cols) * (cellW + gap)
        const cy = PAD_Y + 90 + Math.floor(i / cols) * (cellH + gap)
        if (it.image) els.push(image(it.image, cx, cy, cellW, cellH - 40, { fit: 'contain' }))
        if (it.label) els.push(text(it.label, cx, cy + cellH - 36, cellW, 32, { size: 18, align: 'center', font: B }))
      })
      break
    }
    case 'video-embed':
      els.push(video(slide.video ?? '', PAD_X, PAD_Y, INNER_W, INNER_H - 60, slide.poster || undefined))
      if (slide.caption) els.push(text(slide.caption, PAD_X, STAGE_H - 120, INNER_W, 40, { size: 22, align: 'center', font: B }))
      break
    case 'diagram':
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 80, { size: 44, bold: true, font: H }))
      els.push(diagram(slide.code ?? '', PAD_X, title ? PAD_Y + 100 : PAD_Y, INNER_W, title ? INNER_H - 100 : INNER_H))
      break
    default:
      // anything else: salvage what we can.
      if (title) els.push(text(title, PAD_X, PAD_Y, INNER_W, 90, { size: 48, bold: true, font: H }))
      if (slide.caption) els.push(text(slide.caption, PAD_X, STAGE_H - 120, INNER_W, 40, { size: 22, align: 'center', font: B }))
      break
  }
  return els
}

/** A fresh element for the given tool, centred near a drop point. */
export function newElement(tool: CanvasTool, rawX: number, rawY: number): SlideElement {
  const x = Math.round(rawX)
  const y = Math.round(rawY)
  switch (tool) {
    case 'text':
      // a text box = a box with transparent fill & stroke
      return { type: 'box', x: x - 160, y: y - 30, w: 320, h: 60, rotation: 0, content: 'Text', font: 'body', size: 32, fill: 'transparent', stroke: 'transparent' }
    case 'rect':
      return { type: 'box', x: x - 120, y: y - 80, w: 240, h: 160, rotation: 0, fill: '#7fc7ff', stroke: '#7fc7ff', strokeWidth: 2, radius: 8 }
    case 'arrow':
      return { type: 'arrow', x: x - 120, y, w: 240, h: 0, rotation: 0, stroke: '#e6ecf2', strokeWidth: 3 }
    default:
      return { type: 'box', x: x - 120, y: y - 80, w: 240, h: 160, rotation: 0, fill: '#7fc7ff' }
  }
}
