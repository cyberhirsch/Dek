import { describe, expect, it } from 'vitest'
import { cellHasContent, reflowTableCells, resizeWouldDropContent } from './table'
import type { TableCell } from './types'

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
