import { describe, it, expect } from 'vitest'
import { parseDeck, serializeDeck, blankSlide, defaultConfig } from './deck'
import { slug, uniqueSlug } from './names'
import { LAYOUT_IDS } from './types'

/** parse → serialize → parse must be idempotent on the data model. */
function roundTrip(raw: string) {
  const a = parseDeck(raw)
  const b = parseDeck(serializeDeck(a))
  return { a, b }
}

describe('parseDeck / serializeDeck round-trip', () => {
  it('preserves a full deck losslessly', () => {
    const raw = `---
deck: Test
header: "HMKW – GDVK"
theme:
  bg: "#070809"
  accent: "#7fc7ff"
---
layout: cover
title: M7
byline: "Seb Hirsch · Lecturer"
---
layout: bullets
title: ABLAUF HEUTE
items:
  - Questionnaire
  - "**Bold** point — with em dash"
`
    const { a, b } = roundTrip(raw)
    expect(b).toEqual(a)
    expect(a.slides).toHaveLength(2)
  })

  it('preserves non-ASCII (umlauts, middle dot, em dash)', () => {
    const raw = `---
deck: X
---
layout: text
title: "Sensorgröße"
content: |
  - Seb Hirsch · Designer
  - je größer — desto unschärfer
`
    const { a } = roundTrip(raw)
    expect(a.slides[0].title).toBe('Sensorgröße')
    expect(a.slides[0].content).toContain('·')
    expect(a.slides[0].content).toContain('—')
  })

  it('survives a freeform body containing a line that is just ---', () => {
    const raw = `---
deck: X
---
layout: freeform
title: Table
body: |
  <div>line one</div>
  ---
  <div>after a triple dash</div>
`
    const { a, b } = roundTrip(raw)
    expect(a.slides).toHaveLength(1)
    expect(a.slides[0].body).toContain('---')
    expect(b).toEqual(a) // the embedded --- must not split the slide
    expect(b.slides).toHaveLength(1)
  })

  it('preserves unknown fields', () => {
    const raw = `---
deck: X
---
layout: cover
title: Hi
customField: keep-me
nested:
  a: 1
`
    const { a } = roundTrip(raw)
    expect(a.slides[0].customField).toBe('keep-me')
    expect(a.slides[0].nested).toEqual({ a: 1 })
  })

  it('preserves mixed item shapes (strings and gallery objects)', () => {
    const raw = `---
deck: X
---
layout: gallery
items:
  - { image: a.jpg, label: Win }
  - { image: b.jpg, label: Mac }
`
    const { a } = roundTrip(raw)
    expect(a.slides[0].items).toEqual([
      { image: 'a.jpg', label: 'Win' },
      { image: 'b.jpg', label: 'Mac' },
    ])
  })

  it('migrates legacy bullets + items into text + content', () => {
    const raw = `---
deck: X
---
layout: bullets
title: Mixed text
items:
  - "Bulleted point"
  - text: "Plain paragraph"
    bullet: false
`
    const a = parseDeck(raw)
    expect(a.slides[0].layout).toBe('text')
    expect(a.slides[0].items).toBeUndefined()
    expect(a.slides[0].content).toBe('- Bulleted point\nPlain paragraph')
  })

  it('round-trips a Markdown content block (bullets + paragraph)', () => {
    const raw = `---
deck: X
---
layout: text
title: Mixed
content: |
  Intro paragraph.
  - **Bold** bullet
  - plain *italic* bullet
`
    const { a, b } = roundTrip(raw)
    // the YAML `|` block scalar preserves a trailing newline; parseContent ignores it
    expect(a.slides[0].content).toBe('Intro paragraph.\n- **Bold** bullet\n- plain *italic* bullet\n')
    expect(b).toEqual(a)
  })

  it('preserves group fields and ordering', () => {
    const raw = `---
deck: X
---
layout: bullets
title: A
group: Week 01
---
layout: bullets
title: B
group: Week 01
---
layout: bullets
title: C
`
    const { a } = roundTrip(raw)
    expect(a.slides.map((s) => s.group)).toEqual(['Week 01', 'Week 01', undefined])
  })

  it('handles a deck with no global config block (first block is a slide)', () => {
    const raw = `layout: cover
title: Hi
`
    const a = parseDeck(raw)
    expect(a.slides).toHaveLength(1)
    expect(a.slides[0].title).toBe('Hi')
    expect(a.config).toEqual(defaultConfig())
  })

  it('handles \\r\\n line endings', () => {
    const raw = ['---', 'deck: X', '---', 'layout: cover', 'title: Hi', ''].join('\r\n')
    const a = parseDeck(raw)
    expect(a.slides[0].title).toBe('Hi')
  })

  it('empty input yields an empty deck with defaults', () => {
    const a = parseDeck('')
    expect(a.slides).toHaveLength(0)
    expect(a.config).toEqual(defaultConfig())
  })

  it('defaults missing layout to freeform', () => {
    const a = parseDeck(`---\ndeck: X\n---\ntitle: orphan\n`)
    expect(a.slides[0].layout).toBe('freeform')
  })
})

describe('blankSlide', () => {
  it('produces a valid slide for every layout id', () => {
    for (const id of LAYOUT_IDS) {
      const s = blankSlide(id)
      expect(s.layout).toBe(id)
      // must round-trip
      const deck = { config: defaultConfig(), slides: [s] }
      const back = parseDeck(serializeDeck(deck))
      expect(back.slides[0].layout).toBe(id)
    }
  })
})

describe('parse errors', () => {
  it('names the offending slide on malformed YAML', () => {
    const raw = `---
deck: Test
---
layout: text
title: Fine
---
layout: text
title: Broken
content: [unterminated`
    expect(() => parseDeck(raw)).toThrow(/slide 2:/)
  })

  it('tags the config block when the header is malformed', () => {
    expect(() => parseDeck('---\ndeck: "unterminated\n')).toThrow(/deck config:/)
  })
})

describe('slug / uniqueSlug', () => {
  it('slugifies to filename-safe ascii', () => {
    expect(slug('Film & Postproduktion')).toBe('Film-Postproduktion')
    expect(slug('  ')).toBe('deck')
    expect(slug('a'.repeat(80))).toHaveLength(60)
  })

  it('appends -2, -3 until free', () => {
    const taken = new Set(['talk', 'talk-2'])
    expect(uniqueSlug('talk', (s) => taken.has(s))).toBe('talk-3')
    expect(uniqueSlug('talk', () => false)).toBe('talk')
  })
})
