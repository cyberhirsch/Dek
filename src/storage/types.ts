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
  /** List filenames present in this deck's on-disk assets folder. Only backends
   *  with a real folder (File System Access) implement this; others omit it, and
   *  the UI then skips orphan detection. */
  listAssets?(): Promise<string[]>
  /** Narration audio: the deck's `voice/` folder, where the generation script
   *  (scripts/narration-audio.mjs) writes one `<line id>.wav` per spoken line.
   *  Kept apart from Assets so the orphan scan never offers them for deletion.
   *  Backends without a real folder omit both. */
  readVoice?(file: string | undefined, name: string): Promise<Blob | null>
  listVoice?(file: string | undefined): Promise<string[]>
  /** Store one narration audio file (from the Dek Helper) in `voice/`. */
  writeVoice?(file: string | undefined, name: string, data: Blob): Promise<void>
  /** Remove a narration audio file no spoken line uses any more. These are
   *  generated and can always be made again, so this deletes outright. */
  deleteVoice?(file: string | undefined, name: string): Promise<void>
  /** Delete a single file from the assets folder by name. */
  deleteAsset?(filename: string): Promise<void>
  /** True when the file changed on disk since this backend last read or wrote
   *  it. Polled while the tab is idle so an external edit can be picked up
   *  without the user saving first. Backends that cannot tell omit it. */
  externalChangePending?(): Promise<boolean>
  /** Take what is on disk right now as the new save baseline, so the next write
   *  is a deliberate overwrite. Called when the user answers the conflict
   *  dialog with "keep mine". Backends that cannot detect conflicts omit it. */
  adoptBaseline?(): Promise<void>
}
