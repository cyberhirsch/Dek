import { describe, expect, it } from 'vitest'
import { moveSlides } from './grouping'
import type { Slide } from './types'

const s = (title: string, group?: string): Slide => ({ layout: 'text', title, ...(group ? { group } : {}) }) as Slide
const view = (slides: Slide[]) => slides.map((x) => `${x.title}${x.group ? ':' + x.group : ''}`)

// A1 A2 | B1 B2 B3 | loose
const deck = () => [s('A1', 'A'), s('A2', 'A'), s('B1', 'B'), s('B2', 'B'), s('B3', 'B'), s('L')]

describe('moveSlides', () => {
  it('a slide dropped inside another group joins it — no split, no second heading', () => {
    const r = moveSlides(deck(), [0], 3) // A1 between B1 and B2
    expect(view(r.slides)).toEqual(['A2:A', 'B1:B', 'A1:B', 'B2:B', 'B3:B', 'L'])
    expect(r.at).toBe(2)
  })

  it('at the border between two groups, it joins the group above', () => {
    const r = moveSlides(deck(), [5], 2) // L between A2 and B1
    expect(view(r.slides)).toEqual(['A1:A', 'A2:A', 'L:A', 'B1:B', 'B2:B', 'B3:B'])
  })

  it('below an ungrouped slide, or at the very top, it becomes ungrouped', () => {
    expect(view(moveSlides(deck(), [2], 6).slides).at(-1)).toBe('B1')
    expect(view(moveSlides(deck(), [3], 0).slides)[0]).toBe('B2')
  })

  it('moves a multi-selection as one block, all joining the same group', () => {
    const r = moveSlides(deck(), [0, 5], 4) // A1 and L between B2 and B3
    expect(view(r.slides)).toEqual(['A2:A', 'B1:B', 'B2:B', 'A1:B', 'L:B', 'B3:B'])
  })

  it('a chapter dragged by its heading keeps its name', () => {
    const r = moveSlides(deck(), [0, 1], 6, true) // group A to the end
    expect(view(r.slides)).toEqual(['B1:B', 'B2:B', 'B3:B', 'L', 'A1:A', 'A2:A'])
  })

  it('a chapter is never dropped into the middle of another group', () => {
    const r = moveSlides(deck(), [0, 1], 3, true) // aimed between B1 and B2
    expect(view(r.slides)).toEqual(['B1:B', 'B2:B', 'B3:B', 'A1:A', 'A2:A', 'L'])
    expect(r.at).toBe(3)
  })

  it('does not change the slides it is given', () => {
    const d = deck()
    moveSlides(d, [0], 3)
    expect(d[0].group).toBe('A')
  })
})
