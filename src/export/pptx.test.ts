import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { deckToPptx, inlineRuns } from './pptx'
import type { Deck } from '../core/types'

// 1×1 transparent PNG.
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const resolveImage = async (url: string) => (url ? { base64: TINY_PNG, ext: 'png' } : null)

// A pragmatic XML tag-balance check — the hand-written OOXML is the risky part,
// and the node test env has no DOMParser. Attribute values never contain a raw
// '>' and text is entity-escaped, so a stack of open tags validates structure.
function assertWellFormed(xml: string, part: string) {
  const stack: string[] = []
  const re = /<([!?/]?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const [, prefix, name, , selfClose] = m
    if (prefix === '?' || prefix === '!') continue
    if (prefix === '/') {
      const top = stack.pop()
      if (top !== name) throw new Error(`${part}: </${name}> closes <${top}>`)
    } else if (!selfClose) {
      stack.push(name)
    }
  }
  if (stack.length) throw new Error(`${part}: unclosed <${stack[stack.length - 1]}>`)
}

async function build(deck: Deck): Promise<JSZip> {
  const blob = await deckToPptx(deck, resolveImage)
  const buf = new Uint8Array(await blob.arrayBuffer())
  return JSZip.loadAsync(buf)
}

describe('deckToPptx', () => {
  const deck: Deck = {
    config: { deck: 'My Talk', theme: { bg: '#070809', text: '#e6ecf2', accent: '#7fc7ff', accent2: '#ffb474' } },
    slides: [
      { layout: 'cover', title: 'Hello', subtitle: 'A subtitle', byline: 'by me' },
      { layout: 'text', title: 'Points', content: '- first\n- **bold** point\nplain para' },
      { layout: 'image-full', image: '/Assets/pic.png', title: 'Caption' },
    ],
  }

  it('produces a package with all required OPC parts', async () => {
    const zip = await build(deck)
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
      'ppt/presProps.xml',
      'ppt/theme/theme1.xml',
      'ppt/slideMasters/slideMaster1.xml',
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      'ppt/slideLayouts/slideLayout1.xml',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      'ppt/slides/slide1.xml',
      'ppt/slides/slide2.xml',
      'ppt/slides/slide3.xml',
      'docProps/core.xml',
      'docProps/app.xml',
    ]) {
      expect(zip.file(part), part).not.toBeNull()
    }
  })

  it('emits well-formed XML for every part', async () => {
    const zip = await build(deck)
    const names = Object.keys(zip.files).filter((n) => n.endsWith('.xml') || n.endsWith('.rels'))
    for (const name of names) {
      const xml = await zip.file(name)!.async('string')
      expect(() => assertWellFormed(xml, name)).not.toThrow()
    }
  })

  it('lists one slide id + relationship per slide', async () => {
    const zip = await build(deck)
    const pres = await zip.file('ppt/presentation.xml')!.async('string')
    expect((pres.match(/<p:sldId /g) ?? []).length).toBe(3)
    const rels = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string')
    expect((rels.match(/relationships\/slide"/g) ?? []).length).toBe(3)
  })

  it('writes slide text as drawingml runs (bold survives)', async () => {
    const zip = await build(deck)
    const s1 = await zip.file('ppt/slides/slide1.xml')!.async('string')
    expect(s1).toContain('<a:t>Hello</a:t>')
    const s2 = await zip.file('ppt/slides/slide2.xml')!.async('string')
    expect(s2).toContain('<a:t>first</a:t>')
    expect(s2).toMatch(/b="1"[^>]*\/>\s*<\/a:rPr>?|b="1"/) // the bold run carries b="1"
    expect(s2).toContain('<a:t>bold</a:t>')
  })

  it('embeds a referenced image as a media part with a slide relationship', async () => {
    const zip = await build(deck)
    expect(zip.file('ppt/media/image1.png')).not.toBeNull()
    const s3rels = await zip.file('ppt/slides/_rels/slide3.xml.rels')!.async('string')
    expect(s3rels).toContain('../media/image1.png')
    const s3 = await zip.file('ppt/slides/slide3.xml')!.async('string')
    expect(s3).toMatch(/<a:blip r:embed="rId\d+"\/>/)
  })

  it('lists an image Default content-type and the slide overrides', async () => {
    const zip = await build(deck)
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect(ct).toContain('Extension="png"')
    expect((ct.match(/presentationml\.slide\+xml/g) ?? []).length).toBe(3)
  })

  it('forms a valid OPC package: every part typed, every relationship target resolves', async () => {
    const zip = await build(deck)
    const parts = Object.keys(zip.files).filter((n) => !zip.files[n].dir)

    // 1. content types cover every part
    const ct = await zip.file('[Content_Types].xml')!.async('string')
    const defaults = new Set([...ct.matchAll(/Extension="([^"]+)"/g)].map((m) => m[1].toLowerCase()))
    const overrides = new Set([...ct.matchAll(/PartName="([^"]+)"/g)].map((m) => m[1]))
    for (const part of parts) {
      if (part === '[Content_Types].xml') continue
      const ext = part.split('.').pop()!.toLowerCase()
      const typed = defaults.has(ext) || overrides.has('/' + part)
      expect(typed, `no content type for ${part}`).toBe(true)
    }

    // 2. every relationship Target points at a part that exists
    const dir = (p: string) => p.split('/').slice(0, -1).join('/')
    const resolve = (base: string, target: string) => {
      const segs = (base ? base.split('/') : []).concat(target.split('/'))
      const out: string[] = []
      for (const s of segs) {
        if (s === '' || s === '.') continue
        if (s === '..') out.pop()
        else out.push(s)
      }
      return out.join('/')
    }
    for (const part of parts.filter((p) => p.endsWith('.rels'))) {
      // ppt/_rels/presentation.xml.rels → base dir is ppt
      const base = dir(dir(part))
      const rels = await zip.file(part)!.async('string')
      for (const m of rels.matchAll(/Target="([^"]+)"(?:\s+TargetMode="External")?/g)) {
        const target = m[1]
        if (/^https?:|^mailto:/.test(target)) continue
        const resolved = resolve(base, target)
        expect(zip.file(resolved), `${part} → ${target} (missing)`).not.toBeNull()
      }
    }
  })

  it('skips images that do not resolve without breaking the package', async () => {
    const zip = await deckToPptx(deck, async () => null).then(async (b) =>
      JSZip.loadAsync(new Uint8Array(await b.arrayBuffer())),
    )
    expect(zip.file('ppt/media/image1.png')).toBeNull()
    const s3 = await zip.file('ppt/slides/slide3.xml')!.async('string')
    expect(s3).not.toContain('<a:blip')
    // still well-formed
    expect(() => assertWellFormed(s3, 'slide3')).not.toThrow()
  })
})

describe('inlineRuns', () => {
  it('splits bold / italic / plain into styled runs', () => {
    expect(inlineRuns('a **b** c')).toEqual([
      { text: 'a ', bold: false, italic: false, underline: false, strike: false },
      { text: 'b', bold: true, italic: false, underline: false, strike: false },
      { text: ' c', bold: false, italic: false, underline: false, strike: false },
    ])
  })

  it('captures a link target', () => {
    const runs = inlineRuns('see [docs](https://x.com)')
    const link = runs.find((r) => r.href)
    expect(link).toMatchObject({ text: 'docs', href: 'https://x.com' })
  })

  it('neutralises an unsafe link href', () => {
    const runs = inlineRuns('[x](javascript:alert(1))')
    expect(runs[0].href).toBeUndefined()
  })

  it('handles underline tags and inline code', () => {
    expect(inlineRuns('<u>u</u> `c`')).toEqual([
      { text: 'u', bold: false, italic: false, underline: true, strike: false },
      { text: ' ', bold: false, italic: false, underline: false, strike: false },
      { text: 'c', bold: false, italic: false, underline: false, strike: false },
    ])
  })
})
