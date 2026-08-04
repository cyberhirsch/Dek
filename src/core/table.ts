// Pure grid-resize logic for the `table` layout, shared by the TopBar Rows/Cols
// stepper and the slide's own inline +/− affordances — both need the identical
// grow/shrink/confirm behavior, so it lives here once rather than being
// duplicated in two components.

import type { BoxElement, TableCell, TableElement } from './types'

/** Default base size for cell text, in stage px — the design system's body/label
 *  step. Cell text shrinks below this to fit its cell, never grows above it. */
export const TABLE_CELL_SIZE = 22
/** Floor for the shrink-to-fit, below which text stops being worth reading. */
export const TABLE_CELL_MIN_SIZE = 9

export function emptyTableCell(): TableCell {
  return { text: '' }
}

/** Normalise a track-size array to exactly `n` fractions summing to 1. A stored
 *  array that's the wrong length (a resize that didn't clear it, a hand-edit)
 *  would otherwise desync the grid from `rows`/`cols` — fall back to uniform
 *  rather than render a broken table. */
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
 *  grid so a colspan that overruns the last column can't produce a negative or
 *  runaway width. */
export function cellRect(
  cell: TableCell,
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

/** A cell worth warning about before it's discarded — has real content, and
 *  isn't just a placeholder covered by some other cell's merge. */
export function cellHasContent(cell: TableCell | undefined | null): boolean {
  return !!cell && !cell.covered && (!!cell.text?.trim() || !!cell.image)
}

/** Reflow a flat, row-major cell array from `oldRows×oldCols` to
 *  `newRows×newCols`, preserving each surviving cell's row/column position.
 *  Growing appends blank cells; shrinking drops whatever falls outside the
 *  new bounds. Never returns fewer than `newRows*newCols` cells. */
export function reflowTableCells(cells: TableCell[], oldCols: number, newRows: number, newCols: number): TableCell[] {
  const oldRows = oldCols > 0 ? Math.ceil(cells.length / oldCols) : 0
  const out: TableCell[] = []
  for (let r = 0; r < newRows; r++) {
    for (let c = 0; c < newCols; c++) {
      const survives = r < oldRows && c < oldCols
      out.push(survives ? (cells[r * oldCols + c] ?? emptyTableCell()) : emptyTableCell())
    }
  }
  return out
}

/** Whether any cell that would be dropped by resizing to `newRows×newCols`
 *  currently holds real content — the signal for a confirm-before-shrink
 *  prompt, same reasoning as the asset-orphan safety net elsewhere. */
export function resizeWouldDropContent(cells: TableCell[], oldCols: number, newRows: number, newCols: number): boolean {
  const oldRows = oldCols > 0 ? Math.ceil(cells.length / oldCols) : 0
  for (let r = 0; r < oldRows; r++) {
    for (let c = 0; c < oldCols; c++) {
      if (r < newRows && c < newCols) continue
      if (cellHasContent(cells[r * oldCols + c])) return true
    }
  }
  return false
}

/** Flatten a table element into one box per visible cell — the form every
 *  export target already understands (PPTX has no native shape for Dek's
 *  merge-aware grid). Each box carries the cell's own rule, so the exported
 *  table still reads as a table rather than floating text. Merged cells come
 *  out as a single wide/tall box; `covered` placeholders emit nothing. */
export function tableToBoxes(el: TableElement, lineColor = 'rgba(230,236,242,0.14)'): BoxElement[] {
  const cols = Math.max(1, el.cols)
  const rows = Math.max(1, el.rows)
  const colEdges = trackEdges(el.colWidths, cols, el.w, el.x)
  const rowEdges = trackEdges(el.rowHeights, rows, el.h, el.y)
  const out: BoxElement[] = []
  el.cells.forEach((cell, i) => {
    if (!cell || cell.covered) return
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
            font: el.font ?? 'body',
            size: el.size ?? TABLE_CELL_SIZE,
            align: 'center' as const,
            valign: 'middle' as const,
          }),
    })
  })
  return out
}
