// What narrate mode says on a slide, and when.
//
// The spoken text lives in the speaker notes. A line starting with `>` begins
// a spoken passage, which runs over the following lines until the next `>`.
// Notes before the first `>` stay private (reminders, "delete?", sources).
// One place for everything the presenter knows about a slide.
import { parseContent } from '../render/inline'

/**
 * The spoken passages of a slide's notes, in order: each `>` starts one, and
 * the lines after it (up to the next `>`) belong to it, joined with spaces.
 * On a build slide, passage k is said as bullet k appears.
 */
export function spokenLines(notes: string | undefined): string[] {
  if (!notes) return []
  const out: string[][] = []
  for (const line of notes.split(/\r?\n/)) {
    const m = /^\s*>\s?(.*)$/.exec(line)
    if (m) out.push([m[1]])
    else if (out.length) out[out.length - 1].push(line)
  }
  return out
    .map((parts) => parts.map((p) => p.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
}

/** One unit of narration: reveal this many build rows (undefined on a slide
 *  without steps), then say `text` — or, with no text, hold briefly. */
export interface Beat {
  reveal?: number
  text?: string
}

/**
 * The beats of one slide. Without build steps: one beat per spoken line.
 *
 * With steps (`rows` build rows), every row gets its own share of the
 * narration, said as that row appears:
 * - one `>` line per row: line k goes with row k, as written;
 * - otherwise (one long paragraph, or a different count) the spoken text is
 *   split into sentences and handed out in order, each run of sentences to
 *   the row it shares the most words with (`rowTexts`); with nothing to go
 *   on, they're spread evenly. A row that gets no sentence is still revealed,
 *   after a short hold.
 */
export function narrationBeats(lines: string[], rows = 0, rowTexts: string[] = []): Beat[] {
  if (rows <= 0) return lines.map((text) => ({ text }))
  let groups: string[][]
  if (lines.length === rows) groups = lines.map((l) => [l])
  else {
    // Direction tags ([calm], [breath]…) belong to the whole passage: take them
    // off before splitting, match rows on the words alone, and give every piece
    // its passage's tags back — so each piece is voiced, and hashed, with them.
    let pieces = lines.flatMap((l) => {
      const { tags, body } = splitVoiceTags(l)
      return splitSentences(body).map((text) => ({ tags, text }))
    })
    // A list said as one sentence ("…: proximity, similarity, closure…") has
    // fewer sentences than rows; its clauses are what the rows are about.
    if (pieces.length < rows) pieces = pieces.flatMap((p) => splitClauses(p.text).map((text) => ({ tags: p.tags, text })))
    const runs = pieces.length === rows ? pieces.map((p) => [p.text]) : alignToRows(pieces.map((p) => p.text), rows, rowTexts)
    let at = 0
    groups = runs.map((run) => {
      const mine = pieces.slice(at, (at += run.length))
      // One set of tags per spoken line, at its start (the voice tool ignores
      // tags anywhere else): the first piece's.
      return mine.length ? [...mine[0].tags, ...mine.map((p) => p.text)] : []
    })
  }
  return groups.map((g, k) => ({ reveal: k + 1, ...(g.length ? { text: g.join(' ') } : {}) }))
}

// ── voice direction tags ──
// A spoken passage may open with tags for the local voice tool, e.g.
// "> [calm] [breath] Hand it in before class starts." The tool reads and strips
// them; they stay in the text Dek hashes and sends it (so changing a tag
// re-voices that line). Everything that speaks, shows or matches text in Dek
// itself uses the text without them. A Markdown link [label](url) isn't a tag.

const VOICE_TAGS = /^(\s*\[[A-Za-z]+\](?!\())+\s*/
/** Tags the voice tool acts on; others are dropped by it with a warning. */
export const KNOWN_VOICE_TAGS = new Set(['calm', 'happy', 'breath'])

/** Leading direction tags of a passage (as written, brackets included), and the rest. */
export function splitVoiceTags(text: string): { tags: string[]; body: string } {
  const m = VOICE_TAGS.exec(text)
  if (!m) return { tags: [], body: text }
  return { tags: m[0].match(/\[[A-Za-z]+\]/g) ?? [], body: text.slice(m[0].length) }
}

/** The passage without its leading direction tags — what a person hears or reads. */
export function stripVoiceTags(text: string): string {
  return splitVoiceTags(text).body
}

/** Leading tags the voice tool doesn't know (it drops them), lowercased. */
export function unknownVoiceTags(text: string): string[] {
  return splitVoiceTags(text)
    .tags.map((t) => t.slice(1, -1).toLowerCase())
    .filter((t) => !KNOWN_VOICE_TAGS.has(t))
}

/** A slide's beats, from its notes and its build rows. The one place both
 *  narrate mode and the audio generator get them from, so a generated file
 *  always matches a text that is actually spoken. */
export function slideBeats(slide: { notes?: string; steps?: boolean; content?: string } | undefined): Beat[] {
  if (!slide) return []
  const rows = slide.steps ? parseContent(slide.content) : []
  return narrationBeats(
    spokenLines(slide.notes),
    rows.length,
    rows.map((r) => r.text),
  )
}

/** Sentences of one spoken line. */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?…]+[.!?…]+["'”’)]*\s*|[^.!?…]+$/g) ?? [text]).map((x) => x.trim()).filter(Boolean)
}

/** Clauses of a sentence: split after `,` `;` `:` or a dash followed by a
 *  space, so "1,000" and "24×24" stay whole. */
export function splitClauses(sentence: string): string[] {
  return sentence
    .split(/(?<=[,;:—–])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

const STOP = new Set(
  'the a an and or but of to in on at for with by from is are was were be been it its this that these those as into than then so not no you your we our they their he she his her i my me us can will'.split(' '),
)
function words(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/[*_`~[\]()]/g, ' ')
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

/**
 * Split `sentences` (in order) into `rows` consecutive runs, one per row,
 * maximising the words each run shares with its row. Every row gets at least
 * one sentence when there are enough; a small pull towards an even spread
 * decides when the words don't.
 */
export function alignToRows(sentences: string[], rows: number, rowTexts: string[] = []): string[][] {
  const S = sentences.length
  const R = rows
  const sw = sentences.map(words)
  const rw = Array.from({ length: R }, (_, r) => words(rowTexts[r] ?? ''))
  const minRun = S >= R ? 1 : 0
  // Score of giving sentences [i, j) to row r.
  const score = (r: number, i: number, j: number) => {
    let s = 0
    for (let k = i; k < j; k++) {
      for (const w of sw[k]) if (rw[r].has(w)) s += 1
      // tie-break: sentence k "belongs" to row ⌊k·R/S⌋ — an even spread
      // that starts at the first row
      s -= 0.01 * Math.abs(Math.floor((k * R) / S) - r)
    }
    return s
  }
  // best[r][j]: best total for rows < r covering sentences < j.
  const NEG = -Infinity
  const best = Array.from({ length: R + 1 }, () => new Array<number>(S + 1).fill(NEG))
  const from = Array.from({ length: R + 1 }, () => new Array<number>(S + 1).fill(0))
  best[0][0] = 0
  for (let r = 1; r <= R; r++) {
    for (let j = 0; j <= S; j++) {
      for (let i = 0; i <= j - minRun; i++) {
        if (best[r - 1][i] === NEG) continue
        const v = best[r - 1][i] + score(r - 1, i, j)
        if (v > best[r][j]) {
          best[r][j] = v
          from[r][j] = i
        }
      }
    }
  }
  const out: string[][] = new Array(R)
  let j = S
  for (let r = R; r >= 1; r--) {
    const i = from[r][j]
    out[r - 1] = sentences.slice(i, j)
    j = i
  }
  return out
}

/** Split long text into sentence-sized pieces: browser voices stall or cut
 *  off on long utterances, and short ones let a stop take effect promptly. */
export function speechChunks(text: string, max = 220): string[] {
  // Direction tags are for the local voice tool; a browser voice would read them out.
  text = stripVoiceTags(text)
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
export async function deckSpokenLines(
  slides: { notes?: string; steps?: boolean; content?: string }[],
): Promise<{ id: string; text: string }[]> {
  const out: { id: string; text: string }[] = []
  const seen = new Set<string>()
  for (const s of slides) {
    for (const text of slideBeats(s).flatMap((b) => (b.text ? [b.text] : []))) {
      const id = await lineId(text)
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, text })
    }
  }
  return out
}

const GERMAN = new Set(
  'und der die das nicht ist ich sie wir ihr ein eine einen mit auf für von zu den dem des sich auch oder aber wenn dann wie was hier jetzt noch schon'.split(' '),
)
const ENGLISH = new Set(
  'the and is are was were you we they this that with for not but what when then how here now already also or of to in on it'.split(' '),
)
/**
 * Whether narration text is German rather than English, by its most common
 * small words. The local voice model speaks English only, so German decks
 * stay on the browser voice and are never sent to it.
 */
export function looksGerman(texts: string[]): boolean {
  let de = 0
  let en = 0
  for (const t of texts) {
    for (const w of t.toLowerCase().split(/[^\p{L}]+/u)) {
      if (GERMAN.has(w)) de++
      else if (ENGLISH.has(w)) en++
    }
  }
  return de > en
}

// ── respellings ──
// The voice tool respells words it gets wrong (pronunciations.json next to
// speak.py: whole word, case-sensitive, keys starting with `_` ignored). A
// line's audio id hashes the text as written, so a new or changed respelling
// wouldn't make its file look outdated. Each voiced file therefore records a
// stamp of the respellings that applied to its line (voice/voiced.json); when
// the stamp no longer matches, the line counts as missing and is voiced again.

export type Respellings = Record<string, string>

/** The manifest beside the audio files: line id → respelling stamp. */
export const VOICE_MANIFEST = 'voiced.json'
export interface VoiceManifest {
  version: 1
  lines: Record<string, string>
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The respellings that apply to `text`, sorted, as [word, spoken as]. */
export function respellingsIn(text: string, map: Respellings): [string, string][] {
  return Object.entries(map)
    .filter(([k, v]) => k && !k.startsWith('_') && typeof v === 'string')
    .filter(([k]) => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(k)}(?![\\p{L}\\p{N}_])`, 'u').test(text))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/** '' when no respelling applies; otherwise a short hash of those that do. */
export async function respellingStamp(text: string, map: Respellings): Promise<string> {
  const hits = respellingsIn(text, map)
  return hits.length ? lineId(JSON.stringify(hits)) : ''
}

/**
 * Whether a line with a file still needs voicing because its respellings
 * changed. A file voiced before stamps existed (no entry) is outdated only if
 * some respelling applies to its line now.
 */
export function respellingOutdated(manifest: VoiceManifest | null, id: string, stamp: string): boolean {
  const had = manifest?.lines[id]
  return had === undefined ? stamp !== '' : had !== stamp
}
