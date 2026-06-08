import type { Deck } from '../core/types'

export interface DeckRef {
  file: string
  name: string
}

/**
 * Pluggable persistence. The dev server backend writes real files during
 * `npm run dev`; the browser backend (IndexedDB / File System Access) powers the
 * static hosted build where there is no server. Cloud backends slot in later.
 */
export interface StorageBackend {
  id: string
  /** Human label for the UI ("local files", "browser", "Drive"…). */
  label: string
  listDecks(): Promise<DeckRef[]>
  loadDeck(file?: string): Promise<Deck>
  saveDeck(file: string | undefined, deck: Deck): Promise<void>
  saveSlide(file: string | undefined, index: number, slide: Deck['slides'][number]): Promise<void>
  /** Returns a URL/data-URL to reference the uploaded image from a slide. The
   *  active deck `file` lets a backend store assets in that deck's own folder. */
  uploadAsset(file: string | undefined, filename: string, dataUrl: string): Promise<string>
  /** Save the deck under a new name; returns the new file id. */
  saveAs(name: string, deck: Deck): Promise<string>
  /** Create a fresh deck; returns the new file id. */
  newDeck(name: string): Promise<string>
}
