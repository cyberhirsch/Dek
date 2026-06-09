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
  const hasLower = /[a-zäöü]/.test(s)
  if (hasLower || !s.trim()) return s // not shouting — leave as authored
  return s.replace(/\S+/g, (w) => {
    if (/\d/.test(w) || w.length <= 2 || !/[AEIOUÄÖÜ]/i.test(w)) return w
    return w[0].toUpperCase() + w.slice(1).toLowerCase()
  })
}

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
  return tidyHeading(line.replace(/\*\*|\*|<\/?u>/g, '')) // headings are plain text
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

function freeform(shapes: Shape[], ptToPx: number, notes?: string): Slide {
  const elements: SlideElement[] = shapes.map((s) => (isText(s) ? textToElement(s, ptToPx) : picToElement(s)))
  return withNotes({ layout: 'freeform', elements }, notes)
}
function withNotes(s: Slide, notes?: string): Slide {
  if (notes && notes.trim()) s.notes = notes.trim()
  return s
}

export function classifySlide(shapes: Shape[], ctx: ClassifyCtx): Slide {
  const { index, ptToPx, notes } = ctx
  const texts = shapes.filter(isText).filter((t) => t.plain.trim().length > 0)
  const pics = shapes.filter(isPic)

  // pick a title: an explicit placeholder, else the largest-type text near the top
  const titleShape =
    texts.find((t) => t.ph === 'title' || t.ph === 'ctrTitle') ??
    [...texts].sort((a, b) => Math.max(0, ...b.paras.map((p) => p.sizePt)) - Math.max(0, ...a.paras.map((p) => p.sizePt)))[0]
  const bodies = texts.filter((t) => t !== titleShape)
  const subtitle = bodies.find((t) => t.ph === 'subTitle')
  const title = titleShape ? headingText(titleShape) : ''

  // ── empty ──
  if (!texts.length && !pics.length) return withNotes({ layout: 'section', title: '' }, notes)

  // ── full-bleed image (cover photo / image slide) ──
  const bleed = pics.find(isFullBleed)
  if (bleed && bodies.length === 0) {
    const cap = texts.length > 1 ? '' : '' // captions handled below via title
    return withNotes(
      { layout: 'image-full', image: bleed.src, title: title || '', caption: cap, focus: { x: 0, y: 0, scale: 1 } },
      notes,
    )
  }

  // ── gallery: several pictures, little text ──
  if (pics.length >= 2 && bodies.length === 0) {
    return withNotes({ layout: 'gallery', title, columns: 'auto', items: pics.map((p) => ({ image: p.src })) }, notes)
  }

  // ── title-only → cover (first slide) / section ──
  if (title && bodies.length === 0 && pics.length === 0) {
    if (index === 0 || subtitle) {
      return withNotes({ layout: 'cover', title, subtitle: subtitle ? headingText(subtitle) : '' }, notes)
    }
    return withNotes({ layout: 'section', title }, notes)
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
