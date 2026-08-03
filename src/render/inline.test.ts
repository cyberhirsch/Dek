import { describe, expect, it } from 'vitest'
import { inlineMd, parseContent, rowsToContent } from './inline'

describe('inlineMd links', () => {
  it('renders [text](url) as a safe anchor', () => {
    const html = inlineMd('see [the docs](https://example.com/a)')
    expect(html).toContain('<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">the docs</a>')
  })

  it('allows mailto and keeps emphasis inside the link text', () => {
    expect(inlineMd('[mail](mailto:a@b.com)')).toContain('href="mailto:a@b.com"')
    expect(inlineMd('[**bold** link](https://x.io)')).toContain('<strong>bold</strong>')
  })

  it('neutralises non-http(s)/mailto schemes', () => {
    const html = inlineMd('[x](javascript:alert(1))')
    expect(html).toContain('href="#"')
    expect(html).not.toContain('javascript:')
  })

  it('escapes HTML before linkifying so markup cannot be injected', () => {
    expect(inlineMd('[a](https://x)<script>')).toContain('&lt;script&gt;')
  })
})

describe('parseContent', () => {
  // Content round-trips through parseContent on every keystroke while a bullet
  // list is being live-edited (row text → rowsToContent → slide.content →
  // parseContent → back into the row's own prop). Stripping a trailing space
  // here used to delete the character the user had just pressed mid-typing —
  // e.g. typing "foo " to start a new word glued it straight to the next one.
  it('keeps a trailing space on a bullet row', () => {
    expect(parseContent('- foo ')).toEqual([{ text: 'foo ', bullet: true }])
  })

  it('keeps a trailing space on a plain row', () => {
    expect(parseContent('foo ')).toEqual([{ text: 'foo ', bullet: false }])
  })

  it('still strips leading indentation on a plain row', () => {
    expect(parseContent('   foo')).toEqual([{ text: 'foo', bullet: false }])
  })

  it('still drops whitespace-only lines', () => {
    expect(parseContent('- a\n   \n- b')).toEqual([
      { text: 'a', bullet: true },
      { text: 'b', bullet: true },
    ])
  })

  it('round-trips a trailing space through rowsToContent unchanged', () => {
    const rows = parseContent('- foo ')
    expect(parseContent(rowsToContent(rows))).toEqual(rows)
  })
})

// htmlToInline (the contenteditable → Markdown inverse) needs a DOM; this project
// runs vitest under node with no jsdom, so its anchor handling is covered by the
// editor round-trip in the browser rather than a unit test here.
