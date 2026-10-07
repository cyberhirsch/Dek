import { describe, expect, it } from 'vitest'
import { buildRows, stepMove } from './steps'

const slides = [
  { content: '- a\n- b' }, // no steps
  { steps: true, content: '- one\n- two\n- three' },
  { content: 'end' },
]

describe('buildRows', () => {
  it('counts rows only on build slides', () => {
    expect(buildRows(slides[0])).toBe(0)
    expect(buildRows(slides[1])).toBe(3)
    expect(buildRows(undefined)).toBe(0)
  })
})

describe('stepMove', () => {
  it('reveals a build slide row by row before moving on', () => {
    let pos = { index: 0, revealed: 0 }
    const seen: string[] = []
    for (let i = 0; i < 6; i++) {
      pos = stepMove(slides, pos, 1)
      seen.push(`${pos.index}:${pos.revealed}`)
    }
    expect(seen).toEqual(['1:0', '1:1', '1:2', '1:3', '2:0', '2:0'])
  })

  it('steps back through the rows, and onto a build slide fully revealed', () => {
    expect(stepMove(slides, { index: 1, revealed: 2 }, -1)).toEqual({ index: 1, revealed: 1 })
    expect(stepMove(slides, { index: 2, revealed: 0 }, -1)).toEqual({ index: 1, revealed: 3 })
    expect(stepMove(slides, { index: 0, revealed: 0 }, -1)).toEqual({ index: 0, revealed: 0 })
  })
})
