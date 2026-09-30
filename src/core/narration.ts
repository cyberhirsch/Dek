// What narrate mode says on a slide, and when.
//
// The spoken text lives in the speaker notes: every line that starts with `>`
// is said aloud; the rest of the notes stay private (reminders, "delete?",
// sources). One place for everything the presenter knows about a slide.

/** The `>` lines of a slide's notes, marker removed, in order. */
export function spokenLines(notes: string | undefined): string[] {
  if (!notes) return []
  return notes
    .split(/\r?\n/)
    .map((l) => /^\s*>\s?(.*)$/.exec(l)?.[1]?.trim())
    .filter((l): l is string => !!l)
}

/** One unit of narration: reveal this many build rows (undefined on a slide
 *  without steps), then say `text` — or, with no text, hold briefly. */
export interface Beat {
  reveal?: number
  text?: string
}

/**
 * The beats of one slide. Without build steps: one beat per spoken line.
 * With steps (`rows` build rows): beat k reveals row k and says line k, so
 * each line lands with the row it's about. Rows beyond the lines are still
 * revealed, one per (silent) beat; lines beyond the rows are said with
 * everything shown.
 */
export function narrationBeats(lines: string[], rows = 0): Beat[] {
  if (rows <= 0) return lines.map((text) => ({ text }))
  const n = Math.max(rows, lines.length)
  return Array.from({ length: n }, (_, k) => ({
    reveal: Math.min(k + 1, rows),
    ...(lines[k] ? { text: lines[k] } : {}),
  }))
}

/** Split long text into sentence-sized pieces: browser voices stall or cut
 *  off on long utterances, and short ones let a stop take effect promptly. */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim())
      cur = ''
    }
    cur += s
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/**
 * A spoken line's audio id: the first 12 hex digits of SHA-1 over the line as
 * spokenLines() returns it. Content-addressed on purpose — the generation
 * script and the player compute it independently, and a line edited after its
 * audio was made simply has no file, so it falls back to the browser voice
 * instead of playing stale words. Same text, same id, in any deck.
 */
export async function lineId(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const hash = await globalThis.crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(hash).slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Every spoken line of a deck, in order, with its audio id — what the
 *  generation script voices and what the ⚙ menu counts. */
export async function deckSpokenLines(slides: { notes?: string }[]): Promise<{ id: string; text: string }[]> {
  const out: { id: string; text: string }[] = []
  const seen = new Set<string>()
  for (const s of slides) {
    for (const text of spokenLines(s.notes)) {
      const id = await lineId(text)
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, text })
    }
  }
  return out
}
