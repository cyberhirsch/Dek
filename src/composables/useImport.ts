// PowerPoint/PDF import flow. Parses the file into a deck, then holds it in a
// `pending` review state so the user can correct any misclassified layouts before
// it's committed. Committing creates a new deck file first (so its images land in
// that deck's own asset folder), rehomes the embedded images, then swaps it in.
// `importing` carries a human-readable progress string the App shows in an overlay.
import { ref } from 'vue'
import type { Deck } from '../core/types'
import { importFile, rehomeImages } from '../import'
import { newDeck, uploadImage } from '../api'

export interface ImportDeps {
  /** Swap in the imported deck (resets selection + undo history). */
  applyDeck: (d: Deck) => void
  /** Persist the freshly imported deck. */
  save: () => Promise<void>
  setError: (msg: string) => void
  /** Called once the import is committed (e.g. to enter edit mode). */
  onImported?: () => void
}

export interface PendingImport {
  deck: Deck
  name: string
}

export function useImport({ applyDeck, save, setError, onImported }: ImportDeps) {
  const importing = ref('')
  // A parsed-but-not-yet-saved import awaiting the user's layout review.
  const pending = ref<PendingImport | null>(null)

  async function onImportFile(file: File) {
    setError('')
    try {
      importing.value = `Reading ${file.name}…`
      const { deck: imported, name } = await importFile(file, (done, total) => {
        importing.value = `Importing page ${done} / ${total}…`
      })
      // Hand off to the review step. Images are still data: URLs at this point,
      // which render fine in the review thumbnails; they're only rehomed to the
      // deck's asset folder on commit, so cancelling leaves nothing behind.
      pending.value = { deck: imported, name }
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`)
    } finally {
      importing.value = ''
    }
  }

  /** Accept the reviewed deck: create its file, rehome images, swap in, save. */
  async function commitImport(reviewed: Deck) {
    const name = pending.value?.name ?? reviewed.config.deck ?? 'deck'
    pending.value = null
    try {
      importing.value = `Importing ${reviewed.slides.length} slides…`
      // New deck first (sets the active file), so images land in its own folder.
      await newDeck(name)
      await rehomeImages(reviewed, (n, dataUrl) => uploadImage(n, dataUrl))
      applyDeck(reviewed)
      await save()
      onImported?.()
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`)
    } finally {
      importing.value = ''
    }
  }

  /** Discard the pending import without creating anything. */
  function cancelImport() {
    pending.value = null
  }

  return { importing, pending, onImportFile, commitImport, cancelImport }
}
