import { describe, expect, it } from 'vitest'
import { chartData, formatPercent, ooxmlAngle, parseNumber, pieLayout, pieSlices, polar, slicePath } from './chart'
import type { TableData } from './types'

describe('parseNumber', () => {
  it('reads plain numbers and passes numeric cells through', () => {
    expect(parseNumber('42')).toBe(42)
    expect(parseNumber(' 42 ')).toBe(42)
    expect(parseNumber(42)).toBe(42)
    expect(parseNumber('-3')).toBe(-3)
  })

  it('treats a single comma or dot as the decimal separator', () => {
    expect(parseNumber('3,5')).toBe(3.5)
    expect(parseNumber('3.5')).toBe(3.5)
  })

  it('with both separators, the last one is decimal', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5)
    expect(parseNumber('1,234.5')).toBe(1234.5)
  })

  it('reads a repeated separator as thousands grouping', () => {
    expect(parseNumber('1.234.567')).toBe(1234567)
    expect(parseNumber('1,234,567')).toBe(1234567)
  })

  it('reads the ambiguous single comma as decimal — documented, not guessed', () => {
    expect(parseNumber('1,200')).toBe(1.2)
  })

  it('tolerates a percent sign and a currency symbol', () => {
    expect(parseNumber('42%')).toBe(42)
    expect(parseNumber('€ 3,50')).toBe(3.5)
    expect(parseNumber('$12')).toBe(12)
    expect(parseNumber('12 €')).toBe(12)
  })

  it('rejects anything that is not a number', () => {
    for (const s of ['', 'Maya', '12a', 'n/a', '1-2', undefined, null]) expect(parseNumber(s)).toBeNull()
  })
})

const t = (rows: TableData['rows'], header = false): TableData => ({ rows, header })

describe('chartData', () => {
  it('takes labels from column 1 and values from column 2', () => {
    expect(chartData(t([['Maya', 42], ['Blender', 35]]))).toEqual([
      { label: 'Maya', value: 42 },
      { label: 'Blender', value: 35 },
    ])
  })

  it('skips the header row when the table has one', () => {
    expect(chartData(t([['Tool', 'Share'], ['Maya', 42]], true))).toEqual([{ label: 'Maya', value: 42 }])
  })

  it('uses the first mostly-numeric column, so a notes column can come first', () => {
    const data = chartData(t([['Tool', 'Note', 'Share'], ['Maya', 'since 1998', 42], ['Blender', 'free', 35]], true))
    expect(data.map((d) => d.value)).toEqual([42, 35])
  })

  it('keeps a row whose value does not parse, as NaN, for the view to decide', () => {
    const data = chartData(t([['A', 1], ['B', 'n/a'], ['C', 2]]))
    expect(data[1].label).toBe('B')
    expect(Number.isNaN(data[1].value)).toBe(true)
  })

  it('skips fully blank rows', () => {
    expect(chartData(t([['A', 1], ['', ''], ['B', 2]]))).toHaveLength(2)
  })

  it('reads number cells written with a decimal comma', () => {
    expect(chartData(t([['A', '2,5']]))[0].value).toBe(2.5)
  })
})

const d = (...pairs: Array<[string, number]>) => pairs.map(([label, value]) => ({ label, value }))

describe('pieSlices', () => {
  it('orders slices largest first and covers exactly one full turn', () => {
    const s = pieSlices(d(['small', 1], ['big', 3]))
    expect(s.map((x) => x.label)).toEqual(['big', 'small'])
    expect(s[0].start).toBe(0)
    expect(s[s.length - 1].end).toBeCloseTo(Math.PI * 2, 9)
    expect(s[0].fraction).toBeCloseTo(0.75, 9)
  })

  it('drops zero, negative and non-numeric values — they are not shares of a whole', () => {
    const s = pieSlices(d(['a', 2], ['zero', 0], ['neg', -1], ['nan', Number.NaN]))
    expect(s.map((x) => x.label)).toEqual(['a'])
  })

  it('folds everything past the sixth slice into "Other", drawn last', () => {
    const s = pieSlices(d(['a', 9], ['b', 8], ['c', 7], ['d', 6], ['e', 5], ['f', 4], ['g', 3]))
    expect(s).toHaveLength(6)
    expect(s[5]).toMatchObject({ label: 'Other', value: 7, other: true })
  })

  it('is empty when nothing is positive', () => {
    expect(pieSlices(d(['a', 0]))).toEqual([])
    expect(pieSlices([])).toEqual([])
  })
})

describe('pie geometry', () => {
  it('measures angles clockwise from 12 o\'clock', () => {
    const top = polar(0, 0, 10, 0)
    const right = polar(0, 0, 10, Math.PI / 2)
    expect(top.x).toBeCloseTo(0, 9)
    expect(top.y).toBeCloseTo(-10, 9)
    expect(right.x).toBeCloseTo(10, 9)
    expect(right.y).toBeCloseTo(0, 9)
  })

  it('draws a whole-circle slice as two arcs — a single self-closing arc renders nothing', () => {
    const p = slicePath(50, 50, 40, { start: 0, end: Math.PI * 2 })
    expect(p.match(/ A /g)).toHaveLength(2)
  })

  it('uses the large-arc flag only past a half turn', () => {
    expect(slicePath(0, 0, 10, { start: 0, end: 1 })).toContain(' 0 0 1 ')
    expect(slicePath(0, 0, 10, { start: 0, end: 4 })).toContain(' 0 1 1 ')
  })

  it('keeps the pie inside its box with room for the labels', () => {
    const L = pieLayout(d(['a', 1], ['b', 1]), 1000, 500)
    expect(L.r).toBeGreaterThan(0)
    expect(L.cy - L.r).toBeGreaterThan(0)
    expect(L.cy + L.r).toBeLessThan(500)
    // labels sit outside the pie
    for (const l of L.labels) expect(Math.hypot(l.x - L.cx, l.y - L.cy)).toBeGreaterThan(L.r)
  })

  it('anchors labels away from the centre: right side start, left side end', () => {
    const L = pieLayout(d(['right', 1], ['left', 1]), 1000, 500)
    expect(L.labels.find((l) => l.label === 'right')?.anchor).toBe('start')
    expect(L.labels.find((l) => l.label === 'left')?.anchor).toBe('end')
  })
})

describe('formatPercent', () => {
  it('rounds to whole percents but never labels a real slice 0%', () => {
    expect(formatPercent(0.4235)).toBe('42%')
    expect(formatPercent(0.003)).toBe('<1%')
    expect(formatPercent(0)).toBe('0%')
  })
})

describe('ooxmlAngle', () => {
  it("converts clockwise-from-12 radians to OOXML's clockwise-from-3 60000ths of a degree", () => {
    expect(ooxmlAngle(0)).toBe(270 * 60000) // 12 o'clock
    expect(ooxmlAngle(Math.PI / 2)).toBe(0) // 3 o'clock
    expect(ooxmlAngle(Math.PI)).toBe(90 * 60000) // 6 o'clock
  })
})
