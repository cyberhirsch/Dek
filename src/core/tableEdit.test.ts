import { describe, expect, it } from 'vitest'
import {
  MIN_TRACK,
  canMerge,
  cellRange,
  cellsHaveContent,
  cellsHaveStyle,
  clearCells,
  insertColumn,
  insertRow,
  isMerged,
  lineHasContent,
  mergeCells,
  mergeWouldDropContent,
  removeColumn,
  removeRow,
  resizeTracks,
  toggleCellStyle,
  unmergeCell,
} from './tableEdit'
import { fromGridCell, tableShape, tableTracks } from './table'
import type { TableData } from './types'

const t = (...rows: TableData['rows']): TableData => ({ rows })
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

describe('resizeTracks — dragging a divider', () => {
  it('grows one track and shrinks its neighbour by the same amount', () => {
    const out = resizeTracks(undefined, 3, 0, 0.1)
    expect(out[0]).toBeCloseTo(1 / 3 + 0.1, 9)
    expect(out[1]).toBeCloseTo(1 / 3 - 0.1, 9)
    expect(out[2]).toBeCloseTo(1 / 3, 9)
    expect(sum(out)).toBeCloseTo(1, 9)
  })

  it('stops at the minimum instead of overshooting', () => {
    const out = resizeTracks([0.5, 0.5], 2, 0, 0.9)
    expect(out[1]).toBeCloseTo(MIN_TRACK, 9)
    expect(out[0]).toBeCloseTo(1 - MIN_TRACK, 9)
  })

  it('ignores a divider index outside the grid', () => {
    expect(resizeTracks(undefined, 2, 1, 0.2)).toEqual(tableTracks(undefined, 2))
  })
})

describe('rows and columns', () => {
  it('inserts a blank row at a position, keeping the rest in place', () => {
    expect(insertRow(t(['a', 'b'], ['c', 'd']), 1).rows).toEqual([['a', 'b'], ['', ''], ['c', 'd']])
    expect(insertRow(t(['a']), 1).rows).toEqual([['a'], ['']])
  })

  it('inserts a blank column at a position', () => {
    expect(insertColumn(t(['a', 'b'], ['c', 'd']), 1).rows).toEqual([['a', '', 'b'], ['c', '', 'd']])
  })

  it('removes a row or column, but never the last one', () => {
    expect(removeRow(t(['a', 'b'], ['c', 'd']), 0).rows).toEqual([['c', 'd']])
    expect(removeColumn(t(['a', 'b'], ['c', 'd']), 1).rows).toEqual([['a'], ['c']])
    expect(removeRow(t(['a', 'b']), 0).rows).toEqual([['a', 'b']])
  })

  it('keeps custom track proportions when a track is added or removed', () => {
    const added = insertColumn({ rows: [['a', 'b']], colWidths: [0.25, 0.75] }, 2)
    expect(added.colWidths).toHaveLength(3)
    expect(sum(added.colWidths!)).toBeCloseTo(1, 9)
    expect(added.colWidths![1] / added.colWidths![0]).toBeCloseTo(3, 9)
    const removed = removeColumn({ rows: [['a', 'b', 'c']], colWidths: [0.2, 0.3, 0.5] }, 0).colWidths!
    expect(removed[0]).toBeCloseTo(0.375, 9)
    expect(removed[1]).toBeCloseTo(0.625, 9)
    // uniform stays uniform — no track sizes invented
    expect('colWidths' in insertColumn(t(['a']), 1)).toBe(false)
  })

  it('grows a merge the new row passes through, covering the new position', () => {
    // A merge spanning rows 0–1; a row inserted between them joins it.
    const merged = t([{ text: 'Tall', rowspan: 2 }, 'b'], [null, 'd'])
    expect(insertRow(merged, 1).rows).toEqual([
      [{ text: 'Tall', rowspan: 3 }, 'b'],
      [null, ''],
      [null, 'd'],
    ])
  })

  it("leaves a merge alone when inserting on its edge", () => {
    const merged = t([{ text: 'Tall', rowspan: 2 }, 'b'], [null, 'd'])
    expect(insertRow(merged, 2).rows).toEqual([[{ text: 'Tall', rowspan: 2 }, 'b'], [null, 'd'], ['', '']])
  })

  it("keeps a merge alive when the row holding its owner is removed — ownership moves down", () => {
    const merged = t([{ text: 'Tall', rowspan: 3 }, 'b'], [null, 'd'], [null, 'f'])
    expect(removeRow(merged, 0).rows).toEqual([[{ text: 'Tall', rowspan: 2 }, 'd'], [null, 'f']])
  })

  it('shrinks a merge by one when a row inside it goes, and drops a span of 1', () => {
    const merged = t([{ text: 'Tall', rowspan: 2 }, 'b'], [null, 'd'])
    expect(removeRow(merged, 1).rows).toEqual([['Tall', 'b']])
  })

  it('warns only when an unmerged cell in the line has content', () => {
    expect(lineHasContent(t(['a', ''], ['', '']), 'row', 0)).toBe(true)
    expect(lineHasContent(t(['a', ''], ['', '']), 'row', 1)).toBe(false)
    // a merge owned in that row survives the removal, so it isn't "lost"
    expect(lineHasContent(t([{ text: 'Tall', rowspan: 2 }, ''], [null, '']), 'row', 0)).toBe(false)
  })
})

describe('selection', () => {
  it('selects the rectangle between two cells', () => {
    // 3×3; from (0,0) to (1,1)
    expect(cellRange(t(['', '', ''], ['', '', ''], ['', '', '']), 0, 4).sort((a, b) => a - b)).toEqual([0, 1, 3, 4])
  })

  it('grows the rectangle to take in a merge it clips', () => {
    // a 2-wide merge at (1,1)–(1,2); dragging (0,0)→(1,1) must include (1,2)
    const g = t(['', '', ''], ['', { text: 'Wide', colspan: 2 }, null])
    expect(cellRange(g, 0, 4).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('merge and unmerge', () => {
  const grid = () => t(['A', 'B', 'C'], ['D', 'E', 'F'])

  it('merges a rectangle into its top-left cell, covering the rest', () => {
    expect(mergeCells(grid(), [0, 1, 3, 4]).rows).toEqual([
      [{ text: 'A', colspan: 2, rowspan: 2 }, null, 'C'],
      [null, null, 'F'],
    ])
  })

  it('refuses a non-rectangular or single-cell selection', () => {
    expect(canMerge(grid(), [0, 1, 4])).toBe(false)
    expect(canMerge(grid(), [0])).toBe(false)
    expect(mergeCells(grid(), [0, 4]).rows).toEqual(grid().rows)
  })

  it('refuses to merge across an existing merge', () => {
    const merged = mergeCells(grid(), [0, 1])
    expect(canMerge(merged, [0, 1, 2])).toBe(false)
  })

  it('reports when merging would drop content other than the top-left', () => {
    expect(mergeWouldDropContent(grid(), [0, 1])).toBe(true)
    expect(mergeWouldDropContent(t(['A', ''], ['', '']), [0, 1, 2, 3])).toBe(false)
  })

  it('unmerges back to single cells, the owner keeping its content', () => {
    const merged = mergeCells(grid(), [0, 1, 3, 4])
    expect(isMerged(tableShape(merged).cells[0])).toBe(true)
    expect(unmergeCell(merged, 0).rows).toEqual([['A', '', 'C'], ['', '', 'F']])
  })
})

describe('bulk cell edits', () => {
  it('clears content but keeps merges and style', () => {
    const g = t([{ text: 'A', bold: true, colspan: 2 }, null], [{ image: 'p.png', link: 'https://x.io' }, 'D'])
    expect(clearCells(g, [0, 2]).rows).toEqual([[{ bold: true, colspan: 2 }, null], ['', 'D']])
    expect(cellsHaveContent(g, [0])).toBe(true)
    expect(cellsHaveContent(t(['', '']), [0, 1])).toBe(false)
  })

  it('toggles bold on for all when any lacks it, off when all have it', () => {
    const mixed = t([{ text: 'A', bold: true }, 'B'])
    const on = toggleCellStyle(mixed, [0, 1], 'bold')
    expect(cellsHaveStyle(on, [0, 1], 'bold')).toBe(true)
    const off = toggleCellStyle(on, [0, 1], 'bold')
    expect(off.rows).toEqual([['A', 'B']])
  })

  it('stores emphasis as flags, never as Markdown in the plain-text cell', () => {
    expect(fromGridCell({ text: 'A', italic: true })).toEqual({ text: 'A', italic: true })
  })
})
