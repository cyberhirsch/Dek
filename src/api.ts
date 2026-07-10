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
import {
  clearActiveFile,
  filePermission,
  fsBackend,
  loadActiveFile,
  pickOpen,
  rememberActiveFile,
  requestFilePermission,
  supportsFS,
  type FileHandle,
} from './storage/fs'
import {
  clearActiveFolder,
  directoryForFile,
  directoryPermission,
  ensureCanonicalAssets,
  fsDirBackend,
  loadActiveFolder,
  pickDir,
  rememberActiveFolder,
  rememberedDirectoryForFile,
  rememberDirectory,
  requestDirectoryPermission,
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

/** Forget the remembered local folder/file, so the next startup doesn't reopen
 *  it over whatever deck the user switched to. */
async function clearLocalHandles(): Promise<void> {
  await clearActiveFolder()
  await clearActiveFile()
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
  // With a folder open, the switchable decks are the .md files *in that folder*
  // — so the deck menu replaces the native file picker.
  if (override?.id === 'fsdir') return override.listDecks()
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
  // Switching to another .md inside the open folder stays in that folder — no
  // picker, no re-grant — and the restore slot follows the newly opened deck.
  if (override?.id === 'fsdir') {
    const deck = await override.loadDeck(file)
    setCurrent(file)
    const activeDir = await loadActiveFolder()
    if (activeDir) await rememberActiveFolder(activeDir.dir, file)
    return deck
  }
  override = null // switching to an in-app deck leaves any open local file
  await clearLocalHandles() // …so a reload doesn't silently reopen it
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
  await clearLocalHandles()
  const file = await (await ensureBase()).saveAs(name, { config, slides })
  setCurrent(file)
  setServerBaseMtime(undefined) // new file — let the next save re-establish the baseline
  return file
}

export async function newDeck(name: string): Promise<string> {
  override = null
  await clearLocalHandles()
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
    await clearActiveFile()
    await rememberActiveFolder(dir, handle.name)
    return hydrated
  }

  override = fileBackend
  setCurrent(handle.name)
  await clearActiveFolder()
  await rememberActiveFile(handle) // reopen this .md on the next visit
  return deck
}

// ── reopening the last deck ──
// The handle the user last opened (a folder, or a lone .md) lives in IndexedDB.
// Chrome keeps it across sessions but usually downgrades the readwrite grant to
// 'prompt'. When it's still 'granted' we reopen silently (zero dialogs); when it
// isn't, the UI offers a one-click reconnect — a small "allow" bubble, never a
// picker. Only one of the two slots is ever populated.

async function attachFolder(dir: import('./storage/fsdir').DirHandle, md?: string): Promise<Deck> {
  const backend = fsDirBackend(dir, md ?? 'deck.md')
  override = backend
  const deck = await backend.loadDeck(md)
  setCurrent(md ?? dir.name)
  await rememberActiveFolder(dir, md)
  return deck
}
async function attachFile(handle: FileHandle): Promise<Deck> {
  const backend = fsBackend(handle)
  const deck = await backend.loadDeck()
  override = backend
  setCurrent(handle.name)
  return deck
}

/** Silently reopen the last folder or file, if its readwrite grant survived. */
export async function restoreLocalDeck(): Promise<Deck | null> {
  if (supportsDir()) {
    const active = await loadActiveFolder()
    if (active && (await directoryPermission(active.dir)) === 'granted') {
      try {
        return await attachFolder(active.dir, active.md)
      } catch {
        await clearActiveFolder()
      }
    }
  }
  if (supportsFS()) {
    const file = await loadActiveFile()
    if (file && (await filePermission(file)) === 'granted') {
      try {
        return await attachFile(file)
      } catch {
        await clearActiveFile()
      }
    }
  }
  return null
}

/** Name of the remembered folder/file when it needs a one-click re-grant. */
export async function pendingLocalGrant(): Promise<string | null> {
  if (supportsDir()) {
    const active = await loadActiveFolder()
    if (active) return (await directoryPermission(active.dir)) === 'prompt' ? active.dir.name : null
  }
  if (supportsFS()) {
    const file = await loadActiveFile()
    if (file) return (await filePermission(file)) === 'prompt' ? file.name : null
  }
  return null
}

/** Re-grant the remembered folder/file (call from a click) and reopen it. */
export async function reconnectLocalDeck(): Promise<Deck | null> {
  const active = await loadActiveFolder()
  if (active) {
    if (!(await requestDirectoryPermission(active.dir))) return null
    try {
      return await attachFolder(active.dir, active.md)
    } catch {
      await clearActiveFolder()
      return null
    }
  }
  const file = await loadActiveFile()
  if (file) {
    if (!(await requestFilePermission(file))) return null
    try {
      return await attachFile(file)
    } catch {
      await clearActiveFile()
      return null
    }
  }
  return null
}

/** Open a local folder (deck.md + Assets) so images resolve and display. */
export async function openLocalFolder(): Promise<Deck> {
  const dir = await pickDir()
  await rememberDirectory(dir)
  await clearActiveFile()
  await rememberActiveFolder(dir)
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
  const { backend, deck, dirName, dir, md } = await saveAsFolder(name, { config, slides })
  override = backend
  setCurrent(dirName)
  await clearActiveFile()
  await rememberActiveFolder(dir, md) // reload straight back into this folder
  return deck
}
