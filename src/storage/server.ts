// Dev-server backend — talks to the Vite middleware API in vite.config.ts.
import type { Deck } from '../core/types'
import type { DeckRef, StorageBackend } from './types'

function q(file?: string) {
  return file ? `?file=${encodeURIComponent(file)}` : ''
}

/** Thrown when a save is refused because the deck file changed on disk since we
 *  last read it (an external LLM / editor edit). `mtime` is the on-disk time now,
 *  so a caller that decides to overwrite anyway can adopt it and retry. */
export class DeckConflictError extends Error {
  constructor(public mtime: number) {
    super('deck file changed on disk')
    this.name = 'DeckConflictError'
  }
}

// The mtime of the deck the server backend last read or wrote. Sent with each
// save so the server can reject a write that would clobber an external edit, and
// compared against a poll to detect that edit while the browser sits idle.
let baseMtime: number | undefined

/** The on-disk mtime this client is synced to (undefined before the first load). */
export function serverBaseMtime(): number | undefined {
  return baseMtime
}
/** Adopt a known-good mtime (e.g. after choosing to overwrite on a conflict). */
export function setServerBaseMtime(m: number | undefined): void {
  baseMtime = m
}
/** The current on-disk mtime, for external-change polling. */
export async function fetchServerDeckMtime(file?: string): Promise<number | undefined> {
  const r = await fetch(`/api/deck-mtime${q(file)}`)
  if (!r.ok) return undefined
  return (await r.json()).mtime as number
}

export const serverBackend: StorageBackend = {
  id: 'server',
  label: 'local files',

  async listDecks(): Promise<DeckRef[]> {
    const r = await fetch('/api/decks')
    if (!r.ok) throw new Error('failed to list decks')
    return (await r.json()).decks
  },

  async loadDeck(file?: string): Promise<Deck> {
    const r = await fetch(`/api/deck${q(file)}`)
    if (!r.ok) throw new Error('failed to load deck')
    const h = r.headers.get('X-Deck-Mtime')
    baseMtime = h ? Number(h) : undefined
    return r.json()
  },

  async saveDeck(file, deck) {
    const r = await fetch(`/api/deck${q(file)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: deck.config, slides: deck.slides, baseMtime }),
    })
    if (r.status === 409) throw new DeckConflictError((await r.json()).mtime)
    if (!r.ok) throw new Error((await r.json()).error ?? 'save failed')
    baseMtime = (await r.json()).mtime
  },

  async saveSlide(file, index, slide) {
    const r = await fetch(`/api/slide${q(file)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, slide, baseMtime }),
    })
    if (r.status === 409) throw new DeckConflictError((await r.json()).mtime)
    if (!r.ok) throw new Error((await r.json()).error ?? 'save failed')
    baseMtime = (await r.json()).mtime
  },

  async uploadAsset(file, filename, dataUrl) {
    const r = await fetch(`/api/upload${q(file)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, dataUrl }),
    })
    if (!r.ok) throw new Error((await r.json()).error ?? 'upload failed')
    return (await r.json()).url
  },

  async saveAs(name, deck) {
    const r = await fetch('/api/save-as', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config: deck.config, slides: deck.slides }),
    })
    if (!r.ok) throw new Error((await r.json()).error ?? 'save-as failed')
    return (await r.json()).file
  },

  async newDeck(name) {
    const r = await fetch('/api/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!r.ok) throw new Error((await r.json()).error ?? 'new-deck failed')
    return (await r.json()).file
  },
}
