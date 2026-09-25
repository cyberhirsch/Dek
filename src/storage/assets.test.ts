import { describe, expect, it } from 'vitest'
import type { Deck, Slide } from '../core/types'
import {
  BUNDLE_ASSETS,
  assetsFolderForFile,
  bundleAssetRef,
  bundleDeckName,
  canonicalAssetRef,
  collectAssetRefs,
  localAssetRefs,
  mapSlideAssetRefs,
} from './assets'
import { resolveAssetsDirName } from './fsdir'

const slide: Slide = {
  layout: 'freeform',
  image: 'Talk Assets/layout.jpg',
  poster: 'https://example.com/poster.jpg',
  portraits: ['Talk Assets/person.png'],
  items: [{ image: '/Talk Assets/gallery.webp' }],
  elements: [
    { type: 'box', x: 0, y: 0, w: 100, h: 100, src: 'Talk Assets/box.png' },
    { type: 'image', x: 0, y: 0, w: 100, h: 100, src: 'Talk Assets/canvas.png' },
    { type: 'video', x: 0, y: 0, w: 100, h: 100, video: 'https://example.com/video', poster: 'Talk Assets/video.jpg' },
  ],
}

/** A DirHandle stub containing only the named subfolders (no files). `isDir()`
 *  identifies a directory by its `getFileHandle` property, so entries carry one. */
function fakeDir(subfolders: string[]) {
  const entry = (name: string) => ({ name, getFileHandle: async () => undefined })
  return {
    name: 'bundle',
    async getDirectoryHandle(name: string) {
      if (subfolders.includes(name)) return entry(name)
      throw new Error('NotFoundError')
    },
    async *values() {
      for (const name of subfolders) yield entry(name)
    },
  } as never
}

describe('bundle layout', () => {
  it('writes deck-name-free asset refs, so renaming cannot orphan images', () => {
    expect(bundleAssetRef('hero.webp')).toBe('Assets/hero.webp')
    expect(BUNDLE_ASSETS).toBe('Assets')
  })

  it('takes the deck name from the bundle folder', () => {
    expect(bundleDeckName('My Talk.dek')).toBe('My Talk')
    expect(bundleDeckName('Open Source & AI.DEK')).toBe('Open Source & AI')
    expect(bundleDeckName('no-extension')).toBe('no-extension')
  })

  it('resolves to the plain Assets folder for a bundle', async () => {
    expect(await resolveAssetsDirName(fakeDir(['Assets']), 'deck.md')).toBe('Assets')
  })

  it('prefers an existing legacy "<deck> Assets" folder so old decks keep working', async () => {
    expect(await resolveAssetsDirName(fakeDir(['My Talk Assets']), 'My Talk.md')).toBe('My Talk Assets')
  })

  it('defaults a fresh deck with no assets folder to the bundle layout', async () => {
    expect(await resolveAssetsDirName(fakeDir([]), 'My Talk.md')).toBe('Assets')
  })

  it('keeps per-deck naming in a workspace shared with other decks', async () => {
    // A sibling "<other deck> Assets" means a plain Assets/ would collide.
    expect(await resolveAssetsDirName(fakeDir(['Other Deck Assets']), 'My Talk.md')).toBe('My Talk Assets')
  })

  it('treats deck.md as a bundle even beside legacy folders', async () => {
    expect(await resolveAssetsDirName(fakeDir(['Other Deck Assets']), 'deck.md')).toBe('Assets')
  })
})

describe('asset references', () => {
  it('derives the Assets folder exactly from the Markdown filename', () => {
    const file = 'Open Source & AI dek - SIM Edition.md'
    expect(assetsFolderForFile(file)).toBe('Open Source & AI dek - SIM Edition Assets')
    expect(assetsFolderForFile('My Talk.md')).toBe('My Talk Assets')
    expect(canonicalAssetRef(file, 'hero.webp')).toBe('/Open Source & AI dek - SIM Edition Assets/hero.webp')
  })

  it('collects layout, gallery, portrait, and canvas image fields', () => {
    expect(collectAssetRefs([slide])).toEqual([
      'Talk Assets/layout.jpg',
      'https://example.com/poster.jpg',
      'Talk Assets/person.png',
      '/Talk Assets/gallery.webp',
      'Talk Assets/box.png',
      'Talk Assets/canvas.png',
      'Talk Assets/video.jpg',
    ])
  })

  it('only requests folder access for local references', () => {
    const deck: Deck = { config: {}, slides: [slide] }
    expect(localAssetRefs(deck)).toEqual([
      'Talk Assets/layout.jpg',
      'Talk Assets/person.png',
      '/Talk Assets/gallery.webp',
      'Talk Assets/box.png',
      'Talk Assets/canvas.png',
      'Talk Assets/video.jpg',
    ])
  })

  it('maps canvas and layout image fields together', () => {
    const mapped = mapSlideAssetRefs(slide, (ref) => `resolved:${ref}`)
    expect(mapped.image).toBe('resolved:Talk Assets/layout.jpg')
    expect(mapped.elements?.[0]).toMatchObject({ src: 'resolved:Talk Assets/box.png' })
    expect(mapped.elements?.[1]).toMatchObject({ src: 'resolved:Talk Assets/canvas.png' })
    expect(mapped.elements?.[2]).toMatchObject({ poster: 'resolved:Talk Assets/video.jpg' })
  })
})

// The mapper is what turns an upload's temporary blob: URL back into an
// Assets/ path on save. Every location it misses gets saved as a dead blob:
// URL — the picture is gone after a reload while its file sits orphaned.
describe('asset references — every image location', () => {
  const R = (ref: string) => `R:${ref}`

  it('maps images inside a table layout, and leaves text and merge placeholders alone', () => {
    const s: Slide = { layout: 'table', table: { rows: [['Tool', { image: 'Assets/a.png', link: 'https://x.io' }], [null, 42]] } }
    expect(mapSlideAssetRefs(s, R).table?.rows).toEqual([
      ['Tool', { image: 'R:Assets/a.png', link: 'https://x.io' }],
      [null, 42],
    ])
  })

  it('maps images inside a canvas table element', () => {
    const s: Slide = {
      layout: 'freeform',
      elements: [{ type: 'table', x: 0, y: 0, w: 10, h: 10, rotation: 0, table: { rows: [[{ image: 'Assets/b.png' }]] } }],
    }
    const el = mapSlideAssetRefs(s, R).elements![0]
    expect(el.type === 'table' && el.table.rows).toEqual([[{ image: 'R:Assets/b.png' }]])
  })

  it('maps images parked in stash by a layout switch, and keeps stash free of a layout key', () => {
    const s: Slide = {
      layout: 'text',
      content: '- a',
      stash: { image: 'Assets/parked.png', items: ['Assets/g.png'], table: { rows: [[{ image: 'Assets/t.png' }]] } },
    }
    const stash = mapSlideAssetRefs(s, R).stash as Slide
    expect(stash.image).toBe('R:Assets/parked.png')
    expect(stash.items).toEqual(['R:Assets/g.png'])
    expect(stash.table?.rows).toEqual([[{ image: 'R:Assets/t.png' }]])
    expect('layout' in stash).toBe(false)
  })

  it('maps bare-string gallery items — but never text items elsewhere', () => {
    expect(mapSlideAssetRefs({ layout: 'gallery', items: ['Assets/g.png'] }, R).items).toEqual(['R:Assets/g.png'])
    expect(mapSlideAssetRefs({ layout: 'text', items: ['a bullet'] }, R).items).toEqual(['a bullet'])
  })

  it('collects table and stashed images, so Save As copies them into a new bundle', () => {
    const refs = collectAssetRefs([
      { layout: 'table', table: { rows: [[{ image: 'Assets/cell.png' }]] } },
      { layout: 'text', stash: { image: 'Assets/parked.png' } },
    ])
    expect(refs.sort()).toEqual(['Assets/cell.png', 'Assets/parked.png'])
  })

  it('turns an uploaded blob: URL in a table cell back into its Assets path on save', () => {
    const urlToPath = new Map([['blob:abc', 'Assets/upload_1.png']])
    const saved = mapSlideAssetRefs(
      { layout: 'table', table: { rows: [[{ image: 'blob:abc' }]] } },
      (ref) => urlToPath.get(ref) ?? ref,
    )
    expect(saved.table?.rows).toEqual([[{ image: 'Assets/upload_1.png' }]])
  })
})
