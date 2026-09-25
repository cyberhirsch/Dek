import { describe, expect, it } from 'vitest'
import {
  cellHasContent,
  contentToTable,
  fromGridCell,
  parsePipeTable,
  reflowTableCells,
  resizeTable,
  resizeWouldDropContent,
  setTableCell,
  tableFromLegacy,
  tableImages,
  tableShape,
  tableToBoxes,
  tableTracks,
  toGridCell,
  trackEdges,
  type GridCell,
} from './table'
import type { TableData, TableElement } from './types'

const t = (...rows: TableData['rows']): TableData => ({ rows })

describe('storage ⇄ grid cells', () => {
  it('keeps plain cells as bare scalars, so deck.md reads as a table', () => {
    expect(fromGridCell({ text: 'Maya' })).toBe('Maya')
    expect(fromGridCell({ text: '' })).toBe('')
  })

  it('stores canonical numbers as numbers — and nothing that would change meaning', () => {
    expect(fromGridCell({ text: '42' })).toBe(42)
    expect(fromGridCell({ text: '3.5' })).toBe(3.5)
    // each of these would read differently as a number, so they stay text
    for (const s of ['007', '1e3', '3,5', ' 4', '+4', '42.0']) expect(fromGridCell({ text: s })).toBe(s)
  })

  it('uses an object only when a cell needs more than text', () => {
    expect(fromGridCell({ image: 'a.png' })).toEqual({ image: 'a.png' })
    expect(fromGridCell({ text: 'Q1', colspan: 2 })).toEqual({ text: 'Q1', colspan: 2 })
    expect(fromGridCell({ covered: true })).toBeNull()
  })

  it('reads every stored form back into a grid cell', () => {
    expect(toGridCell('a')).toEqual({ text: 'a' })
    expect(toGridCell(42)).toEqual({ text: '42' })
    expect(toGridCell(null)).toEqual({ covered: true })
    expect(toGridCell(undefined)).toEqual({ text: '' })
    expect(toGridCell({ image: 'p.png' })).toEqual({ image: 'p.png' })
  })
})

describe('tableShape', () => {
  it('flattens rows row-major and pads short rows to the widest', () => {
    const s = tableShape(t(['a', 'b', 'c'], ['d']))
    expect(s.rows).toBe(2)
    expect(s.cols).toBe(3)
    expect(s.cells.map((c) => c.text)).toEqual(['a', 'b', 'c', 'd', '', ''])
  })

  it('reads a hand-written scalar row as a one-cell row, not an error', () => {
    const s = tableShape({ rows: ['solo' as never, ['a', 'b']] })
    expect(s.cells.map((c) => c.text)).toEqual(['solo', '', 'a', 'b'])
  })

  it('is at least 1×1 even for a missing or empty table', () => {
    expect(tableShape(undefined)).toEqual({ rows: 1, cols: 1, cells: [{ text: '' }] })
    expect(tableShape(t())).toEqual({ rows: 1, cols: 1, cells: [{ text: '' }] })
  })
})

describe('setTableCell', () => {
  it('patches one cell and keeps the other table fields', () => {
    const before: TableData = { rows: [['a', 'b']], font: 'heading', colWidths: [0.3, 0.7] }
    const after = setTableCell(before, 1, { text: '42' })
    expect(after.rows).toEqual([['a', 42]])
    expect(after.font).toBe('heading')
    expect(after.colWidths).toEqual([0.3, 0.7])
  })
})

describe('resizeTable', () => {
  it('keeps each surviving cell at its row/column position when growing', () => {
    expect(resizeTable(t(['A', 'B'], ['C', 'D']), 3, 3).rows).toEqual([
      ['A', 'B', ''],
      ['C', 'D', ''],
      ['', '', ''],
    ])
  })

  it('drops what falls outside when shrinking', () => {
    expect(resizeTable(t(['A', 'B', 'C'], ['D', 'E', 'F']), 1, 2).rows).toEqual([['A', 'B']])
  })

  it('clears custom track sizes, which no longer fit the new grid', () => {
    const r = resizeTable({ rows: [['a', 'b']], colWidths: [0.3, 0.7], rowHeights: [1] }, 1, 3)
    expect(r.colWidths).toBeUndefined()
    expect(r.rowHeights).toBeUndefined()
  })
})

describe('resizeWouldDropContent', () => {
  it('is false when every dropped cell is blank', () => {
    expect(resizeWouldDropContent(t(['A', ''], ['', '']), 1, 1)).toBe(false)
  })

  it('is true when a dropped cell has text or an image', () => {
    expect(resizeWouldDropContent(t(['A', 'B'], ['', '']), 1, 1)).toBe(true)
    expect(resizeWouldDropContent(t(['A', { image: 'p.png' }]), 1, 1)).toBe(true)
  })

  it('ignores covered (merge-placeholder) cells', () => {
    expect(resizeWouldDropContent(t([{ text: 'A', colspan: 2 }, null], ['', '']), 1, 1)).toBe(false)
  })
})

describe('reflowTableCells', () => {
  it('always returns exactly newRows×newCols cells', () => {
    const cells: GridCell[] = [{ text: 'A' }, { text: 'B' }]
    expect(reflowTableCells(cells, 2, 4, 4)).toHaveLength(16)
  })

  it('treats covered placeholders as having no content', () => {
    expect(cellHasContent({ covered: true, text: 'x' })).toBe(false)
  })
})

describe('tableImages', () => {
  it('lists every image with its row/column path, skipping covered cells', () => {
    expect(tableImages(t(['a', { image: 'x.png' }], [null, { image: 'y.png', link: 'https://z.io' }]))).toEqual([
      { src: 'x.png', path: 'rows[0][1].image' },
      { src: 'y.png', path: 'rows[1][1].image' },
    ])
  })

  it('is empty for a missing table', () => {
    expect(tableImages(undefined)).toEqual([])
  })
})

describe('tableFromLegacy', () => {
  it('rebuilds rows from the old flat cells + dimensions, covered → null', () => {
    const legacy = tableFromLegacy({
      rows: 2,
      cols: 2,
      cells: [{ text: 'Merged', colspan: 2 }, { covered: true }, { image: 'a.jpg' }, { text: '42' }],
      colWidths: [0.3, 0.7],
      font: 'heading',
      size: 30,
    })
    expect(legacy).toEqual({
      rows: [
        [{ text: 'Merged', colspan: 2 }, null],
        [{ image: 'a.jpg' }, 42],
      ],
      colWidths: [0.3, 0.7],
      font: 'heading',
      size: 30,
    })
  })

  it('fills a short cell list out to the full grid', () => {
    expect(tableFromLegacy({ rows: 2, cols: 2, cells: [{ text: 'a' }] }).rows).toEqual([
      ['a', ''],
      ['', ''],
    ])
  })
})

describe('parsePipeTable', () => {
  it('turns a Markdown pipe table into rows, numbers kept as numbers', () => {
    const md = '| Tool | Share |\n|------|------:|\n| Maya | 42 |\n| Blender | 35 |'
    expect(parsePipeTable(md)?.rows).toEqual([
      ['Tool', 'Share'],
      ['Maya', 42],
      ['Blender', 35],
    ])
  })

  it('finds a table after leading prose and stops at the first line without a pipe', () => {
    const md = 'Intro line\n| a | b |\n|---|---|\n| 1 | 2 |\nAfter'
    expect(parsePipeTable(md)?.rows).toEqual([
      ['a', 'b'],
      [1, 2],
    ])
  })

  it('accepts tables without outer pipes, and escaped pipes inside cells', () => {
    expect(parsePipeTable('a | b\n--|--\nx \\| y | z')?.rows).toEqual([
      ['a', 'b'],
      ['x | y', 'z'],
    ])
  })

  it('marks the first line as the header, as Markdown defines it', () => {
    expect(parsePipeTable('| a | b |\n|---|---|\n| 1 | 2 |')?.header).toBe(true)
  })

  it('is null without a separator line — a stray pipe is not a table', () => {
    expect(parsePipeTable('this | that\nplain')).toBeNull()
  })
})

describe('contentToTable', () => {
  it('prefers a pipe table when there is one', () => {
    expect(contentToTable('| a | b |\n|---|---|\n| c | d |').rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
  })

  it('otherwise gives one row per line, bullet markers dropped', () => {
    expect(contentToTable('- one\n- two').rows).toEqual([['one'], ['two']])
  })
})

describe('tableTracks', () => {
  it('falls back to uniform when the stored array is absent or the wrong length', () => {
    expect(tableTracks(undefined, 4)).toEqual([0.25, 0.25, 0.25, 0.25])
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
    expect(trackEdges(undefined, 4, 400, 100)).toEqual([100, 200, 300, 400, 500])
  })
})

const el = (table: TableData): TableElement => ({ type: 'table', x: 0, y: 0, w: 400, h: 200, rotation: 0, table })

describe('tableToBoxes', () => {
  it('divides a uniform table into evenly-tiled cell boxes', () => {
    const [a, b, c] = tableToBoxes(el(t(['A', 'B'], ['C', 'D'])))
    expect(b.x).toBeCloseTo(a.x + a.w, 5)
    expect(c.y).toBeCloseTo(a.y + a.h, 5)
    expect(a.w).toBeCloseTo(200, 5)
    expect(a.h).toBeCloseTo(100, 5)
  })

  it('places cells at their cumulative-fraction offsets for non-uniform tracks', () => {
    const [a, b] = tableToBoxes(el({ rows: [['A', 'B']], colWidths: [0.25, 0.75] }))
    expect(a.w).toBeCloseTo(100, 5)
    expect(b.w).toBeCloseTo(300, 5)
    expect(b.x).toBeCloseTo(a.x + a.w, 5)
  })

  it('emits one box spanning the merged tracks, and nothing for covered cells', () => {
    const out = tableToBoxes(el(t([{ text: 'Merged', colspan: 2 }, null], ['C', 'D'])))
    expect(out).toHaveLength(3)
    expect(out.find((b) => b.content === 'Merged')!.w).toBeCloseTo(400, 5)
  })

  it('clamps a colspan that overruns the grid instead of running off the edge', () => {
    const b = tableToBoxes(el(t(['A', { text: 'B', colspan: 5 }]))).find((x) => x.content === 'B')!
    expect(b.x + b.w).toBeCloseTo(400, 5)
  })

  it('carries cell emphasis onto the exported boxes', () => {
    const out = tableToBoxes(el({ rows: [[{ text: 'A', bold: true }, { text: 'B', italic: true }]] }))
    expect(out.find((b) => b.content === 'A')!.bold).toBe(true)
    expect(out.find((b) => b.content === 'B')!.italic).toBe(true)
  })

  it("carries the table's font/size onto text cells and the image onto picture cells", () => {
    const out = tableToBoxes(el({ rows: [['A', { image: 'p.png', link: 'https://x.io' }]], font: 'heading', size: 30 }))
    const text = out.find((b) => b.content === 'A')!
    expect(text.font).toBe('heading')
    expect(text.size).toBe(30)
    expect(out.find((b) => b.src === 'p.png')!.link).toBe('https://x.io')
  })
})
