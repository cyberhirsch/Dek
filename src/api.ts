// Storage facade: picks a backend (dev server when available, else browser),
// tracks the active deck file, and exposes the operations the app uses.
import type { Deck, DeckConfig, Slide } from './core/types'
import type { DeckRef, StorageBackend } from './storage/types'
import { serverBackend } from './storage/server'
import { browserBackend } from './storage/browser'

const LS_FILE = 'dek:file'

let backend: StorageBackend | null = null
let initPromise: Promise<StorageBackend> | null = null
let currentFile: string | undefined = localStorage.getItem(LS_FILE) ?? undefined

async function detect(): Promise<StorageBackend> {
  try {
    const r = await fetch('/api/decks')
    // A static host (Pages, `vite preview`) may answer 200 with index.html for
    // unknown paths — require a genuine JSON {decks:[…]} to pick the server.
    if (r.ok && (r.headers.get('content-type') ?? '').includes('application/json')) {
      const j = await r.json()
      if (Array.isArray(j?.decks)) return serverBackend
    }
  } catch {
    /* no dev server → static/hosted */
  }
  return browserBackend
}

async function ensure(): Promise<StorageBackend> {
  if (backend) return backend
  if (!initPromise) initPromise = detect().then((b) => (backend = b))
  return initPromise
}

function setCurrent(file: string | undefined) {
  currentFile = file
  if (file) localStorage.setItem(LS_FILE, file)
  else localStorage.removeItem(LS_FILE)
}

export async function storageInfo(): Promise<{ id: string; label: string }> {
  const b = await ensure()
  return { id: b.id, label: b.label }
}
export function getCurrentFile(): string | undefined {
  return currentFile
}

export async function listDecks(): Promise<DeckRef[]> {
  return (await ensure()).listDecks()
}

export async function fetchDeck(): Promise<Deck> {
  const b = await ensure()
  if (currentFile) {
    try {
      return await b.loadDeck(currentFile)
    } catch {
      setCurrent(undefined) // stale/missing → fall back to default
    }
  }
  return b.loadDeck(undefined)
}

export async function openDeck(file: string): Promise<Deck> {
  const b = await ensure()
  const deck = await b.loadDeck(file)
  setCurrent(file)
  return deck
}

export async function saveSlide(index: number, slide: Slide): Promise<void> {
  return (await ensure()).saveSlide(currentFile, index, slide)
}

export async function saveDeck(config: DeckConfig, slides: Slide[]): Promise<void> {
  return (await ensure()).saveDeck(currentFile, { config, slides })
}

export async function uploadImage(filename: string, dataUrl: string): Promise<string> {
  return (await ensure()).uploadAsset(filename, dataUrl)
}

export async function saveAs(name: string, config: DeckConfig, slides: Slide[]): Promise<string> {
  const file = await (await ensure()).saveAs(name, { config, slides })
  setCurrent(file)
  return file
}

export async function newDeck(name: string): Promise<string> {
  const file = await (await ensure()).newDeck(name)
  setCurrent(file)
  return file
}
