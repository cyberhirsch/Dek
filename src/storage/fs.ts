// File System Access backend — read/write a real local .md file the user picks.
// Handle-based (the user grants access per file), so it isn't auto-detected; the
// app switches to it when the user runs Open/Save As. Images are inlined as data
// URLs so the deck stays a single portable file.
import { parseDeck, serializeDeck } from '../core/deck'
import type { Deck } from '../core/types'
import { idbGet, idbSet } from './idb'
import type { StorageBackend } from './types'

// Picker/handle types aren't in every TS lib version — keep them loose.
export type FileHandle = {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string | BufferSource | Blob): Promise<void>; close(): Promise<void> }>
  isSameEntry?(other: FileHandle): Promise<boolean>
  queryPermission?(o: { mode: string }): Promise<string>
  requestPermission?(o: { mode: string }): Promise<string>
}

const w = globalThis as unknown as {
  showOpenFilePicker?: (o?: unknown) => Promise<FileHandle[]>
  showSaveFilePicker?: (o?: unknown) => Promise<FileHandle>
}

export function supportsFS(): boolean {
  return typeof w.showOpenFilePicker === 'function' && typeof w.showSaveFilePicker === 'function'
}

const MD_TYPES = [
  { description: 'Dek deck (Markdown)', accept: { 'text/markdown': ['.md'], 'text/plain': ['.md'] } },
]

export async function pickOpen(): Promise<FileHandle> {
  const [h] = await w.showOpenFilePicker!({ types: MD_TYPES, multiple: false })
  return h
}

export async function pickSave(suggestedName: string): Promise<FileHandle> {
  return w.showSaveFilePicker!({
    id: 'dek-deck',
    suggestedName,
    types: MD_TYPES,
    excludeAcceptAllOption: true,
  })
}

export async function ensurePermission(h: FileHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  if (!h.queryPermission) return true
  if ((await h.queryPermission({ mode })) === 'granted') return true
  return (await h.requestPermission?.({ mode })) === 'granted'
}

// ── remembering the last opened file ──
// File handles are structured-cloneable, so the handle itself lives in IndexedDB
// and the app can reopen the same .md on the next visit. Chrome usually
// downgrades the grant to 'prompt' across sessions; re-granting needs a click but
// shows only a small allow bubble, never the file picker.
const ACTIVE_FILE = 'fs:active-file'

export async function rememberActiveFile(h: FileHandle): Promise<void> {
  await idbSet(ACTIVE_FILE, h)
}
export async function loadActiveFile(): Promise<FileHandle | null> {
  return (await idbGet<FileHandle>(ACTIVE_FILE)) ?? null
}
export async function clearActiveFile(): Promise<void> {
  await idbSet(ACTIVE_FILE, undefined)
}
/** Readwrite state of a remembered handle, without prompting. */
export async function filePermission(h: FileHandle): Promise<'granted' | 'prompt' | 'denied'> {
  if (!h.queryPermission) return 'granted'
  try {
    return (await h.queryPermission({ mode: 'readwrite' })) as 'granted' | 'prompt' | 'denied'
  } catch {
    return 'denied'
  }
}
/** Re-request readwrite on a remembered file. Must run inside a user gesture. */
export async function requestFilePermission(h: FileHandle): Promise<boolean> {
  return ensurePermission(h, 'readwrite')
}

/** A StorageBackend bound to a single local file handle. */
export function fsBackend(handle: FileHandle): StorageBackend {
  let h = handle

  async function read(): Promise<Deck> {
    return parseDeck(await (await h.getFile()).text())
  }
  async function write(deck: Deck): Promise<void> {
    const ws = await h.createWritable()
    await ws.write(serializeDeck(deck))
    await ws.close()
  }

  return {
    id: 'fs',
    label: `file · ${h.name}`,
    async listDecks() {
      return [{ file: h.name, name: h.name.replace(/\.md$/, '') }]
    },
    async loadDeck() {
      return read()
    },
    async saveDeck(_file, deck) {
      await write(deck)
    },
    async saveSlide(_file, index, slide) {
      const deck = await read() // read-modify-write keeps the file authoritative
      deck.slides[index] = slide
      await write(deck)
    },
    async uploadAsset(_file, _filename, dataUrl) {
      return dataUrl
    },
    async saveAs(name, deck) {
      h = await pickSave(`${name || 'deck'}.md`)
      const cfg = { ...deck.config, deck: name || deck.config.deck }
      await write({ ...deck, config: cfg })
      return h.name
    },
    async newDeck(name) {
      // not used for fs (New goes through the facade); keep current handle
      return h.name + (name ? '' : '')
    },
  }
}
