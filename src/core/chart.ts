// Reading a table as chart data, and the chart geometry — pure, so the DOM
// renderer, bake, and PPTX export all draw from the same numbers.
//
// Convention (documented in the table's view switch): column 1 holds the
// labels, the first *numeric* column after it holds the values, and with
// `header: true` the first row names the columns instead of being data.

import type { TableData } from './types'
import { tableShape } from './table'

export interface Datum {
  label: string
  value: number
}

/**
 * A cell's text as a number, or null. Tolerates what people type into tables:
 * surrounding spaces, a trailing `%`, a leading or trailing `€`/`$`/`£`.
 *
 * Separators follow the common reading:
 * - one `,` or one `.` is the decimal separator — so `3,5` is 3.5 (German)
 *   and `3.5` is 3.5;
 * - both present: the LAST one is decimal, the other groups thousands
 *   (`1.234,5` and `1,234.5` are both 1234.5);
 * - the same separator repeated only groups thousands (`1.234.567`).
 * The one ambiguous case, `1,200`, therefore reads as 1.2 — a single comma is
 * treated as decimal, never as thousands.
 */
export function parseNumber(raw: string | number | undefined | null): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (raw == null) return null
  let s = raw.trim().replace(/^[€$£]\s*/, '').replace(/\s*[€$£%]$/, '').replace(/\s+/g, '')
  if (!s) return null
  const commas = (s.match(/,/g) ?? []).length
  const dots = (s.match(/\./g) ?? []).length
  if (commas && dots) {
    const decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
    const group = decimal === ',' ? '.' : ','
    s = s.split(group).join('').replace(decimal, '.')
  } else if (commas > 1 || dots > 1) {
    s = s.replace(/[.,]/g, '')
  } else {
    s = s.replace(',', '.')
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * The table as label/value pairs. The value column is the first column after
 * the labels in which most data rows parse as numbers — so a table can carry
 * a notes column before its numbers without breaking the chart. Rows with a
 * blank label and no value are skipped; a row whose value doesn't parse keeps
 * value NaN so callers can decide (the pie drops it).
 */
export function chartData(t: TableData | undefined): Datum[] {
  const { rows, cols, cells } = tableShape(t)
  const first = t?.header ? 1 : 0
  const text = (r: number, c: number) => {
    const cell = cells[r * cols + c]
    return cell && !cell.covered && !cell.image ? (cell.text ?? '') : ''
  }
  let valueCol = -1
  for (let c = 1; c < cols && valueCol < 0; c++) {
    let numeric = 0
    let filled = 0
    for (let r = first; r < rows; r++) {
      const s = text(r, c).trim()
      if (!s) continue
      filled++
      if (parseNumber(s) != null) numeric++
    }
    if (filled && numeric * 2 > filled) valueCol = c
  }
  const out: Datum[] = []
  for (let r = first; r < rows; r++) {
    const label = text(r, 0).trim()
    const value = valueCol < 0 ? Number.NaN : (parseNumber(text(r, valueCol)) ?? Number.NaN)
    if (!label && Number.isNaN(value)) continue
    out.push({ label, value })
  }
  return out
}

// ── pie ──────────────────────────────────────────────────────────────────────

export interface Slice extends Datum {
  /** Share of the whole, 0..1. */
  fraction: number
  /** Clockwise from 12 o'clock, in radians. */
  start: number
  end: number
  /** The folded remainder ("Other"). */
  other?: boolean
}

/** Beyond this many slices a pie stops being readable — angles this small
 *  can't be compared — so the rest fold into one "Other" slice. */
export const PIE_MAX_SLICES = 6

/**
 * Slices for a pie, largest first. Only positive values can be a share of a
 * whole, so zero, negative and non-numeric rows are dropped. With more than
 * `max` positive rows the smallest fold into "Other" (always drawn last).
 */
export function pieSlices(data: Datum[], max = PIE_MAX_SLICES): Slice[] {
  const pos = data.filter((d) => Number.isFinite(d.value) && d.value > 0).sort((a, b) => b.value - a.value)
  let kept: Array<Datum & { other?: boolean }> = pos
  if (pos.length > max) {
    const rest = pos.slice(max - 1)
    kept = [...pos.slice(0, max - 1), { label: 'Other', value: rest.reduce((s, d) => s + d.value, 0), other: true }]
  }
  const total = kept.reduce((s, d) => s + d.value, 0)
  if (total <= 0) return []
  let a = 0
  return kept.map((d) => {
    const fraction = d.value / total
    const start = a
    a += fraction * Math.PI * 2
    return { ...d, fraction, start, end: a }
  })
}

/** An angle in OOXML's unit for the `pie` preset shape: 60000ths of a degree,
 *  clockwise from 3 o'clock. Ours run clockwise from 12 o'clock, so it's a
 *  quarter-turn back, wrapped into [0, 360°). */
export function ooxmlAngle(rad: number): number {
  const deg = (((rad * 180) / Math.PI - 90) % 360 + 360) % 360
  return Math.round(deg * 60000)
}

/** A point on a circle, clockwise from 12 o'clock. */
export function polar(cx: number, cy: number, r: number, angle: number): { x: number; y: number } {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) }
}

/** SVG path for one slice. A single slice covering the whole circle is drawn
 *  as two half-arcs — an arc from a point back to itself renders as nothing. */
export function slicePath(cx: number, cy: number, r: number, s: Pick<Slice, 'start' | 'end'>): string {
  const sweep = s.end - s.start
  if (sweep >= Math.PI * 2 - 1e-9) {
    const top = polar(cx, cy, r, 0)
    const bottom = polar(cx, cy, r, Math.PI)
    return `M ${top.x} ${top.y} A ${r} ${r} 0 1 1 ${bottom.x} ${bottom.y} A ${r} ${r} 0 1 1 ${top.x} ${top.y} Z`
  }
  const p0 = polar(cx, cy, r, s.start)
  const p1 = polar(cx, cy, r, s.end)
  const large = sweep > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`
}

export interface PieLabel {
  x: number
  y: number
  anchor: 'start' | 'end' | 'middle'
  label: string
  percent: string
}

export interface PieLayout {
  cx: number
  cy: number
  r: number
  slices: Slice[]
  labels: PieLabel[]
}

/** Label type size, in stage px — the design system's caption step. */
export const PIE_LABEL_SIZE = 20

/**
 * Fit a pie with outside labels into a w×h box. The radius leaves room either
 * side for a label column, so labels never overlap the pie itself. Labels sit
 * on each slice's mid-angle, anchored away from the centre.
 */
export function pieLayout(data: Datum[], w: number, h: number, labelSize = PIE_LABEL_SIZE): PieLayout {
  const slices = pieSlices(data)
  const cx = w / 2
  const cy = h / 2
  // Room for ~12 characters of label on each side, and two lines vertically.
  const labelW = labelSize * 0.6 * 12
  const r = Math.max(0, Math.min(h / 2 - labelSize * 2.2, w / 2 - labelW - labelSize))
  const labels = slices.map((s): PieLabel => {
    const mid = (s.start + s.end) / 2
    const p = polar(cx, cy, r + labelSize * 1.1, mid)
    const side = Math.sin(mid)
    return {
      x: p.x,
      y: p.y,
      anchor: Math.abs(side) < 0.15 ? 'middle' : side > 0 ? 'start' : 'end',
      label: s.label,
      percent: formatPercent(s.fraction),
    }
  })
  return { cx, cy, r, slices, labels }
}

/** Whole percents, except a real share that would round to 0 shows "<1%" —
 *  a visible slice labelled 0% reads as a bug. */
export function formatPercent(fraction: number): string {
  const p = fraction * 100
  if (p > 0 && p < 1) return '<1%'
  return `${Math.round(p)}%`
}

/** Fill opacity for the i-th slice: one accent colour stepped down, so the
 *  ramp stays on-theme — and follows any theme — instead of introducing a
 *  palette. ("Other" is drawn in the neutral text colour by the renderers.) */
export const SLICE_OPACITY = [1, 0.72, 0.5, 0.34, 0.22, 0.14]
export function sliceOpacity(i: number): number {
  return SLICE_OPACITY[Math.min(i, SLICE_OPACITY.length - 1)]
}
/** "Other" is neutral text at low opacity — visibly not one of the ranked
 *  categories, rather than the faintest step of the accent ramp. */
export const OTHER_OPACITY = 0.18
