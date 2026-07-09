// Dek deck → PowerPoint (.pptx). The inverse of import/pptx.ts.
//
// Strategy: every slide — semantic layout or freeform — is reduced to the same
// positioned stage-pixel elements the canvas uses (via bakeToElements), then each
// element is emitted as an absolutely-positioned OOXML shape. One code path
// covers all twelve layouts, and because bake mirrors slide.css geometry the
// PowerPoint output lands where the layout rendered it.
//
// The stage is 1280×720 px; a 16:9 PowerPoint slide is 12192000×6858000 EMU, so
// the scale is exactly 9525 EMU/px (EMU_PER_PX) with no distortion.
import type { Deck, Slide, SlideElement, BoxElement, ArrowElement, VideoElement, DiagramElement } from '../core/types'
import { bakeToElements } from '../core/bake'
import { parseContent } from '../render/inline'
import { DEFAULT_THEME } from '../tokens'

const EMU = 9525 // EMU per stage pixel (matches import/ooxml EMU_PER_PX)
const STAGE_W = 1280
const STAGE_H = 720
const SLIDE_CX = STAGE_W * EMU // 12192000
const SLIDE_CY = STAGE_H * EMU // 6858000

/** Resolves an image URL to raw bytes for embedding. Provided by the caller
 *  (ExportView) because URL → bytes needs `fetch`/FileReader in the browser. */
export type ImageResolver = (url: string) => Promise<{ base64: string; ext: string } | null>

interface ResolvedTheme {
  bg: string
  text: string
  accent: string
  accent2: string
  fontHeading: string
  fontBody: string
}
function resolveTheme(deck: Deck): ResolvedTheme {
  const t = deck.config.theme ?? {}
  const d = DEFAULT_THEME
  return {
    bg: t.bg ?? d.color.bg,
    text: t.text ?? d.color.text,
    accent: t.accent ?? d.color.accent,
    accent2: t.accent2 ?? d.color.accent2,
    fontHeading: t.fontHeading ?? d.font.heading,
    fontBody: t.fontBody ?? d.font.body,
  }
}

// ── text / xml helpers ──
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
const px = (n: number) => Math.round(n * EMU)

interface Color {
  hex: string
  alpha?: number
}
function parseRgb(s: string): Color | null {
  const m = /rgba?\(([^)]+)\)/i.exec(s)
  if (!m) return null
  const parts = m[1].split(',').map((x) => x.trim())
  const [r, g, b] = parts.map(Number)
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null
  const hex = [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('')
  const a = parts[3] !== undefined ? Number(parts[3]) : undefined
  return { hex: hex.toUpperCase(), alpha: Number.isFinite(a as number) ? a : undefined }
}
/** CSS colour (hex / rgb(a) / `var(--dek-*)` / a couple of names) → PPTX srgb,
 *  or null for transparent/unknown (→ noFill). */
function resolveColor(c: string | undefined, theme: ResolvedTheme): Color | null {
  if (!c) return null
  const s = c.trim()
  if (s === 'transparent' || s === 'none' || s === '') return null
  const v = /var\(--dek-([\w-]+)\)/.exec(s)
  if (v) {
    const map: Record<string, string> = { bg: theme.bg, text: theme.text, accent: theme.accent, accent2: theme.accent2 }
    return resolveColor(map[v[1]], theme)
  }
  if (s[0] === '#') {
    let h = s.slice(1)
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
    if (h.length === 6) return { hex: h.toUpperCase() }
    if (h.length === 8) return { hex: h.slice(0, 6).toUpperCase(), alpha: parseInt(h.slice(6), 16) / 255 }
    return null
  }
  if (/^rgba?\(/i.test(s)) return parseRgb(s)
  const named: Record<string, string> = { white: 'FFFFFF', black: '000000', red: 'FF0000' }
  return named[s.toLowerCase()] ? { hex: named[s.toLowerCase()] } : null
}
function srgb(col: Color): string {
  const alpha = col.alpha != null && col.alpha < 1 ? `<a:alpha val="${Math.round(col.alpha * 100000)}"/>` : ''
  return `<a:srgbClr val="${col.hex}">${alpha}</a:srgbClr>`
}
const solidFill = (col: Color) => `<a:solidFill>${srgb(col)}</a:solidFill>`

// ── inline markdown → runs ──
interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  href?: string
}
function safeHref(url: string): string | undefined {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : undefined
}
/** Tokenise one line of inline Markdown (**bold**, *italic*, `code`, <u>…</u>,
 *  ~~strike~~, [text](url)) into styled runs. */
export function inlineRuns(src: string): Run[] {
  const runs: Run[] = []
  const st = { bold: false, italic: false, underline: false, strike: false }
  let buf = ''
  const flush = () => {
    if (buf) runs.push({ text: buf, ...st })
    buf = ''
  }
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest)
    if (link) {
      flush()
      runs.push({ text: link[1], href: safeHref(link[2]), ...st })
      i += link[0].length
      continue
    }
    if (rest.startsWith('**')) { flush(); st.bold = !st.bold; i += 2; continue }
    if (rest.startsWith('~~')) { flush(); st.strike = !st.strike; i += 2; continue }
    if (rest.startsWith('<u>')) { flush(); st.underline = true; i += 3; continue }
    if (rest.startsWith('</u>')) { flush(); st.underline = false; i += 4; continue }
    if (rest[0] === '*') { flush(); st.italic = !st.italic; i += 1; continue }
    if (rest[0] === '`') { flush(); i += 1; continue } // code: drop the marker, keep text
    buf += src[i]
    i += 1
  }
  flush()
  return runs.length ? runs : [{ text: '' }]
}

// ── shape emission ──
interface SlideCtx {
  theme: ResolvedTheme
  nextId: () => number
  /** Register an image URL for this slide; returns its relationship id, or null
   *  if it couldn't be resolved. */
  imageRel: (url: string) => string | null
}

function fontFor(font: string | undefined, theme: ResolvedTheme): string {
  if (font === 'heading') return theme.fontHeading
  if (font === 'body' || !font) return theme.fontBody
  return font
}

function runXml(r: Run, size: number, color: Color, font: string): string {
  const b = r.bold ? ' b="1"' : ''
  const i = r.italic ? ' i="1"' : ''
  const u = r.underline ? ' u="sng"' : ''
  const s = r.strike ? ' strike="sngStrike"' : ''
  const rpr = `<a:rPr lang="en-US" sz="${size}"${b}${i}${u}${s}>${solidFill(color)}<a:latin typeface="${esc(font)}"/></a:rPr>`
  const t = `<a:t>${esc(r.text)}</a:t>`
  return `<a:r>${rpr}${t}</a:r>`
}

function paragraphXml(text: string, bullet: boolean, box: BoxElement, size: number, color: Color, font: string): string {
  const algn = box.align === 'center' ? ' algn="ctr"' : box.align === 'right' ? ' algn="r"' : ' algn="l"'
  const lh = box.lineHeight ? `<a:lnSpc><a:spcPct val="${Math.round(box.lineHeight * 100000)}"/></a:lnSpc>` : ''
  // list gap (em) → points after the paragraph
  const gapPts = box.lineGap ? Math.round(box.lineGap * (size / 100) * 100) : 0
  const after = gapPts ? `<a:spcAft><a:spcPts val="${gapPts}"/></a:spcAft>` : ''
  const bu = bullet
    ? '<a:buFont typeface="Arial"/><a:buChar char="•"/>'
    : '<a:buNone/>'
  const marL = bullet ? ' marL="285750" indent="-285750"' : ''
  const runs = inlineRuns(text).map((r) => runXml(r, size, color, font)).join('')
  return `<a:p><a:pPr${marL}${algn}>${lh}${after}${bu}</a:pPr>${runs}</a:p>`
}

function xfrm(x: number, y: number, w: number, h: number, rotation?: number): string {
  const rot = rotation ? ` rot="${Math.round(rotation * 60000)}"` : ''
  return `<a:xfrm${rot}><a:off x="${px(x)}" y="${px(y)}"/><a:ext cx="${px(Math.max(1, w))}" cy="${px(Math.max(1, h))}"/></a:xfrm>`
}

function picXml(id: number, rId: string, x: number, y: number, w: number, h: number, rotation?: number): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr>${xfrm(x, y, w, h, rotation)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
  )
}

function boxXml(box: BoxElement, ctx: SlideCtx): string {
  const id = ctx.nextId()
  // An image box → a picture (any text overlay is dropped; Dek boxes rarely mix).
  if (box.src) {
    const rId = ctx.imageRel(box.src)
    if (rId) return picXml(id, rId, box.x, box.y, box.w, box.h, box.rotation)
  }
  const fill = resolveColor(box.fill, ctx.theme)
  const stroke = resolveColor(box.stroke, ctx.theme)
  const geom = box.radius && box.radius > 0 ? 'roundRect' : 'rect'
  const fillXml = fill ? solidFill(fill) : '<a:noFill/>'
  const lnXml = stroke
    ? `<a:ln w="${px(box.strokeWidth ?? 1)}">${solidFill(stroke)}</a:ln>`
    : '<a:ln><a:noFill/></a:ln>'
  const spPr = `<p:spPr>${xfrm(box.x, box.y, box.w, box.h, box.rotation)}<a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom>${fillXml}${lnXml}</p:spPr>`

  let txBody = ''
  if (box.content != null && box.content !== '') {
    const size = Math.round((box.size ?? 18) * 75) // px → pt×100
    const color = resolveColor(box.color, ctx.theme) ?? resolveColor(ctx.theme.text, ctx.theme)!
    const font = fontFor(box.font, ctx.theme)
    const anchor = box.valign === 'middle' ? 'ctr' : box.valign === 'bottom' ? 'b' : 't'
    const rows = parseContent(box.content)
    const paras = (rows.length ? rows : [{ text: box.content, bullet: false }])
      .map((r) => paragraphXml(r.text, r.bullet, box, size, color, font))
      .join('')
    // ~(10,6)px insets mirror the canvas text box padding.
    const bodyPr = `<a:bodyPr wrap="square" anchor="${anchor}" lIns="95250" tIns="57150" rIns="95250" bIns="57150"><a:normAutofit/></a:bodyPr>`
    txBody = `<p:txBody>${bodyPr}<a:lstStyle/>${paras}</p:txBody>`
  } else {
    txBody = '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>'
  }
  const txBox = !fill && !stroke ? ' txBox="1"' : ''
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr${txBox}/><p:nvPr/></p:nvSpPr>${spPr}${txBody}</p:sp>`
}

function arrowXml(a: ArrowElement, ctx: SlideCtx): string {
  const id = ctx.nextId()
  const stroke = resolveColor(a.stroke, ctx.theme) ?? resolveColor(ctx.theme.text, ctx.theme)!
  const ln = `<a:ln w="${px(a.strokeWidth ?? 2)}">${solidFill(stroke)}<a:tailEnd type="triangle"/></a:ln>`
  const spPr = `<p:spPr>${xfrm(a.x, a.y, a.w, a.h, a.rotation)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${ln}</p:spPr>`
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Arrow ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>${spPr}</p:cxnSp>`
}

function videoXml(v: VideoElement, ctx: SlideCtx): string {
  // v1: a poster still if present, else a dark plate labelled with the URL.
  // (True embedded playback needs media parts; deferred.)
  if (v.poster) {
    const rId = ctx.imageRel(v.poster)
    if (rId) return picXml(ctx.nextId(), rId, v.x, v.y, v.w, v.h, v.rotation)
  }
  const box: BoxElement = {
    type: 'box',
    x: v.x, y: v.y, w: v.w, h: v.h, rotation: v.rotation,
    fill: 'rgba(10,11,14,1)', stroke: ctx.theme.accent, radius: 8,
    content: `▶ ${v.video || 'Video'}`,
    color: 'rgba(230,236,242,0.85)', align: 'center', valign: 'middle', size: 20,
  }
  return boxXml(box, ctx)
}

function diagramXml(d: DiagramElement, ctx: SlideCtx): string {
  // v1: the Mermaid source as monospace text (live rendering isn't available at
  // export time). Deferred: rasterise the rendered SVG.
  const box: BoxElement = {
    type: 'box',
    x: d.x, y: d.y, w: d.w, h: d.h, rotation: d.rotation,
    fill: 'rgba(255,255,255,0.03)', stroke: 'rgba(230,236,242,0.12)', radius: 8,
    content: d.code || 'diagram', font: 'body', size: 16,
    color: 'rgba(230,236,242,0.8)', valign: 'top',
  }
  return boxXml(box, ctx)
}

function elementXml(el: SlideElement, ctx: SlideCtx): string {
  switch (el.type) {
    case 'box':
      return boxXml(el, ctx)
    case 'arrow':
      return arrowXml(el, ctx)
    case 'image':
      return el.src ? (ctx.imageRel(el.src) ? picXml(ctx.nextId(), ctx.imageRel(el.src)!, el.x, el.y, el.w, el.h, el.rotation) : '') : ''
    case 'video':
      return videoXml(el, ctx)
    case 'diagram':
      return diagramXml(el, ctx)
    default:
      return ''
  }
}

/** The positioned elements that reproduce a slide: the baked layout plus any
 *  free-canvas overlay it also carries. */
function slideElements(slide: Slide): SlideElement[] {
  if (slide.layout === 'freeform') return slide.elements ?? []
  return [...bakeToElements(slide), ...(slide.elements ?? [])]
}

// ── package parts ──
function slideXml(elementsXml: string, theme: ResolvedTheme): string {
  const bg = resolveColor(theme.bg, theme)
  const bgXml = bg ? `<p:bg><p:bgPr>${solidFill(bg)}<a:effectLst/></p:bgPr></p:bg>` : ''
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld>${bgXml}<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${SLIDE_CX}" cy="${SLIDE_CY}"/><a:chOff x="0" y="0"/><a:chExt cx="${SLIDE_CX}" cy="${SLIDE_CY}"/></a:xfrm></p:grpSpPr>` +
    elementsXml +
    `</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr></p:sld>`
  )
}

const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
function slideRels(images: Array<{ rId: string; file: string }>): string {
  const imgRels = images
    .map((im) => `<Relationship Id="${im.rId}" Type="${RELS}/image" Target="../media/${im.file}"/>`)
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${RELS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    imgRels +
    `</Relationships>`
  )
}

function themeXml(theme: ResolvedTheme): string {
  const c = (v: string) => resolveColor(v, theme)?.hex ?? '000000'
  const acc = [c(theme.accent), c(theme.accent2), '8CB369', 'F4A259', '5B8E7D', 'BC4B51']
  const accents = acc.map((h, i) => `<a:accent${i + 1}><a:srgbClr val="${h}"/></a:accent${i + 1}>`).join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Dek">` +
    `<a:themeElements><a:clrScheme name="Dek">` +
    `<a:dk1><a:srgbClr val="${c(theme.text)}"/></a:dk1><a:lt1><a:srgbClr val="${c(theme.bg)}"/></a:lt1>` +
    `<a:dk2><a:srgbClr val="${c(theme.text)}"/></a:dk2><a:lt2><a:srgbClr val="${c(theme.bg)}"/></a:lt2>` +
    accents +
    `<a:hlink><a:srgbClr val="${c(theme.accent)}"/></a:hlink><a:folHlink><a:srgbClr val="${c(theme.accent2)}"/></a:folHlink></a:clrScheme>` +
    `<a:fontScheme name="Dek"><a:majorFont><a:latin typeface="${esc(theme.fontHeading)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>` +
    `<a:minorFont><a:latin typeface="${esc(theme.fontBody)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>` +
    `<a:fmtScheme name="Dek">` +
    `<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>` +
    `<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>` +
    `<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>` +
    `<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>` +
    `</a:fmtScheme></a:themeElements></a:theme>`
  )
}

// Minimal slide master + layout (required by the format; carry no placeholders —
// every Dek shape is explicitly positioned on the slide itself).
function slideMasterXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr/></p:spTree></p:cSld>` +
    `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>` +
    `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`
  )
}
function slideMasterRels(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${RELS}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>` +
    `<Relationship Id="rId2" Type="${RELS}/theme" Target="../theme/theme1.xml"/>` +
    `</Relationships>`
  )
}
function slideLayoutXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">` +
    `<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  )
}
function slideLayoutRels(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${RELS}/slideMaster" Target="../slideMasters/slideMaster1.xml"/>` +
    `</Relationships>`
  )
}

function presentationXml(n: number): string {
  const sldIds = Array.from({ length: n }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`).join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>` +
    `<p:sldIdLst>${sldIds}</p:sldIdLst>` +
    `<p:sldSz cx="${SLIDE_CX}" cy="${SLIDE_CY}" type="screen16x9"/>` +
    `<p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
  )
}
function presentationRels(n: number): string {
  const slides = Array.from({ length: n }, (_, i) => `<Relationship Id="rId${2 + i}" Type="${RELS}/slide" Target="slides/slide${i + 1}.xml"/>`).join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${RELS}/slideMaster" Target="slideMasters/slideMaster1.xml"/>` +
    slides +
    `<Relationship Id="rId${n + 2}" Type="${RELS}/presProps" Target="presProps.xml"/>` +
    `<Relationship Id="rId${n + 3}" Type="${RELS}/theme" Target="theme/theme1.xml"/>` +
    `</Relationships>`
  )
}
function contentTypes(n: number, imageExts: Set<string>): string {
  const defaults = ['png', 'jpeg', 'jpg', 'gif', 'webp', 'svg']
  for (const e of imageExts) defaults.push(e)
  const imgDefaults = [...new Set(defaults)]
    .map((e) => `<Default Extension="${e}" ContentType="image/${e === 'jpg' ? 'jpeg' : e === 'svg' ? 'svg+xml' : e}"/>`)
    .join('')
  const slideOverrides = Array.from({ length: n }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    imgDefaults +
    `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
    `<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>` +
    `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>` +
    `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>` +
    `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>` +
    slideOverrides +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`
  )
}
function rootRels(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${RELS}/officeDocument" Target="ppt/presentation.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="${RELS}/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`
  )
}
function coreXml(title: string): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(title)}</dc:title><dc:creator>Dek</dc:creator><cp:lastModifiedBy>Dek</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`
  )
}
function appXml(n: number): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Dek</Application><Slides>${n}</Slides></Properties>`
  )
}
function presPropsXml(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`
  )
}

const EXT_TO_MEDIA = (ext: string) => (ext === 'jpeg' ? 'jpg' : ext)

/**
 * Build a `.pptx` package from a deck. `resolveImage` turns an image URL into
 * embeddable bytes (the caller supplies it because that needs `fetch` in the
 * browser); images that don't resolve are simply omitted.
 */
export async function deckToPptx(deck: Deck, resolveImage: ImageResolver): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const theme = resolveTheme(deck)

  // Resolve every referenced image once, into shared media files.
  const media = new Map<string, { file: string; base64: string; ext: string }>()
  const urls = new Set<string>()
  for (const slide of deck.slides) for (const el of slideElements(slide)) {
    if (el.type === 'box' && el.src) urls.add(el.src)
    if (el.type === 'image' && el.src) urls.add(el.src)
    if (el.type === 'video' && el.poster) urls.add(el.poster)
  }
  let mi = 0
  for (const url of urls) {
    const got = await resolveImage(url)
    if (!got) continue
    const ext = EXT_TO_MEDIA((got.ext || 'png').toLowerCase())
    media.set(url, { file: `image${++mi}.${ext}`, base64: got.base64, ext })
  }

  const zip = new JSZip()
  const n = deck.slides.length

  // Per-slide XML + rels.
  deck.slides.forEach((slide, i) => {
    let idc = 1
    const slideImages: Array<{ rId: string; file: string }> = []
    const relByUrl = new Map<string, string>()
    const ctx: SlideCtx = {
      theme,
      nextId: () => ++idc + 1, // ids 2,3,… (1 is the group)
      imageRel: (url: string) => {
        const m = media.get(url)
        if (!m) return null
        if (relByUrl.has(url)) return relByUrl.get(url)!
        const rId = `rId${slideImages.length + 2}` // rId1 is the layout
        slideImages.push({ rId, file: m.file })
        relByUrl.set(url, rId)
        return rId
      },
    }
    const body = slideElements(slide).map((el) => elementXml(el, ctx)).join('')
    zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(body, theme))
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, slideRels(slideImages))
  })

  for (const m of media.values()) {
    zip.file(`ppt/media/${m.file}`, m.base64, { base64: true })
  }

  const imageExts = new Set([...media.values()].map((m) => m.ext))
  zip.file('[Content_Types].xml', contentTypes(n, imageExts))
  zip.file('_rels/.rels', rootRels())
  zip.file('ppt/presentation.xml', presentationXml(n))
  zip.file('ppt/_rels/presentation.xml.rels', presentationRels(n))
  zip.file('ppt/presProps.xml', presPropsXml())
  zip.file('ppt/theme/theme1.xml', themeXml(theme))
  zip.file('ppt/slideMasters/slideMaster1.xml', slideMasterXml())
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', slideMasterRels())
  zip.file('ppt/slideLayouts/slideLayout1.xml', slideLayoutXml())
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', slideLayoutRels())
  zip.file('docProps/core.xml', coreXml(deck.config.deck ?? 'Deck'))
  zip.file('docProps/app.xml', appXml(n))

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}
