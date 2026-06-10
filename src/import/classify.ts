// Hybrid PPTX-slide → Dek-slide classifier: recognise simple title/body/image
// patterns and emit clean named layouts; fall back to a faithful freeform canvas
// for anything complex. The input is the reduced shape model from ooxml.ts.

import type { Slide, SlideElement, BoxElement } from '../core/types'
import { STAGE_W, STAGE_H, type Shape, type TextShape, type PicShape, type Para } from './ooxml'

export interface ClassifyCtx {
  index: number
  /** points → stage px (depends on the source slide's physical width). */
  ptToPx: number
  notes?: string
}

const isText = (s: Shape): s is TextShape => s.kind === 'text'
const isPic = (s: Shape): s is PicShape => s.kind === 'pic'

/** A small acronym/keep set: words with digits, ≤2 chars, or no vowels (HMKW,
 *  GDVK, VFX, M7, AI…) are left untouched; real all-caps words get Title Case. */
function tidyHeading(s: string): string {
  if (/[a-zäöü]/.test(s) || !s.trim()) return s // not shouting — leave as authored
  return s.replace(/\S+/g, (w) => {
    if (/\d/.test(w) || w.length <= 2 || !/[AEIOUÄÖÜ]/i.test(w)) return w
    return w[0].toUpperCase() + w.slice(1).toLowerCase()
  })
}

const stripMd = (s: string) => s.replace(/\*\*|\*|<\/?u>/g, '')
/** A line that reads as an attribution / citation ("— Woody Allen"). */
const CITE = /^\s*[—–-]\s+\S/
const isCitation = (md: string) => CITE.test(stripMd(md))

function parasToContent(paras: Para[]): string {
  return paras
    .filter((p) => p.md.length > 0)
    .map((p) => (p.bullet ? `- ${p.md}` : p.md))
    .join('\n')
    .trim()
}
/** Plain heading text from a title shape (first non-empty line), tidied. */
function headingText(t: TextShape): string {
  const line = t.paras.find((p) => p.md.length > 0)?.md ?? ''
  return tidyHeading(stripMd(line))
}

const area = (s: Shape) => s.w * s.h
const STAGE_AREA = STAGE_W * STAGE_H
/** A picture that fills most of the stage (full-bleed background). */
const isFullBleed = (p: PicShape) => area(p) > STAGE_AREA * 0.6

function textToElement(t: TextShape, ptToPx: number): BoxElement {
  const maxPt = Math.max(0, ...t.paras.map((p) => p.sizePt))
  const titleish = t.ph === 'title' || t.ph === 'ctrTitle' || maxPt >= 28
  const size = Math.max(8, Math.min(400, Math.round((maxPt || 18) * ptToPx)))
  const align = t.paras.find((p) => p.align)?.align
  const el: BoxElement = {
    type: 'box',
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    rotation: 0,
    content: titleish ? tidyHeading(parasToContent(t.paras)) : parasToContent(t.paras),
    font: titleish ? 'heading' : 'body',
    size,
    fill: 'transparent',
    stroke: 'transparent',
  }
  if (titleish) {
    el.italic = true
    el.weight = 300
  }
  if (align && align !== 'left') el.align = align
  return el
}
function picToElement(p: PicShape): BoxElement {
  return { type: 'box', x: p.x, y: p.y, w: p.w, h: p.h, rotation: 0, src: p.src, fit: 'contain', fill: 'transparent', stroke: 'transparent' }
}

function withNotes(s: Slide, notes?: string): Slide {
  if (notes && notes.trim()) s.notes = notes.trim()
  return s
}
function freeform(shapes: Shape[], ptToPx: number, notes?: string): Slide {
  const elements: SlideElement[] = shapes.map((s) => (isText(s) ? textToElement(s, ptToPx) : picToElement(s)))
  return withNotes({ layout: 'freeform', elements }, notes)
}

/** Split a quote slide's lines into the statement body and its citation. */
function statementParts(texts: TextShape[]): { text: string; cite: string } {
  const lines = texts.flatMap((t) => t.paras).filter((p) => p.md.length > 0)
  const citeIdx = lines.findIndex((p) => isCitation(p.md))
  const cite = citeIdx >= 0 ? stripMd(lines[citeIdx].md).replace(/^\s*[—–-]\s*/, '').trim() : ''
  const text = lines
    .filter((_, i) => i !== citeIdx)
    .map((p) => p.md)
    .join('\n')
    .trim()
  return { text, cite }
}

export function classifySlide(shapes: Shape[], ctx: ClassifyCtx): Slide {
  const { index, ptToPx, notes } = ctx
  const texts = shapes.filter(isText).filter((t) => t.plain.trim().length > 0)
  const pics = shapes.filter(isPic)

  // pick a title: an explicit placeholder, else the largest-type text near the top
  const titleShape =
    texts.find((t) => t.ph === 'title' || t.ph === 'ctrTitle') ??
    [...texts].sort((a, b) => Math.max(0, ...b.paras.map((p) => p.sizePt)) - Math.max(0, ...a.paras.map((p) => p.sizePt)))[0]
  // Only treat the picked shape as a heading if it's a title placeholder or set
  // in large type — otherwise a slide whose single text is a small caption would
  // wrongly become a "title".
  const titlePt = titleShape ? Math.max(0, ...titleShape.paras.map((p) => p.sizePt)) : 0
  const hasRealTitle = !!titleShape && (titleShape.ph === 'title' || titleShape.ph === 'ctrTitle' || titlePt >= 24)
  const bodies = texts.filter((t) => t !== titleShape || !hasRealTitle)
  const subtitle = bodies.find((t) => t.ph === 'subTitle')
  const title = hasRealTitle && titleShape ? headingText(titleShape) : ''

  const noBullets = texts.every((t) => t.paras.every((p) => !p.bullet))
  const nonEmptyLines = texts.reduce((n, t) => n + t.paras.filter((p) => p.md.length > 0).length, 0)
  const totalLen = texts.reduce((n, t) => n + t.plain.length, 0)
  const maxPt = Math.max(0, ...texts.flatMap((t) => t.paras.map((p) => p.sizePt)))
  const centered = texts.some((t) => t.paras.some((p) => p.align === 'center'))
  const hasCite = texts.some((t) => t.paras.some((p) => isCitation(p.md)))

  // ── empty ──
  if (!texts.length && !pics.length) return withNotes({ layout: 'section', title: '' }, notes)

  // ── statement / quote (no images) ──
  // A citation line is a strong signal; otherwise a short, centred, large block of
  // 2–4 lines (single line = section, handled below).
  if (
    pics.length === 0 &&
    noBullets &&
    (hasCite || (centered && nonEmptyLines >= 2 && nonEmptyLines <= 4 && totalLen < 300 && maxPt >= 24))
  ) {
    const { text, cite } = statementParts(texts)
    if (text) return withNotes({ layout: 'statement', text, cite }, notes)
  }

  // ── full-bleed image ──
  const bleed = pics.find(isFullBleed)
  if (bleed && bodies.length <= 1) {
    // a lone short non-title text becomes the caption; a title becomes the overlay
    const capText = bodies.find((b) => b.plain.trim().length > 0 && b.plain.length < 140)
    return withNotes(
      {
        layout: 'image-full',
        image: bleed.src,
        title: title || '',
        caption: capText ? stripMd(parasToContent(capText.paras)) : '',
        focus: { x: 0, y: 0, scale: 1 },
      },
      notes,
    )
  }

  // ── gallery: several pictures, little text ──
  if (pics.length >= 2 && bodies.length === 0) {
    return withNotes({ layout: 'gallery', title, columns: 'auto', items: pics.map((p) => ({ image: p.src })) }, notes)
  }

  // ── title-only → cover (first slide / has subtitle) / section ──
  if (title && bodies.length === 0 && pics.length === 0) {
    if (index === 0 || subtitle) {
      return withNotes({ layout: 'cover', title, subtitle: subtitle ? headingText(subtitle) : '' }, notes)
    }
    return withNotes({ layout: 'section', title }, notes)
  }

  // ── single framed image with only a caption (no real body) → image-caption ──
  if (pics.length === 1 && !isFullBleed(pics[0])) {
    const caption = texts.map((t) => stripMd(parasToContent(t.paras))).filter(Boolean).join(' · ')
    if (!title && noBullets && totalLen < 160) {
      return withNotes({ layout: 'image-caption', image: pics[0].src, caption, captionPos: 'bottom-right', focus: { x: 0, y: 0, scale: 1 } }, notes)
    }
  }

  // ── title + body (+ optional single image) ──
  if (title && bodies.length >= 1 && pics.length <= 1) {
    const content = bodies.map((b) => parasToContent(b.paras)).filter(Boolean).join('\n')
    if (pics.length === 1) {
      const p = pics[0]
      const side = p.x + p.w / 2 > STAGE_W / 2 ? 'right' : 'left'
      const ratio = p.w / p.h
      const imageRatio = ratio > 1.4 ? '16:9' : ratio < 0.8 ? '9:16' : '1:1'
      return withNotes({ layout: 'text-image', title, content, image: p.src, side, imageRatio, focus: { x: 0, y: 0, scale: 1 } }, notes)
    }
    return withNotes({ layout: 'text', title, content }, notes)
  }

  // ── single image, no usable text ──
  if (pics.length === 1 && bodies.length === 0 && !title) {
    return withNotes({ layout: 'image-full', image: pics[0].src, title: '', caption: '', focus: { x: 0, y: 0, scale: 1 } }, notes)
  }

  // ── everything else: faithful freeform ──
  return freeform(shapes, ptToPx, notes)
}
