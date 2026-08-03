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
  clearWorkspace,
  createWorkspaceDeck,
  type DeckEntry,
  type DirHandle,
  directoryForFile,
  directoryPermission,
  ensureCanonicalAssets,
  fsDirBackend,
  listWorkspaceDecks,
  listWorkspaceSubfolders,
  loadActiveFolder,
  loadWorkspace,
  openWorkspaceDeck,
  pickDir,
  rememberActiveFolder,
  rememberedDirectoryForFile,
  rememberDirectory,
  rememberWorkspace,
  requestDirectoryPermission,
  resolveWorkspacePath,
  saveAsFolder,
  supportsDir,
} from './storage/fsdir'
import { BUNDLE_MD, bundleDeckName, collectAssetRefs, localAssetRefs, mapSlideAssetRefs } from './storage/assets'
import { fileToOptimizedDataUrl } from './core/image'

export { supportsFS, supportsDir, DeckConflictError }
export type { DeckEntry }

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
  const loaded = await backend.loadDeck(md)
  // A bundle's name is its `.dek` folder, not the inner deck.md's `deck:` field.
  const deck: Deck = /\.dek$/i.test(dir.name)
    ? { ...loaded, config: { ...loaded.config, deck: bundleDeckName(dir.name) } }
    : loaded
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

// ── workspace: Dek's own Open/Save over one granted decks folder ──
// After a one-time folder grant there are no native file dialogs: the deck list
// and the save-name field are Dek's own in-app UI, operating on the workspace
// handle. Images stay in each bundle's Assets/, so deck.md stays small.

let workspace: DirHandle | null = null
async function getWorkspace(): Promise<DirHandle | null> {
  if (!workspace) workspace = await loadWorkspace()
  return workspace
}

export type WorkspaceState =
  | { status: 'unsupported' }
  | { status: 'none' } //     no folder chosen yet
  | { status: 'prompt'; name: string } // remembered, needs a one-click re-grant
  | { status: 'ready'; name: string }

export async function workspaceState(): Promise<WorkspaceState> {
  if (!supportsDir()) return { status: 'unsupported' }
  const ws = await getWorkspace()
  if (!ws) return { status: 'none' }
  const perm = await directoryPermission(ws)
  if (perm === 'granted') return { status: 'ready', name: ws.name }
  if (perm === 'prompt') return { status: 'prompt', name: ws.name }
  return { status: 'none' } // denied/stale → treat as unchosen
}

/** Pick the decks folder (one native dialog, ever). Must run in a user gesture. */
export async function chooseWorkspace(): Promise<void> {
  const dir = await pickDir()
  await rememberWorkspace(dir)
  workspace = dir
}

/** Re-grant a remembered workspace (one allow-bubble, no picker). */
export async function reconnectWorkspace(): Promise<boolean> {
  const ws = await getWorkspace()
  if (!ws) return false
  return requestDirectoryPermission(ws)
}

/** The workspace folder currently being browsed — the granted root, then down
 *  through whatever subfolder path the Open/Save panel has navigated into
 *  (e.g. a course folder holding several weeks' decks). */
async function workspaceFolder(path: string[]): Promise<DirHandle | null> {
  const ws = await getWorkspace()
  if (!ws) return null
  return path.length ? resolveWorkspacePath(ws, path) : ws
}

/** The subfolders and decks at a path inside the workspace, for the in-app
 *  Open/Save panel's folder browsing. */
export async function listWorkspace(path: string[] = []): Promise<{ folders: string[]; decks: DeckEntry[] }> {
  const dir = await workspaceFolder(path)
  if (!dir) return { folders: [], decks: [] }
  const [folders, decks] = await Promise.all([listWorkspaceSubfolders(dir), listWorkspaceDecks(dir)])
  return { folders, decks }
}

/** Open a deck from the workspace by its bundle folder name, at an optional
 *  subfolder path. No dialog. */
export async function openWorkspaceFile(file: string, path: string[] = []): Promise<Deck> {
  const dir = await workspaceFolder(path)
  if (!dir) throw new Error('No decks folder chosen yet.')
  const { backend, deck, bundle } = await openWorkspaceDeck(dir, file)
  override = backend
  setCurrent(BUNDLE_MD)
  await clearActiveFile()
  await rememberActiveFolder(bundle, BUNDLE_MD)
  return deck
}

/** Save the deck as a new `<name>.dek` bundle in the workspace, at an optional
 *  subfolder path. No dialog. */
export async function saveWorkspaceFile(name: string, config: DeckConfig, slides: Slide[], path: string[] = []): Promise<Deck> {
  const dir = await workspaceFolder(path)
  if (!dir) throw new Error('No decks folder chosen yet.')
  const { backend, deck, bundle } = await createWorkspaceDeck(dir, name, { config, slides })
  override = backend
  setCurrent(BUNDLE_MD)
  await clearActiveFile()
  await rememberActiveFolder(bundle, BUNDLE_MD)
  setServerBaseMtime(undefined)
  return deck
}

/** Copy every slide from another workspace deck into the *active* deck's asset
 *  store, rewriting image refs to point at the copies, and hand back the slides
 *  ready to splice in. The source bundle itself is left untouched. Works no
 *  matter which backend the active deck lives in (workspace, server, browser) —
 *  only the source has to be a workspace bundle, since that's what's listable
 *  without a file dialog. */
export async function importSlidesFromWorkspaceDeck(file: string, path: string[] = []): Promise<Slide[]> {
  const dir = await workspaceFolder(path)
  if (!dir) throw new Error('No decks folder chosen yet.')
  const { deck } = await openWorkspaceDeck(dir, file)
  const backend = await active()
  const map = new Map<string, string>()
  for (const ref of collectAssetRefs(deck.slides)) {
    try {
      const blob = await (await fetch(ref)).blob()
      const name = ref.split('/').pop() || 'image'
      const dataUrl = await fileToOptimizedDataUrl(new File([blob], name, { type: blob.type }))
      map.set(ref, await backend.uploadAsset(currentFile, name, dataUrl))
    } catch {
      /* unreachable image — leave its ref as-is */
    }
  }
  return deck.slides.map((slide) => mapSlideAssetRefs(slide, (ref) => map.get(ref) ?? ref))
}

/** Forget the workspace so the user can pick a different decks folder. */
export async function forgetWorkspace(): Promise<void> {
  workspace = null
  await clearWorkspace()
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
