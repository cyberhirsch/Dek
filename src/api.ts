// Thin client over the dev-server API in vite.config.ts.
import type { Deck, DeckConfig, Slide } from './core/types'

export async function fetchDeck(): Promise<Deck> {
  const r = await fetch('/api/deck')
  if (!r.ok) throw new Error('failed to load deck')
  return r.json()
}

export async function saveSlide(index: number, slide: Slide): Promise<void> {
  const r = await fetch('/api/slide', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index, slide }),
  })
  if (!r.ok) throw new Error((await r.json()).error ?? 'save failed')
}

export async function saveDeck(config: DeckConfig, slides: Slide[]): Promise<void> {
  const r = await fetch('/api/deck', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config, slides }),
  })
  if (!r.ok) throw new Error((await r.json()).error ?? 'save failed')
}

export async function uploadImage(filename: string, dataUrl: string): Promise<string> {
  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, dataUrl }),
  })
  if (!r.ok) throw new Error((await r.json()).error ?? 'upload failed')
  return (await r.json()).url
}
