// Storage facade. A `base` backend is auto-detected (dev server when available,
// else browser/IndexedDB). Opening a local file installs an `override` backend
// (File System Access) bound to that file; switching/creating decks clears it.
import type { Deck, DeckConfig, Slide } from './core/types'
import type { DeckRef, StorageBackend } from './storage/types'
import {
  serverBackend,
  DeckConflictError,
  serverBaseMtime,
  setServerBaseMtime,
  fetchServerDeckMtime,
} from './storage/server'
import { browserBackend } from './storage/browser'
import { fsBackend, pickOpen, supportsFS } from './storage/fs'
import {
  directoryForFile,
  ensureCanonicalAssets,
  fsDirBackend,
  pickDir,
  rememberedDirectoryForFile,
  rememberDirectory,
  saveAsFolder,
  supportsDir,
} from './storage/fsdir'
import { localAssetRefs } from './storage/assets'

export { supportsFS, supportsDir, DeckConflictError }

const LS_FILE = 'dek:file'

let base: StorageBackend | null = null
let basePromise: Promise<StorageBackend> | null = null
let override: StorageBackend | null = null
let currentFile: string | undefined = localStorage.getItem(LS_FILE) ?? undefined

async function detect(): Promise<StorageBackend> {
  try {
    const r = await fetch('/api/decks')
    if (r.ok && (r.headers.get('content-type') ?? '').includes('application/json')) {
      const j = await r.json()
      if (Array.isArray(j?.decks)) return serverBackend
    }
  } catch {
    /* no dev server → static/hosted */
  }
  return browserBackend
}

async function ensureBase(): Promise<StorageBackend> {
  if (base) return base
  if (!basePromise) basePromise = detect().then((b) => (base = b))
  return basePromise
}

/** The backend that read/write operations currently target. */
async function active(): Promise<StorageBackend> {
  return override ?? (await ensureBase())
}

function setCurrent(file: string | undefined) {
  currentFile = file
  if (file) localStorage.setItem(LS_FILE, file)
  else localStorage.removeItem(LS_FILE)
}

export async function storageInfo(): Promise<{ id: string; label: string }> {
  const b = await active()
  return { id: b.id, label: b.label }
}
export function getCurrentFile(): string | undefined {
  return currentFile
}

/** Decks available to switch to (always from the base backend, not the FS file). */
export async function listDecks(): Promise<DeckRef[]> {
  return (await ensureBase()).listDecks()
}

export async function fetchDeck(): Promise<Deck> {
  const b = await active()
  if (!override && currentFile) {
    try {
      return await b.loadDeck(currentFile)
    } catch {
      setCurrent(undefined)
    }
  }
  return b.loadDeck(currentFile)
}

export async function openDeck(file: string): Promise<Deck> {
  override = null // switching to an in-app deck leaves any open local file
  const b = await ensureBase()
  const deck = await b.loadDeck(file)
  setCurrent(file)
  return deck
}

export async function saveSlide(index: number, slide: Slide): Promise<void> {
  return (await active()).saveSlide(currentFile, index, slide)
}

export async function saveDeck(config: DeckConfig, slides: Slide[]): Promise<void> {
  return (await active()).saveDeck(currentFile, { config, slides })
}

/** True when the active deck file changed on disk since we last read/wrote it —
 *  an external LLM or text-editor edit. Only the dev-server backend tracks this
 *  (real files); every other backend reports false. Used to live-refresh an idle
 *  browser and to warn before an overwrite. */
export async function externalChangePending(): Promise<boolean> {
  if ((await active()) !== serverBackend) return false
  const base = serverBaseMtime()
  if (base == null) return false
  const disk = await fetchServerDeckMtime(currentFile)
  return disk != null && disk - base > 1
}

/** Adopt an on-disk mtime as the new baseline — used when the user chooses to
 *  overwrite an externally-changed file, so the retried save passes the guard. */
export function adoptDiskBaseline(mtime: number): void {
  setServerBaseMtime(mtime)
}

export async function uploadImage(filename: string, dataUrl: string): Promise<string> {
  return (await active()).uploadAsset(currentFile, filename, dataUrl)
}

/** Filenames in the active deck's on-disk assets folder, or [] if the backend has
 *  no real folder (orphan detection then stays off). */
export async function listDeckAssets(): Promise<string[]> {
  const b = await active()
  return b.listAssets ? b.listAssets() : []
}

export async function deleteDeckAsset(filename: string): Promise<void> {
  const b = await active()
  await b.deleteAsset?.(filename)
}

export async function saveAs(name: string, config: DeckConfig, slides: Slide[]): Promise<string> {
  override = null
  const file = await (await ensureBase()).saveAs(name, { config, slides })
  setCurrent(file)
  setServerBaseMtime(undefined) // new file — let the next save re-establish the baseline
  return file
}

export async function newDeck(name: string): Promise<string> {
  override = null
  const file = await (await ensureBase()).newDeck(name)
  setCurrent(file)
  setServerBaseMtime(undefined)
  return file
}

// ── File System Access: real local files ──

/** Open a local .md file and, when needed, its containing asset folder. */
export async function openLocalFile(): Promise<Deck> {
  const handle = await pickOpen()
  const fileBackend = fsBackend(handle)
  const deck = await fileBackend.loadDeck()
  const localRefs = localAssetRefs(deck)

  if (localRefs.length) {
    if (!supportsDir()) {
      throw new Error('Opening a deck with local images requires folder access in a Chromium browser.')
    }
    let dir = await rememberedDirectoryForFile(handle)
    if (!dir) {
      const root = await pickDir(handle)
      dir = await directoryForFile(root, handle)
      if (!dir) {
        throw new Error(`Select the folder containing "${handle.name}" or one of its parent folders.`)
      }
      await rememberDirectory(root)
    }

    let missing = await ensureCanonicalAssets(dir, handle.name, localRefs)
    if (missing.length) {
      const source = await pickDir(dir)
      missing = await ensureCanonicalAssets(dir, handle.name, missing, source)
    }
    if (missing.length) {
      throw new Error(`Could not locate ${missing.length} image${missing.length === 1 ? '' : 's'}: ${missing.map((ref) => ref.split('/').pop()).join(', ')}`)
    }

    const folderBackend = fsDirBackend(dir, handle.name)
    let hydrated: Deck
    try {
      hydrated = await folderBackend.loadDeck(handle.name)
    } catch {
      throw new Error(`Select the folder containing "${handle.name}" and its Assets folder.`)
    }
    const unresolved = localAssetRefs(hydrated)
    if (unresolved.length) {
      throw new Error(`Could not load ${unresolved.length} image${unresolved.length === 1 ? '' : 's'} from "${handle.name.replace(/\.md$/i, '')} Assets".`)
    }
    await folderBackend.saveDeck(handle.name, hydrated)
    override = folderBackend
    setCurrent(handle.name)
    return hydrated
  }

  override = fileBackend
  setCurrent(handle.name)
  return deck
}

/** Open a local folder (deck.md + Assets) so images resolve and display. */
export async function openLocalFolder(): Promise<Deck> {
  const dir = await pickDir()
  await rememberDirectory(dir)
  override = fsDirBackend(dir)
  const deck = await override.loadDeck()
  setCurrent(dir.name)
  return deck
}

/**
 * Save As → a folder: writes `<deck>.md` plus an `Assets/` folder with every
 * image beside it, then keeps editing there. Returns the reloaded deck.
 */
export async function saveLocalFolderAs(name: string, config: DeckConfig, slides: Slide[]): Promise<Deck> {
  const { backend, deck, dirName } = await saveAsFolder(name, { config, slides })
  override = backend
  setCurrent(dirName)
  return deck
}
