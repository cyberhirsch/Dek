// Layout conversion — switching a slide's layout while keeping content consistent.
//
// Every layout is a combination of a few canonical CONTENT SLOTS (heading, lede,
// prose, caption, image, gallery, video, diagram, portraits). `LAYOUT_FIELDS`
// maps each layout's concrete field names to those slots. Converting a slide:
//   1. read the source layout's fields (or un-bake a freeform canvas) into a pool
//      of concrete fields, plus anything previously parked in `stash`,
//   2. fill the target layout's fields from that pool (slot-matched, with a small
//      lede⇄prose interchange so a statement reads as text and vice-versa),
//   3. park everything the target can't show in `stash` so the switch is
//      reversible ("Map + keep hidden"), marking it explicitly in the .md.
//
// Freeform is special: → freeform bakes fields into positioned elements; freeform
// → semantic best-effort un-bakes (first text box→heading, rest→prose, images→
// image/gallery, etc.), parking leftover canvas objects under `stash.elements`.

import type { Slide, LayoutId, SlideElement, BoxElement, ImageElement, VideoElement, DiagramElement, GalleryItem } from './types'
import { bakeToElements } from './bake'

type Slot = 'heading' | 'lede' | 'prose' | 'caption' | 'image' | 'gallery' | 'video' | 'diagram' | 'portraits'

/** Which concrete field each layout uses for each slot it supports. */
const LAYOUT_FIELDS: Record<LayoutId, Partial<Record<Slot, string>>> = {
  cover: { heading: 'title', lede: 'subtitle', caption: 'byline' },
  section: { heading: 'title' },
  statement: { lede: 'text', caption: 'cite' },
  speaker: { heading: 'name', caption: 'role', portraits: 'portraits' },
  text: { heading: 'title', prose: 'content' },
  'text-image': { heading: 'title', prose: 'content', image: 'image' },
  'image-full': { heading: 'title', caption: 'caption', image: 'image' },
  'image-caption': { caption: 'caption', image: 'image' },
  'video-embed': { caption: 'caption', video: 'video' },
  gallery: { heading: 'title', gallery: 'items' },
  diagram: { heading: 'title', diagram: 'code' },
  freeform: {},
}

// Candidate concrete fields for each slot, in priority order. The lede⇄prose
// overlap is deliberate: a statement's sentence and a text body are "the main
// writing" at different scales, so they fill in for each other.
const SLOT_CANDIDATES: Record<Slot, string[]> = {
  heading: ['title', 'name'],
  lede: ['text', 'subtitle', 'content'],
  prose: ['content', 'text', 'subtitle'],
  caption: ['caption', 'cite', 'byline', 'role'],
  image: ['image'],
  gallery: ['items', 'image'],
  video: ['video'],
  diagram: ['code'],
  portraits: ['portraits'],
}

// Modifier fields travel with their parent media slot; parked if the target can't use them.
const MOD_SUPPORT: Record<string, LayoutId[]> = {
  focus: ['text-image', 'image-full', 'image-caption'],
  side: ['text-image'],
  captionPos: ['image-caption'],
  columns: ['gallery'],
  poster: ['video-embed'],
}
const MOD_FIELDS = Object.keys(MOD_SUPPORT)

const isBox = (e: SlideElement): e is BoxElement => e.type === 'box'
const isImg = (e: SlideElement): e is ImageElement => e.type === 'image'

function nonEmpty(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** Best-effort un-bake of a freeform canvas into concrete content fields, plus
 *  the canvas objects that have no slot here (kept for `stash.elements`). */
function unbake(elements: SlideElement[]): { fields: Record<string, unknown>; leftover: SlideElement[] } {
  const fields: Record<string, unknown> = {}
  const leftover: SlideElement[] = []

  const texts = elements.filter((e) => isBox(e) && nonEmpty(e.content)) as BoxElement[]
  if (texts[0]) fields.title = texts[0].content
  if (texts.length > 1) fields.content = texts.slice(1).map((b) => b.content).join('\n\n')

  const imgs = elements.filter(isImg)
  if (imgs.length === 1) {
    fields.image = imgs[0].src
    if (imgs[0].focus) fields.focus = imgs[0].focus
  } else if (imgs.length > 1) {
    fields.items = imgs.map((im): GalleryItem => ({ image: im.src }))
  }

  const vid = elements.find((e): e is VideoElement => e.type === 'video')
  if (vid) {
    fields.video = vid.video
    if (vid.poster) fields.poster = vid.poster
  }
  const dia = elements.find((e): e is DiagramElement => e.type === 'diagram')
  if (dia) fields.code = dia.code

  // Everything not consumed above (arrows, contentless shape boxes) is leftover.
  for (const e of elements) {
    if (isBox(e) && nonEmpty(e.content)) continue
    if (isImg(e)) continue
    if (e.type === 'video' && e === vid) continue
    if (e.type === 'diagram' && e === dia) continue
    leftover.push(e)
  }
  return { fields, leftover }
}

/** Convert a slide to a different layout, mapping shared content and parking the
 *  rest in `stash` so the change is reversible. Returns a fresh slide. */
export function convertLayout(slide: Slide, to: LayoutId): Slide {
  if (slide.layout === to) return slide

  const base: Slide = { layout: to }
  if (slide.group) base.group = slide.group
  if (slide.notes) base.notes = slide.notes

  // → freeform: bake the visible fields into positioned elements; keep any stash.
  if (to === 'freeform') {
    base.elements = bakeToElements(slide)
    if (slide.stash && Object.keys(slide.stash).length) base.stash = { ...slide.stash }
    return base
  }

  // Build the pool of available concrete fields: previously-hidden stash first,
  // then the source's active content (which wins), plus a freeform un-bake.
  const pool: Record<string, unknown> = { ...(slide.stash ?? {}) }
  let leftover: SlideElement[] = Array.isArray(pool.elements) ? (pool.elements as SlideElement[]) : []
  delete pool.elements

  if (slide.layout === 'freeform') {
    const ub = unbake(slide.elements ?? [])
    Object.assign(pool, ub.fields)
    leftover = leftover.concat(ub.leftover)
  } else {
    const map = LAYOUT_FIELDS[slide.layout]
    for (const field of Object.values(map)) {
      if (field && nonEmpty(slide[field])) pool[field] = slide[field]
    }
    for (const m of MOD_FIELDS) if (slide[m] != null) pool[m] = slide[m]
  }

  // Fill the target layout's fields from the pool, slot by slot.
  const target = LAYOUT_FIELDS[to]
  const used = new Set<string>()
  for (const [slot, field] of Object.entries(target) as [Slot, string][]) {
    for (const cand of SLOT_CANDIDATES[slot]) {
      if (used.has(cand) || !nonEmpty(pool[cand])) continue
      base[field] = adaptValue(slot, cand, pool[cand])
      used.add(cand)
      break
    }
  }

  // Modifiers the target supports (and whose parent content came through) ride along.
  for (const m of MOD_FIELDS) {
    if (nonEmpty(pool[m]) && MOD_SUPPORT[m].includes(to)) {
      base[m] = pool[m]
      used.add(m)
    }
  }

  // Everything left over is parked in stash so the switch is reversible.
  const stash: Partial<Slide> = {}
  for (const [k, v] of Object.entries(pool)) {
    if (!used.has(k) && nonEmpty(v)) (stash as Record<string, unknown>)[k] = v
  }
  if (leftover.length) stash.elements = leftover
  if (Object.keys(stash).length) base.stash = stash

  return base
}

/** Coerce a pool value into the shape the target slot's field expects. */
function adaptValue(slot: Slot, fromField: string, value: unknown): unknown {
  // A single image seeding a gallery becomes a one-item list.
  if (slot === 'gallery' && fromField === 'image' && typeof value === 'string') {
    return [{ image: value } as GalleryItem]
  }
  return value
}

export type { Slot }
export { LAYOUT_FIELDS }
