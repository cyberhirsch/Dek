// Dev-server backend — talks to the Vite middleware API in vite.config.ts.
import type { Deck } from '../core/types'
import type { DeckRef, StorageBackend } from './types'

function q(file?: string) {
  return file ? `?file=${encodeURIComponent(file)}` : ''
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
    return r.json()
  },

  async saveDeck(file, deck) {
    const r = await fetch(`/api/deck${q(file)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: deck.config, slides: deck.slides }),
    })
    if (!r.ok) throw new Error((await r.json()).error ?? 'save failed')
  },

  async saveSlide(file, index, slide) {
    const r = await fetch(`/api/slide${q(file)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, slide }),
    })
    if (!r.ok) throw new Error((await r.json()).error ?? 'save failed')
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
