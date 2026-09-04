// Shared conflict detection for the handle-based backends.
//
// The dev-server backend has a server to arbitrate writes: it sends the mtime it
// is synced to and takes a 409 back. The File System Access backends have nobody
// to ask, so the baseline lives here — the exact text we last read from, or wrote
// to, disk. A save re-reads and compares before it overwrites.
//
// Content comparison rather than mtime, deliberately. Decks are kilobytes, so the
// compare costs nothing, and it survives filesystems whose timestamps are coarse,
// lazy, or invented: network shares, and Google Drive's CloudStorage mount in
// particular. The mtime still travels on the error, because that is what the
// existing conflict dialog carries.

/** Raised when the file changed underneath us since it was loaded or last saved. */
export class DeckConflictError extends Error {
  constructor(public mtime: number) {
    super('deck file changed on disk')
    this.name = 'DeckConflictError'
  }
}

export type DiskRead = { text: string; mtime: number }

export type Baseline = {
  adopt(text: string): void
  reset(): void
  armed(): boolean
  changed(readDisk: () => Promise<DiskRead>): Promise<boolean>
  guard(readDisk: () => Promise<DiskRead>): Promise<void>
  refresh(readDisk: () => Promise<DiskRead>): Promise<void>
}

export function createBaseline(): Baseline {
  let known: string | null = null

  return {
    /** Remember text we just read from, or wrote to, disk. */
    adopt(text) {
      known = text
    },

    /** Forget it — the handle now points at a different file (Save As, New). */
    reset() {
      known = null
    },

    armed() {
      return known !== null
    },

    /** Has disk moved since we last saw it? The non-throwing form, for the
     *  idle poll that live-reloads a tab nobody is typing in. */
    async changed(readDisk) {
      if (known === null) return false
      return (await readDisk()).text !== known
    },

    /**
     * Throw if disk no longer matches what we last saw.
     *
     * `readDisk` runs only when a baseline exists, so creating a file and
     * writing it for the first time costs no extra read. There is still a
     * sub-millisecond gap between this check and the write that follows —
     * unavoidable with this API, and several orders of magnitude smaller than
     * the window it closes, which is "however long the tab sat open".
     */
    async guard(readDisk) {
      if (known === null) return
      const { text, mtime } = await readDisk()
      if (text !== known) throw new DeckConflictError(mtime)
    },

    /** Take whatever is on disk right now as the new baseline. Used when the
     *  user answers the conflict dialog with "keep mine": the next save is then
     *  a deliberate overwrite rather than an accident. */
    async refresh(readDisk) {
      known = (await readDisk()).text
    },
  }
}
