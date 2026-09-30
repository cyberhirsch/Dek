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
