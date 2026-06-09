// Shared helpers for reading OOXML (PowerPoint) parts and the intermediate shape
// model the classifier consumes. Pure DOM work (the browser's DOMParser, or an
// injected one for Node tests) — no app dependencies.

export const STAGE_W = 1280
export const STAGE_H = 720
/** English Metric Units per inch (OOXML geometry unit). */
export const EMU_PER_PX = 9525 // 914400 EMU/inch ÷ 96 px/inch

/** A paragraph of a text shape, already reduced to inline Markdown. */
export interface Para {
  md: string
  bullet: boolean
  level: number
  align?: 'left' | 'center' | 'right'
  /** Largest run font size on the line, in points (for title/heading detection). */
  sizePt: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TextShape extends Rect {
  kind: 'text'
  /** Placeholder role from <p:ph type="…"> (title, ctrTitle, subTitle, body…). */
  ph?: string
  paras: Para[]
  /** Plain concatenated text (for classification + emptiness checks). */
  plain: string
}

export interface PicShape extends Rect {
  kind: 'pic'
  /** Data-URL of the embedded image. */
  src: string
}

export type Shape = TextShape | PicShape

// ── tiny DOM helpers (work with native DOMParser and @xmldom/xmldom) ──
export function parseXml(xml: string, parser?: DOMParser): Document {
  const p = parser ?? new DOMParser()
  return p.parseFromString(xml, 'application/xml')
}
export function tags(el: Element | Document, name: string): Element[] {
  return Array.from(el.getElementsByTagName(name))
}
export function firstTag(el: Element | Document, name: string): Element | null {
  return el.getElementsByTagName(name)[0] ?? null
}
export function attr(el: Element | null, name: string): string | null {
  return el?.getAttribute(name) ?? null
}
export function num(el: Element | null, name: string, fallback = 0): number {
  const v = attr(el, name)
  const n = v == null ? NaN : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Read an <a:xfrm> (the child of a shape's <…spPr>) into a scaled stage Rect. */
export function xfrmRect(spPr: Element | null, sx: number, sy: number): Rect | null {
  if (!spPr) return null
  const xfrm = firstTag(spPr, 'a:xfrm')
  if (!xfrm) return null
  const off = firstTag(xfrm, 'a:off')
  const ext = firstTag(xfrm, 'a:ext')
  if (!off || !ext) return null
  return {
    x: Math.round(num(off, 'x') * sx),
    y: Math.round(num(off, 'y') * sy),
    w: Math.round(num(ext, 'cx') * sx),
    h: Math.round(num(ext, 'cy') * sy),
  }
}

const ESC_MD = /([\\`*_])/g
function escMd(s: string): string {
  return s.replace(ESC_MD, '\\$1')
}

/** Reduce one <a:p> paragraph into inline Markdown + its list/align metadata. */
export function paragraph(p: Element): Para {
  const pPr = firstTag(p, 'a:pPr')
  const level = num(pPr, 'lvl', 0)
  const algn = attr(pPr, 'algn')
  const align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'l' ? 'left' : undefined
  // A paragraph is a bullet unless it explicitly opts out with <a:buNone/>.
  const hasNone = !!(pPr && firstTag(pPr, 'a:buNone'))
  const hasChar = !!(pPr && (firstTag(pPr, 'a:buChar') || firstTag(pPr, 'a:buAutoNum')))
  let md = ''
  let sizePt = 0
  for (const r of tags(p, 'a:r')) {
    const t = firstTag(r, 'a:t')?.textContent ?? ''
    if (!t) continue
    const rPr = firstTag(r, 'a:rPr')
    const sz = num(rPr, 'sz', 0) / 100
    if (sz > sizePt) sizePt = sz
    let piece = escMd(t)
    if (attr(rPr, 'b') === '1') piece = `**${piece}**`
    if (attr(rPr, 'i') === '1') piece = `*${piece}*`
    const u = attr(rPr, 'u')
    if (u && u !== 'none') piece = `<u>${piece}</u>`
    md += piece
  }
  return { md: md.trim(), bullet: hasChar || (!hasNone && level > 0), level, align, sizePt }
}

/** Read all paragraphs of a <p:txBody>. */
export function paragraphs(txBody: Element): Para[] {
  return tags(txBody, 'a:p').map(paragraph)
}
