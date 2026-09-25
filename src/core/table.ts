// The table model, shared by the `table` layout and the `table` canvas element.
//
// Storage (`TableData.rows`) is a row-major grid of compact values, so deck.md
// reads as a table. Everything that renders, measures, or edits a table works
// on a normalised flat view of it instead (`tableShape`) — one cell object per
// grid position, `covered` marking merge placeholders — and writes back with
// `withCells`. Both hosts go through these functions; neither touches `rows`
// directly.

import type { BoxElement, TableCell, TableCellValue, TableData, TableElement } from './types'

/** Default base size for cell text, in stage px — the design system's body/label
 *  step. Cell text shrinks below this to fit its cell, never grows above it. */
export const TABLE_CELL_SIZE = 22
/** Floor for the shrink-to-fit, below which text stops being worth reading. */
export const TABLE_CELL_MIN_SIZE = 9

/** A normalised cell: what renderers and edits work with. */
export interface GridCell extends TableCell {
  /** A position inside another cell's merge — no content, not rendered. */
  covered?: boolean
}

/** The normalised, flat view of a table: `cells[row * cols + col]`. */
export interface TableShape {
  rows: number
  cols: number
  cells: GridCell[]
}

// ── storage ⇄ normalised ─────────────────────────────────────────────────────

export function toGridCell(v: TableCellValue | undefined): GridCell {
  if (v === null) return { covered: true }
  if (v === undefined) return { text: '' }
  if (typeof v === 'string') return { text: v }
  if (typeof v === 'number') return { text: String(v) }
  if (typeof v === 'object') return { ...v }
  return { text: String(v) }
}

/** Only strings that round-trip exactly become numbers — "42" is stored as 42,
 *  but "007", "1e3", "3,5" and " 4" stay strings. So the conversion can never
 *  change what a cell says. */
function compactText(text: string): string | number {
  if (text.trim() === '') return text
  const n = Number(text)
  return Number.isFinite(n) && String(n) === text ? n : text
}

export function fromGridCell(c: GridCell): TableCellValue {
  if (c.covered) return null
  const span = (c.colspan ?? 1) > 1 || (c.rowspan ?? 1) > 1
  if (!c.image && !c.link && !span) return compactText(c.text ?? '')
  const out: TableCell = {}
  if (c.text) out.text = c.text
  if (c.image) out.image = c.image
  if (c.link) out.link = c.link
  if ((c.colspan ?? 1) > 1) out.colspan = c.colspan
  if ((c.rowspan ?? 1) > 1) out.rowspan = c.rowspan
  return out
}

/** A stored row, read leniently: a hand-written scalar row (`- Maya`) is a
 *  one-cell row rather than an error. */
function rowValues(row: unknown): TableCellValue[] {
  if (Array.isArray(row)) return row as TableCellValue[]
  if (row == null) return []
  return [row as TableCellValue]
}

export function tableShape(t: TableData | undefined | null): TableShape {
  const src = Array.isArray(t?.rows) ? t.rows.map(rowValues) : []
  const rows = Math.max(1, src.length)
  const cols = Math.max(1, ...src.map((r) => r.length))
  const cells: GridCell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push(toGridCell(src[r]?.[c]))
  }
  return { rows, cols, cells }
}

/** Write a flat cell list back as stored rows, keeping every other field. */
export function withCells(t: TableData | undefined, cells: GridCell[], cols: number): TableData {
  const rows: TableCellValue[][] = []
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols).map(fromGridCell))
  return { ...(t ?? { rows: [] }), rows }
}

export function emptyTable(rows = 3, cols = 3): TableData {
  return { rows: Array.from({ length: rows }, () => Array<TableCellValue>(cols).fill('')) }
}

// ── edits ───────────────────────────────────────────────────────────────────

/** Patch one cell (by flat index) and return the new table. */
export function setTableCell(t: TableData | undefined, index: number, patch: Partial<GridCell>): TableData {
  const { cols, cells } = tableShape(t)
  const next = cells.map((c, i) => (i === index ? { ...c, ...patch } : c))
  return withCells(t, next, cols)
}

export function emptyTableCell(): GridCell {
  return { text: '' }
}

/** A cell worth warning about before it's discarded — has real content, and
 *  isn't just a placeholder covered by some other cell's merge. */
export function cellHasContent(cell: GridCell | undefined | null): boolean {
  return !!cell && !cell.covered && (!!cell.text?.trim() || !!cell.image)
}

/** Reflow a flat, row-major cell array from `oldRows×oldCols` to
 *  `newRows×newCols`, preserving each surviving cell's row/column position.
 *  Growing appends blank cells; shrinking drops whatever falls outside. */
export function reflowTableCells(cells: GridCell[], oldCols: number, newRows: number, newCols: number): GridCell[] {
  const oldRows = oldCols > 0 ? Math.ceil(cells.length / oldCols) : 0
  const out: GridCell[] = []
  for (let r = 0; r < newRows; r++) {
    for (let c = 0; c < newCols; c++) {
      const survives = r < oldRows && c < oldCols
      out.push(survives ? (cells[r * oldCols + c] ?? emptyTableCell()) : emptyTableCell())
    }
  }
  return out
}

/** Whether resizing to `newRows×newCols` would discard a cell with content —
 *  the signal for a confirm-before-shrink prompt. */
export function resizeWouldDropContent(t: TableData | undefined, newRows: number, newCols: number): boolean {
  const { rows, cols, cells } = tableShape(t)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r < newRows && c < newCols) continue
      if (cellHasContent(cells[r * cols + c])) return true
    }
  }
  return false
}

/** Resize, keeping every surviving cell in place. Custom track sizes are
 *  dropped: there's no principled way to extend a dragged layout to a new
 *  dimension, and a stale-length array would desync from the grid. */
export function resizeTable(t: TableData | undefined, newRows: number, newCols: number): TableData {
  const { cols, cells } = tableShape(t)
  const next = withCells(t, reflowTableCells(cells, cols, newRows, newCols), newCols)
  delete next.colWidths
  delete next.rowHeights
  return next
}

// ── assets ──────────────────────────────────────────────────────────────────

/** Every image a table actually shows, with a path for reporting. Covered
 *  placeholders are skipped. This is the single walker both hosts use — the
 *  orphan-asset scan and PPTX embedding must see exactly the same set. */
export function tableImages(t: TableData | undefined | null): Array<{ src: string; path: string }> {
  const out: Array<{ src: string; path: string }> = []
  const rows = Array.isArray(t?.rows) ? t.rows : []
  rows.forEach((row, r) =>
    rowValues(row).forEach((v, c) => {
      if (v && typeof v === 'object' && typeof v.image === 'string' && v.image) {
        out.push({ src: v.image, path: `rows[${r}][${c}].image` })
      }
    }),
  )
  return out
}

/** Apply `fn` to every image in a table, leaving everything else as stored.
 *  Covered placeholders (`null`) carry no image and pass through untouched. */
export function mapTableImages(t: TableData, fn: (ref: string) => string): TableData {
  if (!Array.isArray(t.rows)) return t
  return {
    ...t,
    rows: t.rows.map((row) =>
      rowValues(row).map((v) =>
        v && typeof v === 'object' && typeof v.image === 'string' ? { ...v, image: fn(v.image) } : v,
      ),
    ),
  }
}

// ── Markdown text → table ───────────────────────────────────────────────────

/** Split one pipe-table line into cell texts: outer pipes optional, `\|` an
 *  escaped literal pipe. */
function pipeCells(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1)
  return s.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, '|').trim())
}

const PIPE_SEPARATOR = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/

/**
 * The first Markdown pipe table in `text`, as table data — or null if there is
 * none. Recognised by a line containing `|` followed by a `|---|---|`
 * separator line; the table runs until the first line without a pipe.
 */
export function parsePipeTable(text: string): TableData | null {
  const lines = text.split('\n')
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].includes('|') || !PIPE_SEPARATOR.test(lines[i + 1].trim())) continue
    const body: string[][] = [pipeCells(lines[i])]
    for (let j = i + 2; j < lines.length && lines[j].includes('|'); j++) body.push(pipeCells(lines[j]))
    const cols = Math.max(...body.map((r) => r.length))
    return {
      // A pipe table's first line is its header by definition — the line
      // above the |---| separator — so the converted table says so.
      header: true,
      rows: body.map((r) => Array.from({ length: cols }, (_, c) => fromGridCell({ text: r[c] ?? '' }))),
    }
  }
  return null
}

/** Text content as a table: a pipe table if it contains one, otherwise one
 *  single-column row per line, with bullet markers dropped. */
export function contentToTable(content: string): TableData {
  const pipe = parsePipeTable(content)
  if (pipe) return pipe
  const lines = content
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean)
  return { rows: (lines.length ? lines : ['']).map((l) => [fromGridCell({ text: l })]) }
}

// ── legacy migration ────────────────────────────────────────────────────────

/** The pre-`table` shape: a flat row-major `cells` list plus explicit
 *  dimensions, with `covered: true` placeholders. Used by both the old layout
 *  fields (`tableCells`, `tableRows`, …) and the old element fields. */
export interface LegacyTable {
  rows?: number
  cols?: number
  cells?: unknown
  colWidths?: number[]
  rowHeights?: number[]
  font?: string
  size?: number
}

export function tableFromLegacy(l: LegacyTable): TableData {
  const flat = Array.isArray(l.cells) ? (l.cells as Array<GridCell | null | undefined>) : []
  const cols = Math.max(1, l.cols ?? 1)
  const rows = Math.max(1, l.rows ?? Math.ceil(flat.length / cols))
  const cells: GridCell[] = []
  for (let i = 0; i < rows * cols; i++) {
    const c = flat[i]
    cells.push(c && typeof c === 'object' ? { ...c } : emptyTableCell())
  }
  const t = withCells(undefined, cells, cols)
  if (l.colWidths) t.colWidths = l.colWidths
  if (l.rowHeights) t.rowHeights = l.rowHeights
  if (l.font) t.font = l.font
  if (l.size != null) t.size = l.size
  return t
}

// ── geometry ────────────────────────────────────────────────────────────────

/** Normalise a track-size array to exactly `n` fractions summing to 1. A stored
 *  array of the wrong length (a hand-edit, a resize that didn't clear it) falls
 *  back to uniform rather than rendering a broken grid. */
export function tableTracks(fracs: number[] | undefined, n: number): number[] {
  const count = Math.max(1, Math.floor(n))
  if (!fracs || fracs.length !== count) return Array(count).fill(1 / count)
  const total = fracs.reduce((sum, f) => sum + (Number.isFinite(f) && f > 0 ? f : 0), 0)
  if (total <= 0) return Array(count).fill(1 / count)
  return fracs.map((f) => (Number.isFinite(f) && f > 0 ? f : 0) / total)
}

/** Cumulative pixel offsets for `n` tracks across `size` px — length n+1, so a
 *  cell spanning tracks [i, i+span) is `edges[i]` to `edges[i+span]`. Shared by
 *  the DOM renderer, bake, and PPTX export so all three agree exactly. */
export function trackEdges(fracs: number[] | undefined, n: number, size: number, origin = 0): number[] {
  const edges = [origin]
  for (const f of tableTracks(fracs, n)) edges.push(edges[edges.length - 1] + f * size)
  return edges
}

/** The rectangle a cell occupies, honouring its merge span and clamped to the
 *  grid so a colspan that overruns the last column can't run off the edge. */
export function cellRect(
  cell: GridCell,
  index: number,
  rows: number,
  cols: number,
  colEdges: number[],
  rowEdges: number[],
): { x: number; y: number; w: number; h: number } {
  const r = Math.floor(index / cols)
  const c = index % cols
  const span = Math.max(1, Math.min(cell.colspan ?? 1, cols - c))
  const rspan = Math.max(1, Math.min(cell.rowspan ?? 1, rows - r))
  const x = colEdges[c]
  const y = rowEdges[r]
  return { x, y, w: colEdges[c + span] - x, h: rowEdges[r + rspan] - y }
}

/** Flatten a table element into one box per visible cell — the form every
 *  export target understands (PPTX has no shape for a merge-aware grid). Each
 *  box carries the cell's own rule, so the export still reads as a table. */
export function tableToBoxes(el: TableElement, lineColor = 'rgba(230,236,242,0.14)'): BoxElement[] {
  const t = el.table
  const { rows, cols, cells } = tableShape(t)
  const colEdges = trackEdges(t?.colWidths, cols, el.w, el.x)
  const rowEdges = trackEdges(t?.rowHeights, rows, el.h, el.y)
  const out: BoxElement[] = []
  cells.forEach((cell, i) => {
    if (cell.covered) return
    const r = cellRect(cell, i, rows, cols, colEdges, rowEdges)
    out.push({
      type: 'box',
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      rotation: el.rotation ?? 0,
      stroke: lineColor,
      strokeWidth: 1,
      ...(cell.image
        ? { src: cell.image, fit: 'cover' as const, ...(cell.link ? { link: cell.link } : {}) }
        : {
            content: cell.text ?? '',
            font: t?.font ?? 'body',
            size: t?.size ?? TABLE_CELL_SIZE,
            align: 'center' as const,
            valign: 'middle' as const,
            // header row: the accent colour, as on screen
            ...(t?.header && i < cols ? { color: 'var(--dek-accent)' } : {}),
          }),
    })
  })
  return out
}
