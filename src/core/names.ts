// Shared deck-name helpers. Both the dev server (vite.config.ts) and the browser
// backend (storage/browser.ts) turn a deck's display name into a filename and
// avoid clobbering an existing one — keep that logic here so the two can't drift.

/** A filename/key-safe ASCII slug: runs of anything outside [A-Za-z0-9_-] collapse
 *  to a single '-', leading/trailing '-' are trimmed, and the result is capped at
 *  60 chars. Falls back to 'deck' when nothing usable remains. */
export function slug(name: string): string {
  return (
    (name || 'deck')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'deck'
  )
}

/** Slugify `name`, then append -2, -3, … until `taken` reports the slug is free.
 *  `taken` is a caller-supplied predicate so each backend can check its own store
 *  (filesystem, IndexedDB keys, …) synchronously. */
export function uniqueSlug(name: string, taken: (slug: string) => boolean): string {
  const base = slug(name)
  if (!taken(base)) return base
  let k = 2
  while (taken(`${base}-${k}`)) k++
  return `${base}-${k}`
}
