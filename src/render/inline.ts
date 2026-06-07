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

// Inverse of inlineMd: turn the HTML a contenteditable produces back into the
// Markdown we store. This lets the editor render **bold**/<u>underline</u>/etc.
// live (WYSIWYG) while the source of truth on disk stays clean Markdown.
// Handles both semantic tags (<strong>/<b>, <em>/<i>, <u>, <s>/<strike>/<del>,
// <code>) and the inline-styled <span>s some browsers emit from execCommand.
function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const eln = node as HTMLElement
  const tag = eln.tagName.toLowerCase()
  if (tag === 'br') return '\n'
  let inner = ''
  node.childNodes.forEach((c) => (inner += serializeNode(c)))
  // Block elements (a contenteditable wraps new lines in <div>/<p>) become line breaks.
  if (tag === 'div' || tag === 'p') return inner + '\n'
  if (!inner.trim()) return inner // don't wrap whitespace-only spans in markers
  const style = eln.getAttribute('style') ?? ''
  const bold = tag === 'b' || tag === 'strong' || /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)
  const italic = tag === 'i' || tag === 'em' || /font-style\s*:\s*italic/i.test(style)
  const underline = tag === 'u' || /text-decoration[^;]*underline/i.test(style)
  const strike =
    tag === 's' || tag === 'strike' || tag === 'del' || /text-decoration[^;]*line-through/i.test(style)
  let s = tag === 'code' ? '`' + inner + '`' : inner
  if (bold) s = `**${s}**`
  if (italic) s = `*${s}*`
  if (underline) s = `<u>${s}</u>`
  if (strike) s = `~~${s}~~`
  return s
}
export function htmlToInline(html: string): string {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  let out = ''
  tpl.content.childNodes.forEach((c) => (out += serializeNode(c)))
  return out.replace(/\u00a0/g, ' ').replace(/\n$/, '')
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
