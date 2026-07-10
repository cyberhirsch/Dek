// Directory backend (File System Access). Opening a *folder* lets us read a
// deck's .md AND its images (so they display), and write both back. Each deck
// keeps its images in a sibling "<deck> Assets" folder, so several decks can
// share one folder without clashing. Images load as object URLs for display; on
// save every reference is normalized to the deck's exact sibling Assets folder.
import { parseDeck, serializeDeck } from '../core/deck'
import type { Deck } from '../core/types'
import {
  BUNDLE_ASSETS,
  BUNDLE_MD,
  assetsFolderForFile,
  bundleAssetRef,
  bundleDeckName,
  canonicalAssetRef,
  collectAssetRefs,
  mapSlideAssetRefs,
} from './assets'
import { type FileHandle } from './fs'
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
  // A stable `id` makes Chrome reopen the picker where it was last used.
  return pickerWindow().showDirectoryPicker!({ id: 'dek-decks', mode: 'readwrite', ...(startIn ? { startIn } : {}) })
}

const isDir = (h: FileHandle | DirHandle): h is DirHandle => 'getFileHandle' in h
const DIR_CACHE = 'fs:recent-directories'
const ACTIVE_DIR = 'fs:active-directory'

async function ensureDirectoryPermission(dir: DirHandle): Promise<boolean> {
  if (!dir.queryPermission) return true
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await dir.requestPermission?.({ mode: 'readwrite' })) === 'granted'
}

/** Current readwrite state of a granted handle, without prompting. Chrome keeps
 *  handles across sessions but usually downgrades the grant to 'prompt', which a
 *  user gesture can re-grant with one click (no folder picker). */
export async function directoryPermission(dir: DirHandle): Promise<'granted' | 'prompt' | 'denied'> {
  if (!dir.queryPermission) return 'granted'
  try {
    return (await dir.queryPermission({ mode: 'readwrite' })) as 'granted' | 'prompt' | 'denied'
  } catch {
    return 'denied'
  }
}
/** Re-request readwrite on a remembered handle. Must run inside a user gesture. */
export async function requestDirectoryPermission(dir: DirHandle): Promise<boolean> {
  return ensureDirectoryPermission(dir)
}

export interface ActiveFolder {
  dir: DirHandle
  /** The `.md` that was open, so a restore reopens the same deck. */
  md?: string
}
/** The folder the user last had open, so the app can re-attach on startup
 *  instead of making them pick it again every reload. */
export async function rememberActiveFolder(dir: DirHandle, md?: string): Promise<void> {
  await idbSet(ACTIVE_DIR, { dir, md })
}
export async function loadActiveFolder(): Promise<ActiveFolder | null> {
  const saved = await idbGet<ActiveFolder>(ACTIVE_DIR)
  return saved?.dir ? saved : null
}
export async function clearActiveFolder(): Promise<void> {
  await idbSet(ACTIVE_DIR, undefined)
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

async function hasDir(dir: DirHandle, name: string): Promise<boolean> {
  try {
    await dir.getDirectoryHandle(name)
    return true
  } catch {
    return false
  }
}
/** True when the folder holds any `<deck> Assets/` — the legacy workspace shape,
 *  where several decks share a folder and each owns a name-matched assets dir. */
async function looksLikeWorkspace(dir: DirHandle): Promise<boolean> {
  if (!dir.values) return false
  try {
    for await (const h of dir.values()) {
      if (isDir(h) && h.name.endsWith(' Assets')) return true
    }
  } catch {
    /* unreadable — assume bundle */
  }
  return false
}

/**
 * Which assets folder a deck uses.
 *
 * A bundle (`My Talk.dek/` = `deck.md` + `Assets/`) owns its folder, so its
 * images live in a plain `Assets/`. A legacy workspace folder holds several
 * decks side by side, each with a name-matched `<deck> Assets/` — there a plain
 * `Assets/` would collide between decks, so the legacy name is kept.
 *
 * Existing folders win over convention, so decks written either way keep working.
 */
export async function resolveAssetsDirName(dir: DirHandle, mdName: string): Promise<string> {
  const legacy = assetsFolderForFile(mdName)
  if (await hasDir(dir, legacy)) return legacy
  if (await hasDir(dir, BUNDLE_ASSETS)) return BUNDLE_ASSETS
  if (mdName === BUNDLE_MD) return BUNDLE_ASSETS
  // Nothing to go on but the neighbours: a sibling "<deck> Assets" means this is
  // a shared workspace, so this deck gets its own name-matched folder too.
  return (await looksLikeWorkspace(dir)) ? legacy : BUNDLE_ASSETS
}
/** The on-disk ref written for an asset, matching whichever layout is in use. */
function assetRefFor(assetsDir: string, mdName: string, asset: string): string {
  return assetsDir === BUNDLE_ASSETS ? bundleAssetRef(asset) : canonicalAssetRef(mdName, asset)
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
  const target = await parent.getDirectoryHandle(await resolveAssetsDirName(parent, mdName), { create: true })
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
 * Save As → a bundle. The user picks (or creates) the deck's own folder in one
 * directory prompt; we write `deck.md` and an `Assets/` folder inside it, then
 * keep editing there. The bundle's folder name becomes the deck's name, so
 * there's nothing else to type and no second dialog.
 */
export async function saveAsFolder(_name: string, deck: Deck): Promise<{ backend: StorageBackend; deck: Deck; dirName: string; dir: DirHandle; md: string }> {
  const bundle = await pickDir()
  await rememberDirectory(bundle)
  const md = BUNDLE_MD
  const assets = await bundle.getDirectoryHandle(BUNDLE_ASSETS, { create: true })

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
      map.set(ref, bundleAssetRef(fn))
    } catch {
      /* unreachable image — leave its ref as-is */
    }
  }

  const saved: Deck = {
    config: { ...deck.config, deck: bundleDeckName(bundle.name) || deck.config.deck },
    slides: deck.slides.map((slide) => mapSlideAssetRefs(slide, (ref) => map.get(ref) ?? ref)),
  }
  const h = await bundle.getFileHandle(md, { create: true })
  const ws = await h.createWritable()
  await ws.write(serializeDeck(saved))
  await ws.close()

  const backend = fsDirBackend(bundle, md)
  return { backend, deck: await backend.loadDeck(md), dirName: bundle.name, dir: bundle, md }
}

export function fsDirBackend(dir: DirHandle, mdName = 'deck.md'): StorageBackend {
  let md = mdName
  const urlToPath = new Map<string, string>() // objectURL -> on-disk asset path

  // `Assets/` for a bundle, `<deck> Assets/` for a legacy folder. Resolved once
  // per deck file and invalidated whenever `md` changes (see pickMd).
  let assetsDir: string | null = null
  async function assetsDirName(): Promise<string> {
    if (assetsDir == null) assetsDir = await resolveAssetsDirName(dir, md)
    return assetsDir
  }
  async function assetsHandle(create = false): Promise<DirHandle> {
    return dir.getDirectoryHandle(await assetsDirName(), { create })
  }

  async function resolveRef(ref: string): Promise<string | null> {
    const name = assetName(ref)
    if (!name) return null
    try {
      const assets = await assetsHandle()
      const file = await assets.getFileHandle(name)
      const url = URL.createObjectURL(await file.getFile())
      urlToPath.set(url, assetRefFor(await assetsDirName(), md, name))
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

  function setMd(name: string) {
    if (name === md) return
    md = name
    assetsDir = null // a different deck may use a different assets folder
  }

  async function pickMd(file?: string) {
    if (file && file.endsWith('.md')) {
      setMd(file)
      return
    }
    try {
      await dir.getFileHandle(md)
    } catch {
      for await (const h of dir.values()) {
        if (!isDir(h) && h.name.endsWith('.md')) {
          setMd(h.name)
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
      const ad = await assetsHandle(true)
      const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : '.png'
      const base = (filename.replace(/\.[^.]*$/, '') || 'img').replace(/[^a-zA-Z0-9_-]/g, '_')
      const name = `${base}_${Date.now()}${ext}`
      const bytes = await (await fetch(dataUrl)).blob()
      const h = await ad.getFileHandle(name, { create: true })
      const ws = await h.createWritable()
      await ws.write(bytes)
      await ws.close()
      const url = URL.createObjectURL(bytes)
      urlToPath.set(url, assetRefFor(await assetsDirName(), md, name))
      return url
    },
    async saveAs(name, deck) {
      // Within a bundle the deck file is always `deck.md` — the name lives on the
      // folder — so "Save As" here only retitles the deck, never moves its assets.
      await writeMd({ ...deck, config: { ...deck.config, deck: name || deck.config.deck } })
      return md
    },
    async newDeck() {
      return md
    },
    async listAssets() {
      try {
        const ad = await assetsHandle()
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
      const ad = await assetsHandle()
      await ad.removeEntry(filename)
    },
  }
}
