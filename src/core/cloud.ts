// Word-cloud layout — pure and deterministic, so the slide, bake, and PPTX
// export place every word in exactly the same spot, and a cloud never
// reshuffles between renders or when you present.
//
// Words are sized by weight, then placed largest-first along an elliptical
// spiral from the centre (the classic Wordle approach), each at the first
// point where it overlaps nothing already placed. The finished cloud is scaled
// uniformly to fit its box. Text widths come from a per-font advance estimate
// rather than live glyph measurement: that's what keeps the layout identical
// outside a browser, at the cost of slightly looser packing.

import type { TableData } from './types'
import { chartData } from './chart'

export interface CloudWord {
  text: string
  weight: number
  /** Centre of the word's box, in the target box's coordinates. */
  x: number
  y: number
  w: number
  h: number
  size: number
  /** The largest words are set in the heading face — Cormorant italic — and
   *  the rest in the table's own (default body) face. */
  heading: boolean
  /** The top words take the accent colour; the rest stay in dim text. */
  accent: boolean
}

/** More words than this stop being readable on a slide; the lightest drop. */
export const CLOUD_MAX_WORDS = 60
/** Size range before the fit-to-box scale, in stage px. */
const MIN_SIZE = 18
const MAX_SIZE = 88
/** From this size up a word is set in the heading face. */
export const CLOUD_HEADING_FROM = 44
/** How many of the heaviest words take the accent colour. */
const ACCENT_WORDS = 3

/** Average advance per character, in em. JetBrains Mono is monospaced at
 *  0.6em, so that's exact; Cormorant italic averages well under 0.5em, and a
 *  generous estimate only loosens packing — it can never cause an overlap. */
export function advance(heading: boolean): number {
  return heading ? 0.5 : 0.6
}

/** Words and weights from a table: column 1 is the words, and the first
 *  numeric column (if any) the weights. No numbers means equal weights. A
 *  blank word is skipped; a word whose weight doesn't parse gets the lightest. */
export function cloudData(t: TableData | undefined): Array<{ text: string; weight: number }> {
  const rows = chartData(t).filter((d) => d.label)
  const finite = rows.map((d) => d.value).filter((v) => Number.isFinite(v) && v > 0)
  const floor = finite.length ? Math.min(...finite) : 1
  return rows.map((d) => ({ text: d.label, weight: Number.isFinite(d.value) && d.value > 0 ? d.value : floor }))
}

/** Map weights to sizes on a square-root scale — perceived size tracks area,
 *  so a word twice the weight shouldn't look four times as big. */
function sizeFor(weight: number, min: number, max: number): number {
  // Equal weights (a plain list of words): one size, in the heading face.
  if (max <= min) return CLOUD_HEADING_FROM
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.sqrt((weight - min) / (max - min))
}

/** A stable per-word angle, so words start their spiral on different sides —
 *  an organic look without randomness. */
function hashAngle(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) / 4294967296) * Math.PI * 2
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/**
 * Lay the table's words out to fit a w×h box. Returns the words with final
 * positions and sizes; empty when there's nothing to show.
 */
export function cloudLayout(t: TableData | undefined, w: number, h: number): CloudWord[] {
  if (w <= 0 || h <= 0) return []
  const data = cloudData(t)
    .sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text))
    .slice(0, CLOUD_MAX_WORDS)
  if (!data.length) return []
  const weights = data.map((d) => d.weight)
  const wMin = Math.min(...weights)
  const wMax = Math.max(...weights)
  const aspect = w / h

  const placed: Array<CloudWord & { box: Box }> = []
  data.forEach((d, i) => {
    const size = sizeFor(d.weight, wMin, wMax)
    const heading = size >= CLOUD_HEADING_FROM
    const ww = d.text.length * size * advance(heading)
    const hh = size * 1.1
    const gap = size * 0.18
    const start = i === 0 ? 0 : hashAngle(d.text)
    // Elliptical Archimedean spiral, stretched to the box's aspect so the
    // cloud fills a wide slide instead of forming a circle in the middle.
    for (let step = 0; step < 6000; step++) {
      const a = start + step * 0.12
      const r = step * 0.9
      const cx = r * Math.cos(a) * aspect
      const cy = r * Math.sin(a)
      const box = { x0: cx - ww / 2 - gap, y0: cy - hh / 2 - gap, x1: cx + ww / 2 + gap, y1: cy + hh / 2 + gap }
      if (placed.some((p) => overlaps(p.box, box))) continue
      // Accent marks the heaviest words — so only when weights actually differ;
      // with equal weights "the top three" would just be alphabetical.
      const accent = wMax > wMin && i < ACCENT_WORDS
      placed.push({ text: d.text, weight: d.weight, x: cx, y: cy, w: ww, h: hh, size, heading, accent, box })
      return
    }
  })

  // Fit: scale the whole cloud uniformly into the box, centred. Upscaling is
  // capped so three short words don't balloon to billboard size.
  const bx0 = Math.min(...placed.map((p) => p.x - p.w / 2))
  const bx1 = Math.max(...placed.map((p) => p.x + p.w / 2))
  const by0 = Math.min(...placed.map((p) => p.y - p.h / 2))
  const by1 = Math.max(...placed.map((p) => p.y + p.h / 2))
  const pad = 0.94
  const scale = Math.min(1.6, (w * pad) / Math.max(1, bx1 - bx0), (h * pad) / Math.max(1, by1 - by0))
  const mx = (bx0 + bx1) / 2
  const my = (by0 + by1) / 2
  return placed.map((p) => ({
    text: p.text,
    weight: p.weight,
    heading: p.heading,
    accent: p.accent,
    x: w / 2 + (p.x - mx) * scale,
    y: h / 2 + (p.y - my) * scale,
    w: p.w * scale,
    h: p.h * scale,
    size: p.size * scale,
  }))
}
