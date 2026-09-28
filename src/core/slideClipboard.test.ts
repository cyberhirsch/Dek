import { describe, expect, it } from 'vitest'
import { SLIDES_MARKER, slidesFromText, slidesToText } from './slideClipboard'
import type { Slide } from './types'

const slides: Slide[] = [
  { layout: 'text', title: 'One', content: '- a\n- b' },
  { layout: 'table', title: 'T', table: { rows: [['x', 1]], header: true } },
]

describe('slide clipboard text', () => {
  it('round-trips slides through the text form', () => {
    const text = slidesToText(slides)
    expect(text.startsWith(SLIDES_MARKER)).toBe(true)
    expect(slidesFromText(text)).toEqual(slides)
  })

  it("takes a whole deck file's slides and drops its config", () => {
    const deck = '---\ndeck: Talk\nratio: "16:9"\n---\nlayout: statement\ntext: Hi\n'
    expect(slidesFromText(deck)).toEqual([{ layout: 'statement', text: 'Hi' }])
  })

  it('takes bare slide blocks, as an LLM would write them', () => {
    expect(slidesFromText('layout: section\ntitle: Part 2')).toEqual([{ layout: 'section', title: 'Part 2' }])
  })

  it('is null for ordinary text, so a normal paste stays a normal paste', () => {
    expect(slidesFromText('Just a sentence.')).toBeNull()
    expect(slidesFromText('')).toBeNull()
    expect(slidesFromText('title: no layout here')).toBeNull()
  })
})
