// Minimal, safe inline markdown: **bold**, *italic*, `code`. Escapes HTML first
// so deck content can't inject markup (freeform is the only raw-HTML path).
export function inlineMd(src: string | undefined): string {
  if (!src) return ''
  const esc = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
