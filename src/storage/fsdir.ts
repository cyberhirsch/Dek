// Directory backend (File System Access). Opening a *folder* lets us read a
// deck's .md AND its images (so they display), and write both back. Each deck
// keeps its images in a sibling "<deck> Assets" folder, so several decks can
// share one folder without clashing. Images load as object URLs for display; on
// save every reference is normalized to the deck's exact sibling Assets folder.
import { parseDeck, serializeDeck } from '../core/deck'
import type { Deck } from '../core/types'
import {
  assetsFolderForFile,
  canonicalAssetRef,
  collectAssetRefs,
  deckBaseName,
  mapSlideAssetRefs,
} from './assets'
import { pickSave, type FileHandle } from './fs'
import { idbGet, idbSet } from './idb'
import type { StorageBackend } from './types'

export type DirHandle = {
  name: string
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandle>
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>
  isSameEntry?(other: DirHandle): Promise<boolean>
  resolve?(possibleDescendant: FileHandle): Promise<string[] | null>
  queryPermission?(o: { mode: string }): Promise<string>
  requestPermission?(o: { mode: string }): Promise<string>
  values(): AsyncIterable<FileHandle | DirHandle>
}

function pickerWindow() {
  return globalThis as unknown as { showDirectoryPicker?: (o?: unknown) => Promise<DirHandle> }
}

export function supportsDir(): boolean {
  return typeof pickerWindow().showDirectoryPicker === 'function'
}
export async function pickDir(startIn?: unknown): Promise<DirHandle> {
  return pickerWindow().showDirectoryPicker!({ mode: 'readwrite', ...(startIn ? { startIn } : {}) })
}

const isDir = (h: FileHandle | DirHandle): h is DirHandle => 'getFileHandle' in h
const DIR_CACHE = 'fs:recent-directories'

async function ensureDirectoryPermission(dir: DirHandle): Promise<boolean> {
  if (!dir.queryPermission) return true
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await dir.requestPermission?.({ mode: 'readwrite' })) === 'granted'
}

export async function rememberDirectory(dir: DirHandle): Promise<void> {
  const saved = (await idbGet<DirHandle[]>(DIR_CACHE)) ?? []
  const keep: DirHandle[] = []
  for (const candidate of saved) {
    try {
      const same = candidate.isSameEntry
        ? await candidate.isSameEntry(dir)
        : candidate.name === dir.name
      if (!same) keep.push(candidate)
    } catch {
      /* stale handle */
    }
  }
  await idbSet(DIR_CACHE, [dir, ...keep].slice(0, 12))
}

async function filePathWithin(dir: DirHandle, file: FileHandle): Promise<string[] | null> {
  try {
    const path = await dir.resolve?.(file)
    if (path) return path.at(-1) === file.name ? path : null
    const candidate = await dir.getFileHandle(file.name)
    const same = candidate.isSameEntry ? await candidate.isSameEntry(file) : true
    return same ? [file.name] : null
  } catch {
    return null
  }
}

async function directoryAtPath(root: DirHandle, path: string[]): Promise<DirHandle> {
  let dir = root
  for (const segment of path) dir = await dir.getDirectoryHandle(segment)
  return dir
}

/** Resolve a selected file to its immediate parent within a granted folder tree. */
export async function directoryForFile(root: DirHandle, file: FileHandle): Promise<DirHandle | null> {
  const path = await filePathWithin(root, file)
  if (!path) return null
  try {
    return await directoryAtPath(root, path.slice(0, -1))
  } catch {
    return null
  }
}

export async function rememberedDirectoryForFile(file: FileHandle): Promise<DirHandle | null> {
  const saved = (await idbGet<DirHandle[]>(DIR_CACHE)) ?? []
  for (const root of saved) {
    try {
      const path = await filePathWithin(root, file)
      if (!path || !(await ensureDirectoryPermission(root))) continue
      return await directoryAtPath(root, path.slice(0, -1))
    } catch {
      /* stale or unrelated handle */
    }
  }
  return null
}

function assetName(ref: string): string | null {
  const raw = ref.split(/[?#]/, 1)[0].replace(/\\/g, '/').split('/').filter(Boolean).pop()
  if (!raw) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function pathSegments(ref: string): string[] | null {
  const raw = ref.split(/[?#]/, 1)[0].replace(/^\.?[\\/]/, '').replace(/\\/g, '/')
  const segments = raw.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..')) return null
  return segments.map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
}

async function fileAtPath(dir: DirHandle, ref: string): Promise<FileHandle | null> {
  const segments = pathSegments(ref)
  const file = segments?.pop()
  if (!segments || !file) return null
  try {
    let current = dir
    for (const segment of segments) current = await current.getDirectoryHandle(segment)
    return await current.getFileHandle(file)
  } catch {
    return null
  }
}

async function fileInSiblingAssetFolders(dir: DirHandle, name: string): Promise<FileHandle | null> {
  for await (const handle of dir.values()) {
    if (!isDir(handle) || !handle.name.endsWith(' Assets')) continue
    try {
      return await handle.getFileHandle(name)
    } catch {
      /* next folder */
    }
  }
  return null
}

async function findSourceAsset(dir: DirHandle, ref: string): Promise<FileHandle | null> {
  const name = assetName(ref)
  if (!name) return null
  const direct = await fileAtPath(dir, ref)
  if (direct) return direct
  try {
    return await dir.getFileHandle(name)
  } catch {
    return fileInSiblingAssetFolders(dir, name)
  }
}

async function copyFile(source: FileHandle, target: DirHandle, name: string): Promise<void> {
  const output = await target.getFileHandle(name, { create: true })
  const writer = await output.createWritable()
  await writer.write(await source.getFile())
  await writer.close()
}

export async function ensureCanonicalAssets(
  parent: DirHandle,
  mdName: string,
  refs: string[],
  externalSource?: DirHandle,
): Promise<string[]> {
  const target = await parent.getDirectoryHandle(assetsFolderForFile(mdName), { create: true })
  const missing: string[] = []
  for (const ref of refs) {
    const name = assetName(ref)
    if (!name) continue
    try {
      await target.getFileHandle(name)
      continue
    } catch {
      /* copy below */
    }
    const source = (await findSourceAsset(parent, ref)) ?? (externalSource ? await findSourceAsset(externalSource, ref) : null)
    if (source) await copyFile(source, target, name)
    else missing.push(ref)
  }
  return missing
}

function assetFileName(ref: string, blob: Blob, i: number): string {
  const base = assetName(ref)
  if (base && !ref.startsWith('blob:') && !ref.startsWith('data:') && /\.[a-z0-9]+$/i.test(base)) return base
  const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '')
  return `img_${i}.${ext}`
}

/**
 * Save As through the native file picker, then write the matching sibling
 * Assets folder and continue editing there.
 */
export async function saveAsFolder(name: string, deck: Deck): Promise<{ backend: StorageBackend; deck: Deck; dirName: string }> {
  const suggestedName = `${deckBaseName(name) || 'deck'}.md`
  const mdHandle = await pickSave(suggestedName)
  const mdName = mdHandle.name
  const baseName = deckBaseName(mdName)
  let dir = await rememberedDirectoryForFile(mdHandle)
  if (!dir) {
    const root = await pickDir(mdHandle)
    dir = await directoryForFile(root, mdHandle)
    if (!dir) throw new Error(`Select the folder containing "${mdName}" or one of its parent folders.`)
    await rememberDirectory(root)
  }
  const folder = assetsFolderForFile(mdName)
  const assets = await dir.getDirectoryHandle(folder, { create: true })

  const map = new Map<string, string>()
  let i = 0
  for (const ref of collectAssetRefs(deck.slides)) {
    try {
      const blob = await (await fetch(ref)).blob()
      const fn = assetFileName(ref, blob, i++)
      const h = await assets.getFileHandle(fn, { create: true })
      const ws = await h.createWritable()
      await ws.write(blob)
      await ws.close()
      map.set(ref, canonicalAssetRef(mdName, fn))
    } catch {
      /* unreachable image — leave its ref as-is */
    }
  }

  const saved: Deck = {
    config: { ...deck.config, deck: baseName || deck.config.deck },
    slides: deck.slides.map((slide) => mapSlideAssetRefs(slide, (ref) => map.get(ref) ?? ref)),
  }
  const ws = await mdHandle.createWritable()
  await ws.write(serializeDeck(saved))
  await ws.close()

  const backend = fsDirBackend(dir, mdName)
  return { backend, deck: await backend.loadDeck(), dirName: dir.name }
}

export function fsDirBackend(dir: DirHandle, mdName = 'deck.md'): StorageBackend {
  let md = mdName
  const urlToPath = new Map<string, string>() // objectURL -> canonical sibling Assets path

  async function resolveRef(ref: string): Promise<string | null> {
    const name = assetName(ref)
    if (!name) return null
    try {
      const assets = await dir.getDirectoryHandle(assetsFolderForFile(md))
      const file = await assets.getFileHandle(name)
      const url = URL.createObjectURL(await file.getFile())
      urlToPath.set(url, canonicalAssetRef(md, name))
      return url
    } catch {
      return null
    }
  }

  async function readMd(): Promise<Deck> {
    return parseDeck(await (await dir.getFileHandle(md)).getFile().then((f) => f.text()))
  }
  async function writeMd(deck: Deck) {
    const restored = {
      ...deck,
      slides: deck.slides.map((slide) => mapSlideAssetRefs(slide, (ref) => urlToPath.get(ref) ?? ref)),
    }
    const h = await dir.getFileHandle(md, { create: true })
    const ws = await h.createWritable()
    await ws.write(serializeDeck(restored))
    await ws.close()
  }

  async function hydrate(deck: Deck): Promise<Deck> {
    const map = new Map<string, string>()
    for (const ref of collectAssetRefs(deck.slides)) {
      const url = await resolveRef(ref)
      if (url) map.set(ref, url)
    }
    return {
      ...deck,
      slides: deck.slides.map((slide) => mapSlideAssetRefs(slide, (ref) => map.get(ref) ?? ref)),
    }
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
      deck.slides[index] = mapSlideAssetRefs(slide, (ref) => urlToPath.get(ref) ?? ref)
      await writeMd(deck)
    },
    async uploadAsset(_file, filename, dataUrl) {
      const folder = assetsFolderForFile(md)
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
      urlToPath.set(url, canonicalAssetRef(md, name))
      return url
    },
    async saveAs(name, deck) {
      const baseName = deckBaseName(name)
      md = `${baseName}.md`
      await writeMd({ ...deck, config: { ...deck.config, deck: baseName || deck.config.deck } })
      return md
    },
    async newDeck() {
      return md
    },
    async listAssets() {
      try {
        const ad = await dir.getDirectoryHandle(assetsFolderForFile(md))
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
      const ad = await dir.getDirectoryHandle(assetsFolderForFile(md))
      await ad.removeEntry(filename)
    },
  }
}
