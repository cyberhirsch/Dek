// Browser backend — persists decks in IndexedDB. Powers the static hosted build
// (no server). Uploaded images are inlined as data URLs so a deck is fully
// self-contained in the browser. Real local-file open/save (File System Access)
// and cloud backends layer on top of this later.
import type { Deck } from '../core/types'
import type { DeckRef, StorageBackend } from './types'
import { parseDeck, emptyDeck } from '../core/deck'
import { idbGet, idbKeys, idbSet } from './idb'
// The example deck ships with the app so a fresh visitor sees something.
import exampleRaw from '../../deck.example.md?raw'

const PREFIX = 'deck:'
const DEFAULT = 'deck.md'

interface Stored {
  file: string
  name: string
  deck: Deck
}

// IndexedDB's structured clone chokes on Vue reactive proxies — store plain data.
function plain<T>(x: T): T {
  return JSON.parse(JSON.stringify(x))
}

function slug(name: string): string {
  return (
    (name || 'deck')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'deck'
  )
}

async function seedIfEmpty() {
  const keys = await idbKeys()
  if (keys.some((k) => k.startsWith(PREFIX))) return
  const deck = parseDeck(exampleRaw)
  const rec: Stored = { file: DEFAULT, name: deck.config.deck ?? 'Example', deck }
  await idbSet(PREFIX + DEFAULT, rec)
}

/** A deck filename that doesn't clobber an existing stored deck (…, -2, -3). */
async function uniqueFile(name: string): Promise<string> {
  const keys = await idbKeys()
  const base = slug(name)
  let file = `${base}.md`
  let k = 2
  while (keys.includes(PREFIX + file)) file = `${base}-${k++}.md`
  return file
}

async function get(file: string): Promise<Stored | undefined> {
  return idbGet<Stored>(PREFIX + file)
}

export const browserBackend: StorageBackend = {
  id: 'browser',
  label: 'browser storage',

  async listDecks(): Promise<DeckRef[]> {
    await seedIfEmpty()
    const keys = (await idbKeys()).filter((k) => k.startsWith(PREFIX))
    const out: DeckRef[] = []
    for (const k of keys) {
      const rec = await idbGet<Stored>(k)
      if (rec) out.push({ file: rec.file, name: rec.name })
    }
    return out.sort((a, b) => (a.file === DEFAULT ? -1 : a.name.localeCompare(b.name)))
  },

  async loadDeck(file = DEFAULT): Promise<Deck> {
    await seedIfEmpty()
    const rec = await get(file)
    if (!rec) throw new Error(`deck not found: ${file}`)
    return rec.deck
  },

  async saveDeck(file = DEFAULT, deck) {
    const name = deck.config.deck ?? (await get(file))?.name ?? file
    await idbSet(PREFIX + file, plain({ file, name, deck }) satisfies Stored)
  },

  async saveSlide(file = DEFAULT, index, slide) {
    const rec = await get(file)
    if (!rec) throw new Error(`deck not found: ${file}`)
    rec.deck.slides[index] = plain(slide)
    await idbSet(PREFIX + file, rec)
  },

  async uploadAsset(_file, _filename, dataUrl) {
    // Inline the image; nothing else to do.
    return dataUrl
  },

  async saveAs(name, deck) {
    const file = await uniqueFile(name)
    const cfg = { ...deck.config, deck: name || deck.config.deck }
    await idbSet(PREFIX + file, plain({ file, name, deck: { ...deck, config: cfg } }) satisfies Stored)
    return file
  },

  async newDeck(name) {
    const file = await uniqueFile(name)
    const deck = emptyDeck(name)
    await idbSet(PREFIX + file, { file, name: name || 'Untitled', deck } satisfies Stored)
    return file
  },
}
