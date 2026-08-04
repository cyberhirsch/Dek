import { describe, expect, it } from 'vitest'
import { cellHasContent, reflowTableCells, resizeWouldDropContent, tableToBoxes, tableTracks, trackEdges } from './table'
import type { TableCell, TableElement } from './types'

const grid = (cols: number, ...cells: TableCell[]): { cols: number; cells: TableCell[] } => ({ cols, cells })

describe('cellHasContent', () => {
  it('is false for blank, missing, or covered cells', () => {
    expect(cellHasContent(undefined)).toBe(false)
    expect(cellHasContent({ text: '' })).toBe(false)
    expect(cellHasContent({ text: '  ' })).toBe(false)
    expect(cellHasContent({ text: 'hi', covered: true })).toBe(false)
  })

  it('is true for a cell with text or an image', () => {
    expect(cellHasContent({ text: 'hi' })).toBe(true)
    expect(cellHasContent({ image: 'a.png' })).toBe(true)
  })
})

describe('reflowTableCells', () => {
  it('preserves each cell at its row/column position when growing', () => {
    const { cols, cells } = grid(2, { text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' })
    const out = reflowTableCells(cells, cols, 3, 3)
    // original 2x2 sits in the top-left of the new 3x3
    expect(out.map((c) => c.text)).toEqual(['A', 'B', '', 'C', 'D', '', '', '', ''])
  })

  it('drops cells outside the new bounds when shrinking', () => {
    const { cols, cells } = grid(3, { text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }, { text: 'E' }, { text: 'F' })
    const out = reflowTableCells(cells, cols, 1, 2)
    expect(out.map((c) => c.text)).toEqual(['A', 'B'])
  })

  it('always returns exactly newRows*newCols cells', () => {
    const { cols, cells } = grid(2, { text: 'A' }, { text: 'B' })
    expect(reflowTableCells(cells, cols, 4, 4)).toHaveLength(16)
  })
})

describe('resizeWouldDropContent', () => {
  it('is false when every dropped cell is blank', () => {
    const { cols, cells } = grid(2, { text: 'A' }, { text: '' }, { text: '' }, { text: '' })
    expect(resizeWouldDropContent(cells, cols, 1, 1)).toBe(false)
  })

  it('is true when a dropped cell has text or an image', () => {
    const { cols, cells } = grid(2, { text: 'A' }, { text: 'B' }, { text: '' }, { text: '' })
    expect(resizeWouldDropContent(cells, cols, 1, 1)).toBe(true)
  })

  it('ignores covered (merge-placeholder) cells being dropped', () => {
    const { cols, cells } = grid(2, { text: 'A', colspan: 2 }, { covered: true }, { text: '' }, { text: '' })
    expect(resizeWouldDropContent(cells, cols, 1, 1)).toBe(false)
  })
})

describe('tableTracks', () => {
  it('falls back to uniform when the stored array is absent or the wrong length', () => {
    expect(tableTracks(undefined, 4)).toEqual([0.25, 0.25, 0.25, 0.25])
    // a stale array left over from a resize must not desync the grid
    expect(tableTracks([0.5, 0.5], 3)).toEqual([1 / 3, 1 / 3, 1 / 3])
  })

  it('renormalises fractions that do not sum to 1', () => {
    expect(tableTracks([1, 3], 2)).toEqual([0.25, 0.75])
  })

  it('falls back to uniform rather than dividing by zero on garbage input', () => {
    expect(tableTracks([0, 0], 2)).toEqual([0.5, 0.5])
    expect(tableTracks([Number.NaN, Number.NaN], 2)).toEqual([0.5, 0.5])
  })
})

describe('trackEdges', () => {
  it('returns n+1 cumulative offsets spanning exactly the given size', () => {
    const edges = trackEdges(undefined, 4, 400, 100)
    expect(edges).toEqual([100, 200, 300, 400, 500])
  })
})

const tableEl = (over: Partial<TableElement> = {}): TableElement => ({
  type: 'table',
  x: 0,
  y: 0,
  w: 400,
  h: 200,
  rotation: 0,
  rows: 2,
  cols: 2,
  cells: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
  ...over,
})

describe('tableToBoxes', () => {
  it('divides a uniform table into evenly-tiled cell boxes', () => {
    const out = tableToBoxes(tableEl())
    expect(out).toHaveLength(4)
    const [a, b, c] = out
    expect(b.x).toBeCloseTo(a.x + a.w, 5) // columns tile with no gap
    expect(c.y).toBeCloseTo(a.y + a.h, 5) // rows tile with no gap
    expect(a.w).toBeCloseTo(200, 5)
    expect(a.h).toBeCloseTo(100, 5)
  })

  it('places cells at their cumulative-fraction offsets for non-uniform tracks', () => {
    const out = tableToBoxes(tableEl({ rows: 1, cols: 2, cells: [{ text: 'A' }, { text: 'B' }], colWidths: [0.25, 0.75] }))
    const [a, b] = out
    expect(a.w).toBeCloseTo(100, 5)
    expect(b.w).toBeCloseTo(300, 5)
    expect(b.x).toBeCloseTo(a.x + a.w, 5)
  })

  it('emits one box spanning the merged tracks, and nothing for covered cells', () => {
    const out = tableToBoxes(
      tableEl({ cells: [{ text: 'Merged', colspan: 2 }, { covered: true }, { text: 'C' }, { text: 'D' }] }),
    )
    expect(out).toHaveLength(3)
    const merged = out.find((b) => b.content === 'Merged')!
    expect(merged.w).toBeCloseTo(400, 5) // the full width of both columns
  })

  it('clamps a colspan that overruns the grid instead of running off the edge', () => {
    const out = tableToBoxes(tableEl({ rows: 1, cols: 2, cells: [{ text: 'A' }, { text: 'B', colspan: 5 }] }))
    const b = out.find((x) => x.content === 'B')!
    expect(b.x + b.w).toBeCloseTo(400, 5)
  })

  it('carries the table\'s font/size onto text cells and the image onto picture cells', () => {
    const out = tableToBoxes(
      tableEl({ rows: 1, cols: 2, cells: [{ text: 'A' }, { image: 'p.png', link: 'https://x.io' }], font: 'heading', size: 30 }),
    )
    const text = out.find((b) => b.content === 'A')!
    expect(text.font).toBe('heading')
    expect(text.size).toBe(30)
    const pic = out.find((b) => b.src === 'p.png')!
    expect(pic.link).toBe('https://x.io')
  })
})
