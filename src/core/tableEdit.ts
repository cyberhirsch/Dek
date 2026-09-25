// Structural table edits (#48): dragging track sizes, inserting and removing
// rows and columns, merging and unmerging, and bulk cell edits. All pure and
// all merge-aware. A merge is an owner cell with colspan/rowspan plus `covered`
// placeholders over the rest of its block; every edit here keeps that intact,
// so no edit can leave a placeholder pointing at nothing.

import type { TableData } from './types'
import {
  cellHasContent,
  emptyTable,
  emptyTableCell,
  tableShape,
  tableTracks,
  withCells,
  type GridCell,
  type TableShape,
} from './table'

/** The narrowest a track may be dragged, as a share of the table (≈ 64px of
 *  the 1060px stage — room for a word or a thumbnail). */
export const MIN_TRACK = 0.06

/**
 * Move the boundary between track `i` and `i + 1` by `delta` (a share of the
 * whole): one grows, its neighbour shrinks, nothing else moves, the total stays
 * 1. The delta is clamped so neither falls below `min` — the divider stops at
 * the limit instead of jumping.
 */
export function resizeTracks(fracs: number[] | undefined, n: number, i: number, delta: number, min = MIN_TRACK): number[] {
  const t = tableTracks(fracs, n)
  if (i < 0 || i >= t.length - 1) return t
  const lo = min - t[i]
  const hi = t[i + 1] - min
  if (lo > hi) return t
  const d = Math.max(lo, Math.min(hi, delta))
  const out = [...t]
  out[i] += d
  out[i + 1] -= d
  return out
}

// ── grid helpers ────────────────────────────────────────────────────────────

type Grid = GridCell[][]
const toGrid = ({ rows, cols, cells }: TableShape): Grid =>
  Array.from({ length: rows }, (_, r) => cells.slice(r * cols, r * cols + cols).map((c) => ({ ...c })))

interface Owner {
  r: number
  c: number
  rs: number
  cs: number
  cell: GridCell
}
/** Every visible cell, with the block it occupies. */
function owners(grid: Grid): Owner[] {
  const out: Owner[] = []
  grid.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (!cell.covered) out.push({ r, c, rs: Math.max(1, cell.rowspan ?? 1), cs: Math.max(1, cell.colspan ?? 1), cell })
    }),
  )
  return out
}

/** Write a grid back, with spans of 1 dropped so a shrunk merge doesn't linger
 *  in the file as `colspan: 1`. */
function fromGrid(t: TableData | undefined, grid: Grid): TableData {
  const cells = grid.flat().map((c) => ({
    ...c,
    colspan: (c.colspan ?? 1) > 1 ? c.colspan : undefined,
    rowspan: (c.rowspan ?? 1) > 1 ? c.rowspan : undefined,
  }))
  return withCells(t, cells, grid[0]?.length ?? 1)
}

/** Track sizes after inserting or removing track `at`. The others keep their
 *  proportions; a new track takes an average share. Uniform (absent) stays
 *  uniform. */
function reshapeTracks(fracs: number[] | undefined, n: number, at: number, insert: boolean): number[] | undefined {
  if (!fracs) return undefined
  const t = tableTracks(fracs, n)
  if (insert) t.splice(at, 0, 1 / n)
  else t.splice(at, 1)
  return tableTracks(t, t.length)
}

function withTracks(t: TableData, key: 'colWidths' | 'rowHeights', fracs: number[] | undefined): TableData {
  const out = { ...t }
  if (fracs) out[key] = fracs
  else delete out[key]
  return out
}

// ── rows and columns ────────────────────────────────────────────────────────

/** Insert a blank row before row `at` (`at` = row count appends). A merge the
 *  new row passes through grows by one and covers it; inserting on a merge's
 *  top or bottom edge leaves the merge as it was. */
export function insertRow(t: TableData | undefined, at: number): TableData {
  const shape = tableShape(t)
  const grid = toGrid(shape)
  const r = Math.max(0, Math.min(shape.rows, Math.floor(at)))
  const row: GridCell[] = Array.from({ length: shape.cols }, () => emptyTableCell())
  for (const o of owners(grid)) {
    if (o.r < r && r < o.r + o.rs) {
      o.cell.rowspan = o.rs + 1
      for (let c = o.c; c < o.c + o.cs; c++) row[c] = { covered: true }
    }
  }
  grid.splice(r, 0, row)
  return withTracks(fromGrid(t, grid), 'rowHeights', reshapeTracks(t?.rowHeights, shape.rows, r, true))
}

export function insertColumn(t: TableData | undefined, at: number): TableData {
  const shape = tableShape(t)
  const grid = toGrid(shape)
  const c = Math.max(0, Math.min(shape.cols, Math.floor(at)))
  const col: GridCell[] = Array.from({ length: shape.rows }, () => emptyTableCell())
  for (const o of owners(grid)) {
    if (o.c < c && c < o.c + o.cs) {
      o.cell.colspan = o.cs + 1
      for (let r = o.r; r < o.r + o.rs; r++) col[r] = { covered: true }
    }
  }
  grid.forEach((row, r) => row.splice(c, 0, col[r]))
  return withTracks(fromGrid(t, grid), 'colWidths', reshapeTracks(t?.colWidths, shape.cols, c, true))
}

/** Remove row `at`. A merge crossing it shrinks by one; if its owner was in
 *  that row, the merge lives on, owned from the next row down. The last row
 *  can't be removed. */
export function removeRow(t: TableData | undefined, at: number): TableData {
  const shape = tableShape(t)
  if (shape.rows <= 1) return t ?? emptyTable(1, 1)
  const grid = toGrid(shape)
  const r = Math.max(0, Math.min(shape.rows - 1, Math.floor(at)))
  for (const o of owners(grid)) {
    if (o.rs < 2 || r < o.r || r >= o.r + o.rs) continue
    if (o.r < r) o.cell.rowspan = o.rs - 1
    else grid[r + 1][o.c] = { ...o.cell, covered: undefined, rowspan: o.rs - 1 }
  }
  grid.splice(r, 1)
  return withTracks(fromGrid(t, grid), 'rowHeights', reshapeTracks(t?.rowHeights, shape.rows, r, false))
}

export function removeColumn(t: TableData | undefined, at: number): TableData {
  const shape = tableShape(t)
  if (shape.cols <= 1) return t ?? emptyTable(1, 1)
  const grid = toGrid(shape)
  const c = Math.max(0, Math.min(shape.cols - 1, Math.floor(at)))
  for (const o of owners(grid)) {
    if (o.cs < 2 || c < o.c || c >= o.c + o.cs) continue
    if (o.c < c) o.cell.colspan = o.cs - 1
    else grid[o.r][c + 1] = { ...o.cell, covered: undefined, colspan: o.cs - 1 }
  }
  grid.forEach((row) => row.splice(c, 1))
  return withTracks(fromGrid(t, grid), 'colWidths', reshapeTracks(t?.colWidths, shape.cols, c, false))
}

/** Whether removing row/column `at` would discard content (for a confirm).
 *  A merge owned in that line isn't lost — it moves down or right — so only
 *  unmerged cells count. */
export function lineHasContent(t: TableData | undefined, axis: 'row' | 'col', at: number): boolean {
  const { rows, cols, cells } = tableShape(t)
  const n = axis === 'row' ? cols : rows
  for (let k = 0; k < n; k++) {
    const cell = axis === 'row' ? cells[at * cols + k] : cells[k * cols + at]
    const spans = (axis === 'row' ? cell?.rowspan : cell?.colspan) ?? 1
    if (spans < 2 && cellHasContent(cell)) return true
  }
  return false
}

// ── selection and merges ────────────────────────────────────────────────────

/** The rectangle of cells between two cells, grown until it holds every merge
 *  it touches whole — what a drag across the grid selects. Flat indices. */
export function cellRange(t: TableData | undefined, a: number, b: number): number[] {
  const shape = tableShape(t)
  const at = (i: number) => ({ r: Math.floor(i / shape.cols), c: i % shape.cols })
  const pa = at(a)
  const pb = at(b)
  let r0 = Math.min(pa.r, pb.r)
  let r1 = Math.max(pa.r, pb.r)
  let c0 = Math.min(pa.c, pb.c)
  let c1 = Math.max(pa.c, pb.c)
  const merges = owners(toGrid(shape)).filter((o) => o.rs > 1 || o.cs > 1)
  for (let grew = true; grew; ) {
    grew = false
    for (const o of merges) {
      const or1 = o.r + o.rs - 1
      const oc1 = o.c + o.cs - 1
      if (o.r > r1 || or1 < r0 || o.c > c1 || oc1 < c0) continue
      if (o.r < r0 || or1 > r1 || o.c < c0 || oc1 > c1) {
        r0 = Math.min(r0, o.r)
        r1 = Math.max(r1, or1)
        c0 = Math.min(c0, o.c)
        c1 = Math.max(c1, oc1)
        grew = true
      }
    }
  }
  const out: number[] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * shape.cols + c)
  return out
}

/** The block `indices` would merge into, or null: they must be exactly a
 *  rectangle of two or more cells, none already part of a merge. */
function mergeBlock(t: TableData | undefined, indices: number[]) {
  const shape = tableShape(t)
  const set = new Set(indices)
  if (set.size < 2) return null
  const rs = [...set].map((i) => Math.floor(i / shape.cols))
  const cs = [...set].map((i) => i % shape.cols)
  const r0 = Math.min(...rs)
  const r1 = Math.max(...rs)
  const c0 = Math.min(...cs)
  const c1 = Math.max(...cs)
  if ((r1 - r0 + 1) * (c1 - c0 + 1) !== set.size) return null
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const i = r * shape.cols + c
      const cell = shape.cells[i]
      if (!set.has(i) || !cell || cell.covered || (cell.colspan ?? 1) > 1 || (cell.rowspan ?? 1) > 1) return null
    }
  }
  return { shape, r0, r1, c0, c1 }
}

export function canMerge(t: TableData | undefined, indices: number[]): boolean {
  return mergeBlock(t, indices) !== null
}

/** Whether merging would discard content — anything but the top-left cell's. */
export function mergeWouldDropContent(t: TableData | undefined, indices: number[]): boolean {
  const b = mergeBlock(t, indices)
  if (!b) return false
  const owner = b.r0 * b.shape.cols + b.c0
  return indices.some((i) => i !== owner && cellHasContent(b.shape.cells[i]))
}

/** Merge a rectangular block into its top-left cell, as spreadsheets do: it
 *  keeps its content and spans the block, the rest become covered. Returns
 *  the table unchanged when the cells can't merge. */
export function mergeCells(t: TableData | undefined, indices: number[]): TableData {
  const b = mergeBlock(t, indices)
  if (!b) return t ?? emptyTable(1, 1)
  const { cols } = b.shape
  const cells = b.shape.cells.map((c) => ({ ...c }))
  const owner = { ...cells[b.r0 * cols + b.c0] }
  for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) cells[r * cols + c] = { covered: true }
  if (b.c1 > b.c0) owner.colspan = b.c1 - b.c0 + 1
  if (b.r1 > b.r0) owner.rowspan = b.r1 - b.r0 + 1
  cells[b.r0 * cols + b.c0] = owner
  return withCells(t, cells, cols)
}

export function isMerged(cell: GridCell | undefined): boolean {
  return !!cell && !cell.covered && ((cell.colspan ?? 1) > 1 || (cell.rowspan ?? 1) > 1)
}

/** Split a merge back into single cells: the owner keeps its content, the
 *  positions it covered come back blank. */
export function unmergeCell(t: TableData | undefined, index: number): TableData {
  const { cols, cells } = tableShape(t)
  const cell = cells[index]
  if (!isMerged(cell)) return t ?? emptyTable(1, 1)
  const out = cells.map((c) => ({ ...c }))
  const r0 = Math.floor(index / cols)
  const c0 = index % cols
  for (let r = r0; r < r0 + (cell.rowspan ?? 1); r++) {
    for (let c = c0; c < c0 + (cell.colspan ?? 1); c++) out[r * cols + c] = emptyTableCell()
  }
  out[index] = { ...cell, colspan: undefined, rowspan: undefined }
  return withCells(t, out, cols)
}

// ── bulk cell edits ─────────────────────────────────────────────────────────

/** Whether clearing would discard anything. */
export function cellsHaveContent(t: TableData | undefined, indices: number[]): boolean {
  const { cells } = tableShape(t)
  return indices.some((i) => cellHasContent(cells[i]))
}

/** Empty the cells' content — text, image, link — keeping merges and style. */
export function clearCells(t: TableData | undefined, indices: number[]): TableData {
  const { cols, cells } = tableShape(t)
  const set = new Set(indices)
  return withCells(t, cells.map((c, i) => (set.has(i) && !c.covered ? { ...c, text: '', image: undefined, link: undefined } : c)), cols)
}

/** Toggle bold or italic across cells: on for all unless every one already
 *  has it, then off for all — the usual rule for a mixed selection. */
export function toggleCellStyle(t: TableData | undefined, indices: number[], key: 'bold' | 'italic'): TableData {
  const { cols, cells } = tableShape(t)
  const set = new Set(indices)
  const targets = cells.filter((c, i) => set.has(i) && !c.covered)
  if (!targets.length) return t ?? emptyTable(1, 1)
  const on = !targets.every((c) => c[key])
  return withCells(t, cells.map((c, i) => (set.has(i) && !c.covered ? { ...c, [key]: on || undefined } : c)), cols)
}

/** Every targeted cell has the style — for the menu's check marks. */
export function cellsHaveStyle(t: TableData | undefined, indices: number[], key: 'bold' | 'italic'): boolean {
  const { cells } = tableShape(t)
  const targets = indices.map((i) => cells[i]).filter((c) => c && !c.covered)
  return targets.length > 0 && targets.every((c) => c[key])
}
