// Import entry point: dispatch a picked file to the right parser, and a helper to
// move embedded (data-URL) images into the deck's real storage after import.
import type { Deck, BoxElement, GalleryItem } from '../core/types'
import type { ImportResult } from './pptx'

export type { ImportResult }

/** Parse a picked .pptx / .pdf into a deck. The parsers (and their heavy deps —
 *  JSZip, pdf.js) are loaded on demand so the editor bundle stays lean. */
export async function importFile(file: File, onProgress?: (done: number, total: number) => void): Promise<ImportResult> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pptx') {
    const { importPptx } = await import('./pptx')
    return importPptx(await file.arrayBuffer(), file.name)
  }
  if (ext === 'pdf') {
    const { importPdf } = await import('./pdf')
    return importPdf(await file.arrayBuffer(), file.name, onProgress)
  }
  throw new Error(`Unsupported file type ".${ext}". Import PowerPoint (.pptx) or PDF — export Keynote/Google Slides to PowerPoint first.`)
}

/**
 * Replace every embedded data-URL image in the deck with a stored reference,
 * via `upload` (the active storage backend). Browser storage returns the data URL
 * unchanged (inlined); the dev server / folder backends write a real file and
 * return its path — so an imported deck lands its images in the right place.
 */
export async function rehomeImages(deck: Deck, upload: (name: string, dataUrl: string) => Promise<string>): Promise<void> {
  const cache = new Map<string, string>()
  let n = 0
  async function conv(u: string | undefined): Promise<string | undefined> {
    if (!u || !u.startsWith('data:')) return u
    const cached = cache.get(u)
    if (cached) return cached
    const ext = (u.slice(5, u.indexOf(';')).split('/')[1] || 'png').replace('+xml', '')
    const url = await upload(`img_${++n}.${ext}`, u)
    cache.set(u, url)
    return url
  }
  for (const s of deck.slides) {
    if (typeof s.image === 'string') s.image = await conv(s.image)
    if (typeof s.poster === 'string') s.poster = await conv(s.poster)
    if (Array.isArray(s.items)) {
      for (const it of s.items) {
        if (it && typeof it === 'object' && 'image' in it) {
          const g = it as GalleryItem
          g.image = (await conv(g.image)) ?? g.image
        }
      }
    }
    if (Array.isArray(s.elements)) {
      for (const el of s.elements) {
        if (el.type === 'box') {
          const b = el as BoxElement
          if (typeof b.src === 'string') b.src = await conv(b.src)
        }
      }
    }
  }
}
