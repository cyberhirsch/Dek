import { describe, it, expect } from 'vitest'
import { convertLayout } from './convert'
import type { Slide, BoxElement } from './types'

describe('convertLayout — slot mapping', () => {
  it('reads a statement as text (lede → prose) and parks the cite', () => {
    const stmt: Slide = { layout: 'statement', text: 'A deck is just text.', cite: 'the idea' }
    const text = convertLayout(stmt, 'text')
    expect(text.layout).toBe('text')
    expect(text.content).toBe('A deck is just text.')
    expect(text.title).toBeUndefined()
    // cite has no slot in `text` → kept hidden, not lost
    expect(text.stash?.cite).toBe('the idea')
  })

  it('is reversible: statement → text → statement restores the cite', () => {
    const stmt: Slide = { layout: 'statement', text: 'Big idea.', cite: 'me' }
    const back = convertLayout(convertLayout(stmt, 'text'), 'statement')
    expect(back.layout).toBe('statement')
    expect(back.text).toBe('Big idea.')
    expect(back.cite).toBe('me')
    expect(back.stash).toBeUndefined()
  })

  it('carries heading + prose across text ⇄ text-image', () => {
    const text: Slide = { layout: 'text', title: 'Topic', content: '- a\n- b' }
    const ti = convertLayout(text, 'text-image')
    expect(ti.title).toBe('Topic')
    expect(ti.content).toBe('- a\n- b')
  })
})

describe('convertLayout — freeform bake (font fidelity, no doubling)', () => {
  it('bakes a text slide and keeps the heading light + italic (not bold/upright)', () => {
    const text: Slide = { layout: 'text', title: 'Heading', content: 'body' }
    const ff = convertLayout(text, 'freeform')
    expect(ff.layout).toBe('freeform')
    const head = ff.elements!.find((e) => e.type === 'box' && (e as BoxElement).content === 'Heading') as BoxElement
    expect(head.italic).toBe(true)
    expect(head.weight).toBe(300)
    expect(head.bold).toBeFalsy()
  })

  it('converting freeform back to a semantic layout leaves no active elements (no doubling)', () => {
    const text: Slide = { layout: 'text', title: 'H', content: 'B' }
    const ff = convertLayout(text, 'freeform')
    const back = convertLayout(ff, 'text')
    expect(back.layout).toBe('text')
    expect(back.elements).toBeUndefined()
    expect(back.title).toBe('H')
  })
})

describe('convertLayout — best-effort un-bake', () => {
  it('first text box → heading, the rest → prose, and parks leftover canvas', () => {
    const ff: Slide = {
      layout: 'freeform',
      elements: [
        { type: 'box', x: 0, y: 0, w: 100, h: 50, content: 'Title here' },
        { type: 'box', x: 0, y: 60, w: 100, h: 50, content: 'paragraph one' },
        { type: 'arrow', x: 0, y: 200, w: 80, h: 0 },
      ],
    }
    const text = convertLayout(ff, 'text')
    expect(text.title).toBe('Title here')
    expect(text.content).toBe('paragraph one')
    // the arrow has no slot in `text` → parked under stash.elements
    expect(text.stash?.elements?.length).toBe(1)
    expect(text.stash?.elements?.[0].type).toBe('arrow')
  })

  it('multiple freeform images un-bake into a gallery', () => {
    const ff: Slide = {
      layout: 'freeform',
      elements: [
        { type: 'image', x: 0, y: 0, w: 100, h: 100, src: 'a.png' },
        { type: 'image', x: 110, y: 0, w: 100, h: 100, src: 'b.png' },
      ],
    }
    const gal = convertLayout(ff, 'gallery')
    expect(gal.items?.length).toBe(2)
  })
})
