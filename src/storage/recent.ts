// The last decks you opened, for the deck menu. A deck is remembered by where
// it lives in the granted decks folder — its bundle folder name plus the
// subfolder path — which is exactly what `openWorkspaceFile` needs to reopen
// it without a dialog. Plain strings, so localStorage is enough: this is this
// browser's history, not deck content.

export interface RecentDeck {
  /** The bundle folder, e.g. `Week 02 - Visual Hierarchy.dek`. */
  file: string
  /** Subfolders from the decks folder down to the bundle. */
  path: string[]
  /** Display name — the deck's own name, as shown in the menu trigger. */
  name: string
}

export const RECENT_MAX = 10
const KEY = 'dek:recent'

/** Same bundle in the same folder. Names alone collide — two courses can
 *  each have a "Week 01" — so identity is the location, never the name. */
export function sameDeck(a: RecentDeck, b: RecentDeck): boolean {
  return a.file === b.file && a.path.join('/') === b.path.join('/')
}

/** Move `entry` to the front (adding it if new), capped at `max`. */
export function pushRecent(list: RecentDeck[], entry: RecentDeck, max = RECENT_MAX): RecentDeck[] {
  return [entry, ...list.filter((r) => !sameDeck(r, entry))].slice(0, max)
}

export function dropRecent(list: RecentDeck[], entry: RecentDeck): RecentDeck[] {
  return list.filter((r) => !sameDeck(r, entry))
}

function isRecent(v: unknown): v is RecentDeck {
  const r = v as RecentDeck
  return (
    !!r &&
    typeof r.file === 'string' &&
    typeof r.name === 'string' &&
    Array.isArray(r.path) &&
    r.path.every((p) => typeof p === 'string')
  )
}

/** The stored list, or empty. Never throws — storage can be blocked, and a
 *  corrupt or hand-edited entry is dropped rather than breaking the menu. */
export function readRecent(): RecentDeck[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, RECENT_MAX) : []
  } catch {
    return []
  }
}

export function writeRecent(list: RecentDeck[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, RECENT_MAX)))
  } catch {
    /* storage unavailable — the menu just has no history */
  }
}
