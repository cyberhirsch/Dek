// Pure grid-resize logic for the `table` layout, shared by the TopBar Rows/Cols
// stepper and the slide's own inline +/− affordances — both need the identical
// grow/shrink/confirm behavior, so it lives here once rather than being
// duplicated in two components.

import type { TableCell } from './types'

export function emptyTableCell(): TableCell {
  return { text: '' }
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
