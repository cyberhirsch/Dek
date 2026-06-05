// Directory backend (File System Access). Opening a *folder* lets us read the
// deck's `deck.md` AND its images (so they actually display), and write both back.
// Images load as object URLs for display; on save we restore their original
// relative paths so the saved .md stays clean.
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
  values(): AsyncIterable<FileHandle | DirHandle>
}

const w = window as unknown as { showDirectoryPicker?: (o?: unknown) => Promise<DirHandle> }

export function supportsDir(): boolean {
  return typeof w.showDirectoryPicker === 'function'
}

export async function pickDir(): Promise<DirHandle> {
  return w.showDirectoryPicker!({ mode: 'readwrite' })
}

function slug(name: string): string {
  return (name || 'deck').trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'deck'
}

function assetFileName(ref: string, blob: Blob, i: number): string {
  const base = ref.split('/').pop()
  if (base && !ref.startsWith('blob:') && !ref.startsWith('data:') && /\.[a-z0-9]+$/i.test(base)) return base
  const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '')
  return `img_${i}.${ext}`
}

/**
 * Save As → a folder: pick a destination, write `<deck>.md` plus an `Assets/`
 * folder containing every referenced image, then continue editing there.
 * Returns the reloaded deck (images hydrated from the new folder).
 */
export async function saveAsFolder(name: string, deck: Deck): Promise<{ backend: StorageBackend; deck: Deck; dirName: string }> {
  const dir = await pickDir()
  const mdName = `${slug(name)}.md`
  const assets = await dir.getDirectoryHandle('Assets', { create: true })

  // Write each unique image, mapping its current value → a clean /Assets/<file> path.
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
      map.set(ref, `/Assets/${fn}`)
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

const isDir = (h: FileHandle | DirHandle): h is DirHandle => 'getFileHandle' in h

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

export function fsDirBackend(dir: DirHandle, mdName = 'deck.md'): StorageBackend {
  let md = mdName
  let assetsDir: DirHandle | null = null
  const urlToPath = new Map<string, string>() // objectURL → original ref, for save

  async function findAssetsDir(): Promise<DirHandle | null> {
    if (assetsDir) return assetsDir
    for (const path of [['Assets'], ['public', 'Assets'], ['assets']]) {
      try {
        let d = dir
        for (const seg of path) d = await d.getDirectoryHandle(seg)
        assetsDir = d
        return d
      } catch {
        /* try next */
      }
    }
    return null
  }

  async function resolveRef(ref: string): Promise<string | null> {
    const base = ref.split('/').pop()
    if (!base) return null
    const ad = await findAssetsDir()
    if (!ad) return null
    try {
      const url = URL.createObjectURL(await (await ad.getFileHandle(base)).getFile())
      urlToPath.set(url, ref)
      return url
    } catch {
      return null
    }
  }

  async function readMd(name: string): Promise<Deck> {
    return parseDeck(await (await dir.getFileHandle(name)).getFile().then((f) => f.text()))
  }
  async function writeMd(name: string, deck: Deck) {
    const restored = { ...deck, slides: deck.slides.map((s) => mapImages(s, (v) => urlToPath.get(v) ?? v)) }
    const h = await dir.getFileHandle(name, { create: true })
    const ws = await h.createWritable()
    await ws.write(serializeDeck(restored))
    await ws.close()
  }

  async function hydrate(deck: Deck): Promise<Deck> {
    const refs = collectImageRefs(deck.slides)
    const map = new Map<string, string>()
    for (const ref of refs) {
      const url = await resolveRef(ref)
      if (url) map.set(ref, url)
    }
    return { ...deck, slides: deck.slides.map((s) => mapImages(s, (v) => map.get(v) ?? v)) }
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
      if (file && file.endsWith('.md')) md = file
      return hydrate(await readMd(md))
    },
    async saveDeck(_file, deck) {
      await writeMd(md, deck)
    },
    async saveSlide(_file, index, slide) {
      const deck = await readMd(md)
      deck.slides[index] = mapImages(slide, (v) => urlToPath.get(v) ?? v)
      const h = await dir.getFileHandle(md, { create: true })
      const ws = await h.createWritable()
      await ws.write(serializeDeck(deck))
      await ws.close()
    },
    async uploadAsset(filename, dataUrl) {
      const ad = (await findAssetsDir()) ?? (await dir.getDirectoryHandle('Assets', { create: true }))
      const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.png'
      const base = (filename.replace(/\.[^.]*$/, '') || 'img').replace(/[^a-zA-Z0-9_-]/g, '_')
      const name = `${base}_${Date.now()}${ext}`
      const bytes = await (await fetch(dataUrl)).blob()
      const h = await ad.getFileHandle(name, { create: true })
      const ws = await h.createWritable()
      await ws.write(bytes)
      await ws.close()
      const url = URL.createObjectURL(bytes)
      urlToPath.set(url, `/Assets/${name}`) // display via object URL, save as path
      return url
    },
    async saveAs(name, deck) {
      md = `${(name || 'deck').replace(/[^a-zA-Z0-9_-]+/g, '-')}.md`
      await writeMd(md, { ...deck, config: { ...deck.config, deck: name || deck.config.deck } })
      return md
    },
    async newDeck(name) {
      return md + (name ? '' : '')
    },
  }
}
