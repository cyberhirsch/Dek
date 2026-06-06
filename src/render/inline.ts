// Minimal, safe inline markdown: **bold**, *italic*, <u>underline</u>, `code`.
// Escapes HTML first so deck content can't inject markup, then re-allows the one
// underline tag (<u>) since no standard Markdown has underline. `freeform` is the
// only fully-raw-HTML path.
export function inlineMd(src: string | undefined): string {
  if (!src) return ''
  const esc = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc
    .replace(/&lt;u&gt;/g, '<u>')
    .replace(/&lt;\/u&gt;/g, '</u>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

export interface ContentRow {
  text: string
  bullet: boolean
}

/** Parse a Markdown `content` block into rows. A line starting with `- ` (or `* `)
 *  is a bullet; any other non-empty line is a plain paragraph. Blank lines are
 *  dropped (they only separate). The raw text per row keeps inline markdown. */
export function parseContent(content: string | undefined): ContentRow[] {
  if (!content) return []
  const rows: ContentRow[] = []
  for (const raw of content.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) continue
    const m = line.match(/^\s*[-*]\s+(.*)$/)
    if (m) rows.push({ text: m[1], bullet: true })
    else rows.push({ text: line.trim(), bullet: false })
  }
  return rows
}

/** Serialize rows back into a Markdown `content` block (inverse of parseContent). */
export function rowsToContent(rows: ContentRow[]): string {
  return rows.map((r) => (r.bullet ? `- ${r.text}` : r.text)).join('\n')
}
