import { describe, expect, it } from 'vitest'
import { splitSlide } from './split'
import type { Slide } from './types'

describe('splitSlide', () => {
  it('balances semantic text rows across a continuation slide', () => {
    const slide: Slide = {
      layout: 'text-image',
      title: 'Failure modes',
      image: '/Failure modes Assets/hero.jpg',
      content: '- First short point\n- A much longer second point with supporting detail\nThird paragraph',
    }

    const result = splitSlide(slide, { kind: 'field', field: 'content' })

    expect(result).not.toBeNull()
    expect(result?.[0].content).toBe('- First short point\n- A much longer second point with supporting detail')
    expect(result?.[1].content).toBe('Third paragraph')
    expect(result?.[1].image).toBe(slide.image)
  })

  it('splits one long row near its midpoint', () => {
    const slide: Slide = {
      layout: 'text',
      content: '- One long sentence that needs to continue onto another slide cleanly',
    }

    const result = splitSlide(slide, { kind: 'field', field: 'content' })

    expect(result?.[0].content).toMatch(/^- /)
    expect(result?.[1].content).toMatch(/^- /)
    expect(`${result?.[0].content} ${result?.[1].content}`.replace(/- /g, '')).toContain('another slide')
  })

  it('splits a long scalar text field across duplicated layouts', () => {
    const slide: Slide = {
      layout: 'statement',
      text: 'A long statement that should continue onto another slide when it becomes too small',
      cite: 'Source',
    }

    const result = splitSlide(slide, { kind: 'field', field: 'text' })

    expect(result?.[0].text).not.toBe(result?.[1].text)
    expect(result?.[0].cite).toBe('Source')
    expect(result?.[1].cite).toBe('Source')
  })

  it('splits a freeform text box without changing its geometry', () => {
    const slide: Slide = {
      layout: 'freeform',
      elements: [
        { type: 'box', x: 20, y: 30, w: 300, h: 120, content: 'First paragraph\nSecond paragraph' },
      ],
    }

    const result = splitSlide(slide, { kind: 'element', index: 0 })

    expect(result?.[0].elements?.[0]).toMatchObject({ x: 20, y: 30, content: 'First paragraph' })
    expect(result?.[1].elements?.[0]).toMatchObject({ x: 20, y: 30, content: 'Second paragraph' })
  })
})
