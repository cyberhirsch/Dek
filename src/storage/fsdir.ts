// Directory backend (File System Access). Opening a *folder* lets us read a
// deck's .md AND its images (so they display), and write both back. Each deck
// keeps its images in a sibling "<deck> Assets" folder, so several decks can
// share one folder without clashing. Images load as object URLs for display; on
// save we restore their original relative paths so the saved .md stays clean.
import { parseDeck, serializeDeck } from '../core/deck'
import type { Deck, Slide } from '../core/types'
import type { StorageBackend } from './types'

type FileHandle = {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string | BufferSource | Blob): Promise<void>; close(): Promise<void> }>
}
type DirHandle = {
  name: string
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>
  values(): AsyncIterable<FileHandle | DirHandle>
}

const w = window as unknown as { showDirectoryPicker?: (o?: unknown) => Promise<DirHandle> }

export function supportsDir(): boolean {
  return typeof w.showDirectoryPicker === 'function'
}
export async function pickDir(): Promise<DirHandle> {
  return w.showDirectoryPicker!({ mode: 'readwrite' })
}

const isDir = (h: FileHandle | DirHandle): h is DirHandle => 'getFileHandle' in h

const ILLEGAL = /[/\\:*?"<>|]/g
/** Filesystem-safe deck name (keeps spaces/hyphens; strips illegal characters). */
function cleanName(name: string): string {
  return (name || 'deck').replace(ILLEGAL, '').trim().slice(0, 80) || 'deck'
}
const assetsFolderFor = (deckName: string) => `${cleanName(deckName)} Assets`
const mdBase = (md: string) => md.replace(/\.md$/, '')

function assetFileName(ref: string, blob: Blob, i: number): string {
  const base = ref.split('/').pop()
  if (base && !ref.startsWith('blob:') && !ref.startsWith('data:') && /\.[a-z0-9]+$/i.test(base)) return base
  const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '')
  return `img_${i}.${ext}`
}

/** Walk the image-bearing fields of a slide, mapping each path/url through fn. */
function mapImages(slide: Slide, fn: (v: string) => string): Slide {
  const s: Slide = { ...slide }
  if (typeof s.image === 'string') s.image = fn(s.image)
  if (typeof s.poster === 'string') s.poster = fn(s.poster)
  if (Array.isArray(s.portraits)) s.portraits = s.portraits.map((p) => (typeof p === 'string' ? fn(p) : p))
  if (Array.isArray(s.items)) {
    s.items = s.items.map((it) =>
      it && typeof it === 'object' && 'image' in it ? { ...it, image: fn((it as { image: string }).image) } : it,
    )
  }
  return s
}
function collectImageRefs(slides: Slide[]): string[] {
  const set = new Set<string>()
  for (const s of slides) mapImages(s, (v) => (v && set.add(v), v))
  return [...set]
}

/**
 * Save As to a folder: pick a destination, write `<deck>.md` plus a
 * `<deck> Assets/` folder with every referenced image, then continue editing
 * there. Returns the reloaded deck (images hydrated from the new folder).
 */
export async function saveAsFolder(name: string, deck: Deck): Promise<{ backend: StorageBackend; deck: Deck; dirName: string }> {
  const dir = await pickDir()
  const mdName = `${cleanName(name)}.md`
  const folder = assetsFolderFor(name)
  const assets = await dir.getDirectoryHandle(folder, { create: true })

  const map = new Map<string, string>()
  let i = 0
  for (const ref of collectImageRefs(deck.slides)) {
    try {
      const blob = await (await fetch(ref)).blob()
      const fn = assetFileName(ref, blob, i++)
      const h = await assets.getFileHandle(fn, { create: true })
      const ws = await h.createWritable()
      await ws.write(blob)
      await ws.close()
      map.set(ref, `/${folder}/${fn}`)
    } catch {
      /* unreachable image — leave its ref as-is */
    }
  }

  const saved: Deck = {
    config: { ...deck.config, deck: name || deck.config.deck },
    slides: deck.slides.map((s) => mapImages(s, (v) => map.get(v) ?? v)),
  }
  const mh = await dir.getFileHandle(mdName, { create: true })
  const ws = await mh.createWritable()
  await ws.write(serializeDeck(saved))
  await ws.close()

  const backend = fsDirBackend(dir, mdName)
  return { backend, deck: await backend.loadDeck(), dirName: dir.name }
}

export function fsDirBackend(dir: DirHandle, mdName = 'deck.md'): StorageBackend {
  let md = mdName
  const urlToPath = new Map<string, string>() // objectURL -> original ref, for save

  async function fileAtPath(ref: string): Promise<FileHandle | null> {
    const segs = ref.replace(/^\.?\//, '').split('/').filter(Boolean)
    const file = segs.pop()
    if (!file) return null
    try {
      let d = dir
      for (const s of segs) d = await d.getDirectoryHandle(s)
      return await d.getFileHandle(file)
    } catch {
      return null
    }
  }

  async function fileByBasename(ref: string): Promise<FileHandle | null> {
    const base = ref.split('/').pop()
    if (!base) return null
    for (const path of [[assetsFolderFor(mdBase(md))], ['Assets'], ['public', 'Assets'], ['assets']]) {
      try {
        let d = dir
        for (const seg of path) d = await d.getDirectoryHandle(seg)
        return await d.getFileHandle(base)
      } catch {
        /* next */
      }
    }
    return null
  }

  async function resolveRef(ref: string): Promise<string | null> {
    const fh = (await fileAtPath(ref)) ?? (await fileByBasename(ref))
    if (!fh) return null
    const url = URL.createObjectURL(await fh.getFile())
    urlToPath.set(url, ref)
    return url
  }

  async function readMd(): Promise<Deck> {
    return parseDeck(await (await dir.getFileHandle(md)).getFile().then((f) => f.text()))
  }
  async function writeMd(deck: Deck) {
    const restored = { ...deck, slides: deck.slides.map((s) => mapImages(s, (v) => urlToPath.get(v) ?? v)) }
    const h = await dir.getFileHandle(md, { create: true })
    const ws = await h.createWritable()
    await ws.write(serializeDeck(restored))
    await ws.close()
  }

  async function hydrate(deck: Deck): Promise<Deck> {
    const map = new Map<string, string>()
    for (const ref of collectImageRefs(deck.slides)) {
      const url = await resolveRef(ref)
      if (url) map.set(ref, url)
    }
    return { ...deck, slides: deck.slides.map((s) => mapImages(s, (v) => map.get(v) ?? v)) }
  }

  async function pickMd(file?: string) {
    if (file && file.endsWith('.md')) {
      md = file
      return
    }
    try {
      await dir.getFileHandle(md)
    } catch {
      for await (const h of dir.values()) {
        if (!isDir(h) && h.name.endsWith('.md')) {
          md = h.name
          break
        }
      }
    }
  }

  return {
    id: 'fsdir',
    label: `folder · ${dir.name}`,
    async listDecks() {
      const out: { file: string; name: string }[] = []
      for await (const h of dir.values()) {
        if (!isDir(h) && h.name.endsWith('.md')) out.push({ file: h.name, name: h.name.replace(/\.md$/, '') })
      }
      return out.length ? out : [{ file: md, name: md.replace(/\.md$/, '') }]
    },
    async loadDeck(file) {
      await pickMd(file)
      return hydrate(await readMd())
    },
    async saveDeck(_file, deck) {
      await writeMd(deck)
    },
    async saveSlide(_file, index, slide) {
      const deck = await readMd()
      deck.slides[index] = mapImages(slide, (v) => urlToPath.get(v) ?? v)
      await writeMd(deck)
    },
    async uploadAsset(_file, filename, dataUrl) {
      const folder = assetsFolderFor(mdBase(md))
      const ad = await dir.getDirectoryHandle(folder, { create: true })
      const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.png'
      const base = (filename.replace(/\.[^.]*$/, '') || 'img').replace(/[^a-zA-Z0-9_-]/g, '_')
      const name = `${base}_${Date.now()}${ext}`
      const bytes = await (await fetch(dataUrl)).blob()
      const h = await ad.getFileHandle(name, { create: true })
      const ws = await h.createWritable()
      await ws.write(bytes)
      await ws.close()
      const url = URL.createObjectURL(bytes)
      urlToPath.set(url, `/${folder}/${name}`)
      return url
    },
    async saveAs(name, deck) {
      md = `${cleanName(name)}.md`
      await writeMd({ ...deck, config: { ...deck.config, deck: name || deck.config.deck } })
      return md
    },
    async newDeck() {
      return md
    },
    async listAssets() {
      try {
        const ad = await dir.getDirectoryHandle(assetsFolderFor(mdBase(md)))
        const out: string[] = []
        for await (const h of ad.values()) {
          if (!isDir(h)) out.push(h.name)
        }
        return out
      } catch {
        return [] // no assets folder yet
      }
    },
    async deleteAsset(filename) {
      const ad = await dir.getDirectoryHandle(assetsFolderFor(mdBase(md)))
      await ad.removeEntry(filename)
    },
  }
}
