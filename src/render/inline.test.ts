import { describe, expect, it } from 'vitest'
import { inlineMd } from './inline'

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

// htmlToInline (the contenteditable → Markdown inverse) needs a DOM; this project
// runs vitest under node with no jsdom, so its anchor handling is covered by the
// editor round-trip in the browser rather than a unit test here.
