// Remembers which slide you were on, per deck, so F5 doesn't drop you back at
// slide 1. Deliberately localStorage and not part of the deck file: a cursor
// position is this browser's view state, not deck content — writing it into
// `deck.md` would dirty the file on every arrow key and show up in git.

const KEY_PREFIX = 'dek:slide:'

/**
 * A stable per-deck key. The backend's "current file" alone isn't enough: every
 * `.dek` bundle's inner file is called `deck.md`, so keying on that would make
 * all bundles share one position. The display name (the bundle's folder name)
 * is what actually distinguishes them.
 */
export function deckKey(file: string | undefined, name: string | undefined): string {
  return `${file ?? ''}::${name ?? ''}`
}

/** Keep a remembered index inside a deck that may have shrunk since. */
export function clampSlide(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0
  return Math.max(0, Math.min(Math.floor(index), count - 1))
}

/** Stored index for a deck, or 0. Never throws — storage can be unavailable
 *  (private windows, blocked site data) and a missing cursor is not an error. */
export function readSlidePos(key: string, count: number): number {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key)
    return raw == null ? 0 : clampSlide(Number(raw), count)
  } catch {
    return 0
  }
}

export function writeSlidePos(key: string, index: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + key, String(index))
  } catch {
    /* storage unavailable — losing the cursor is not worth surfacing */
  }
}
