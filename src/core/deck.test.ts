import { describe, it, expect } from 'vitest'
import { parseDeck, serializeDeck, blankSlide, defaultConfig } from './deck'
import { slug, uniqueSlug } from './names'
import { LAYOUT_IDS, type Deck } from './types'

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

  it('blanks a table as a uniform 3x3 grid of empty cells', () => {
    expect(blankSlide('table').table?.rows).toEqual([
      ['', '', ''],
      ['', '', ''],
      ['', '', ''],
    ])
  })
})

describe('table storage', () => {
  it('round-trips a table with track sizes, typography and mixed text/number/image/merged cells', () => {
    const deck: Deck = {
      config: defaultConfig(),
      slides: [
        {
          layout: 'table',
          title: 'Specs',
          table: {
            rows: [
              [{ text: 'Merged', colspan: 2 }, null],
              [{ image: 'a.jpg', link: 'https://x.io' }, 'plain'],
              ['Maya', 42],
            ],
            colWidths: [0.3, 0.7],
            rowHeights: [0.3, 0.3, 0.4],
            font: 'heading',
            size: 30,
          },
        },
      ],
    }
    expect(parseDeck(serializeDeck(deck)).slides[0]).toEqual(deck.slides[0])
  })

  it('writes each row on one line, so deck.md reads as a table', () => {
    const deck: Deck = {
      config: defaultConfig(),
      slides: [{ layout: 'table', title: 'Tools', table: { rows: [['Tool', 'Share'], ['Maya', 42], ['Blender', 35]] } }],
    }
    const md = serializeDeck(deck)
    expect(md).toContain('  rows:\n    - [Tool, Share]\n    - [Maya, 42]\n    - [Blender, 35]')
  })

  it('writes a canvas table element the same way — one shape, both hosts', () => {
    const deck: Deck = {
      config: defaultConfig(),
      slides: [{ layout: 'freeform', elements: [{ type: 'table', x: 0, y: 0, w: 10, h: 10, rotation: 0, table: { rows: [['a', 1]] } }] }],
    }
    expect(serializeDeck(deck)).toContain('- [a, 1]')
  })

  it('keeps other lists in block style — only table rows go flow', () => {
    const deck: Deck = { config: defaultConfig(), slides: [{ layout: 'speaker', name: 'Ada', portraits: ['a.jpg', 'b.jpg'] }] }
    expect(serializeDeck(deck)).toContain('portraits:\n  - a.jpg\n  - b.jpg')
  })

  it('parses a hand-written table exactly as typed', () => {
    const raw = `---
deck: X
---
layout: table
title: Tools
table:
  rows:
    - [Tool, Share]
    - [Maya, 42]
    - [{ image: logo.png }, ~]
`
    expect(parseDeck(raw).slides[0].table?.rows).toEqual([
      ['Tool', 'Share'],
      ['Maya', 42],
      [{ image: 'logo.png' }, null],
    ])
  })
})

describe('legacy table migration', () => {
  it('folds the old flat table* layout fields into `table`', () => {
    const raw = `---
deck: X
---
layout: table
title: Old
tableRows: 2
tableCols: 2
tableColWidths: [0.3, 0.7]
tableFont: heading
tableCells:
  - text: Tool
  - text: Share
  - image: a.png
  - text: "42"
`
    const s = parseDeck(raw).slides[0]
    expect(s.table).toEqual({ rows: [['Tool', 'Share'], [{ image: 'a.png' }, 42]], colWidths: [0.3, 0.7], font: 'heading' })
    for (const k of ['tableRows', 'tableCols', 'tableCells', 'tableColWidths', 'tableFont']) expect(k in s).toBe(false)
  })

  it('migrates a merge: covered placeholders become null', () => {
    const raw = `---
deck: X
---
layout: table
tableRows: 1
tableCols: 2
tableCells:
  - { text: Wide, colspan: 2 }
  - { covered: true }
`
    expect(parseDeck(raw).slides[0].table?.rows).toEqual([[{ text: 'Wide', colspan: 2 }, null]])
  })

  it('migrates old fields parked in stash, so switching back does not resurrect them', () => {
    const raw = `---
deck: X
---
layout: text
title: T
content: "- a"
stash:
  tableRows: 1
  tableCols: 1
  tableCells:
    - text: kept
`
    const s = parseDeck(raw).slides[0]
    expect((s.stash as { table?: unknown }).table).toEqual({ rows: [['kept']] })
    expect('tableCells' in (s.stash as object)).toBe(false)
  })

  it('migrates an old canvas table element (counts + flat cells) to the shared object', () => {
    const raw = `---
deck: X
---
layout: freeform
elements:
  - type: table
    x: 110
    y: 70
    w: 1060
    h: 580
    rotation: 0
    rows: 1
    cols: 2
    font: heading
    cells:
      - text: a
      - image: b.png
`
    const el = parseDeck(raw).slides[0].elements![0]
    expect(el).toEqual({ type: 'table', x: 110, y: 70, w: 1060, h: 580, rotation: 0, table: { rows: [['a', { image: 'b.png' }]], font: 'heading' } })
  })

  it('migrated decks write the new format and then round-trip unchanged', () => {
    const raw = `---
deck: X
---
layout: table
tableRows: 1
tableCols: 2
tableCells:
  - text: a
  - text: b
`
    const once = serializeDeck(parseDeck(raw))
    expect(once).toContain('- [a, b]')
    expect(once).not.toContain('tableCells')
    expect(serializeDeck(parseDeck(once))).toBe(once)
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
