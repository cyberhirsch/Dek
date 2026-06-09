// PowerPoint (.pptx) → Dek deck. Pure browser work: JSZip reads the OPC package,
// the DOM parses each slide part, shapes are reduced to the ooxml.ts model, and
// classify.ts maps each slide to a Dek layout (or freeform). Images are embedded
// as data URLs; the caller rehomes them into the deck's storage.
import JSZip from 'jszip'
import type { Deck, Slide } from '../core/types'
import { defaultConfig } from '../core/deck'
import { classifySlide } from './classify'
import {
  STAGE_W,
  STAGE_H,
  parseXml,
  tags,
  firstTag,
  attr,
  num,
  paragraphs,
  type Shape,
} from './ooxml'

export interface ImportResult {
  deck: Deck
  name: string
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

// ── OPC path helpers ──
function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}
function resolvePath(base: string, target: string): string {
  const parts = (base ? base.split('/') : []).concat(target.split('/'))
  const out: string[] = []
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}
function relsPathFor(part: string): string {
  const d = dirname(part)
  const base = part.slice(d.length + 1)
  return `${d}/_rels/${base}.rels`
}

interface Rel {
  type: string
  target: string
}

// ── geometry transform (handles nested groups) ──
interface TX {
  pt: (x: number, y: number) => [number, number]
  sx: number
  sy: number
}
const IDENTITY: TX = { pt: (x, y) => [x, y], sx: 1, sy: 1 }
function childTx(parent: TX, grpSpPr: Element | null): TX {
  const xfrm = grpSpPr ? firstTag(grpSpPr, 'a:xfrm') : null
  if (!xfrm) return parent
  const off = firstTag(xfrm, 'a:off')
  const ext = firstTag(xfrm, 'a:ext')
  const chOff = firstTag(xfrm, 'a:chOff')
  const chExt = firstTag(xfrm, 'a:chExt')
  if (!off || !ext || !chOff || !chExt) return parent
  const ox = num(off, 'x'), oy = num(off, 'y')
  const cox = num(chOff, 'x'), coy = num(chOff, 'y')
  const gsx = num(chExt, 'cx') ? num(ext, 'cx') / num(chExt, 'cx') : 1
  const gsy = num(chExt, 'cy') ? num(ext, 'cy') / num(chExt, 'cy') : 1
  return {
    pt: (x, y) => parent.pt(ox + (x - cox) * gsx, oy + (y - coy) * gsy),
    sx: parent.sx * gsx,
    sy: parent.sy * gsy,
  }
}

/** Raw EMU rect from a shape's <…spPr>/<a:xfrm>, transformed through `tx`. */
function worldRect(spPr: Element | null, tx: TX): { x: number; y: number; w: number; h: number } | null {
  if (!spPr) return null
  const xfrm = firstTag(spPr, 'a:xfrm')
  if (!xfrm) return null
  const off = firstTag(xfrm, 'a:off')
  const ext = firstTag(xfrm, 'a:ext')
  if (!off || !ext) return null
  const [x, y] = tx.pt(num(off, 'x'), num(off, 'y'))
  return { x, y, w: num(ext, 'cx') * tx.sx, h: num(ext, 'cy') * tx.sy }
}

function placeholderType(sp: Element): string | undefined {
  const ph = firstTag(sp, 'p:ph')
  return ph ? attr(ph, 'type') ?? 'body' : undefined
}

/** Walk a spTree / group, collecting text + picture shapes (EMU → stage px). */
function collectShapes(container: Element, tx: TX, sx: number, sy: number, media: Map<string, string>, rels: Map<string, Rel>): Shape[] {
  const out: Shape[] = []
  const scale = (r: { x: number; y: number; w: number; h: number } | null, ph?: string) => {
    if (r) return { x: Math.round(r.x * sx), y: Math.round(r.y * sy), w: Math.round(r.w * sx), h: Math.round(r.h * sy) }
    // Placeholder with no slide-level geometry (inherits from layout) — use a
    // sensible default content box so the slide still classifies/renders.
    return ph === 'title' || ph === 'ctrTitle'
      ? { x: 70, y: 54, w: STAGE_W - 140, h: 150 }
      : { x: 70, y: 210, w: STAGE_W - 140, h: STAGE_H - 280 }
  }
  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType !== 1) continue
    const node = child as Element
    const tag = node.tagName
    if (tag === 'p:sp') {
      const ph = placeholderType(node)
      const txBody = firstTag(node, 'p:txBody')
      const paras = txBody ? paragraphs(txBody) : []
      const plain = paras.map((p) => p.md).join(' ').replace(/\*\*|\*|<\/?u>/g, '').trim()
      const r = scale(worldRect(firstTag(node, 'p:spPr'), tx), ph)
      out.push({ kind: 'text', ph, paras, plain, ...r })
    } else if (tag === 'p:pic') {
      const blip = firstTag(node, 'a:blip')
      const embed = attr(blip, 'r:embed')
      const rel = embed ? rels.get(embed) : undefined
      const src = rel ? media.get(rel.target) : undefined
      if (!src) continue // unrenderable (emf/wmf) or missing — skip
      const r = scale(worldRect(firstTag(node, 'p:spPr'), tx))
      out.push({ kind: 'pic', src, ...r })
    } else if (tag === 'p:grpSp') {
      out.push(...collectShapes(node, childTx(tx, firstTag(node, 'p:grpSpPr')), sx, sy, media, rels))
    }
    // p:graphicFrame (tables/charts/SmartArt) — skipped in v1
  }
  return out
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path)
  return f ? f.async('string') : null
}
function parseRels(xml: string | null, base: string, P: (xml: string) => Document): Map<string, Rel> {
  const map = new Map<string, Rel>()
  if (!xml) return map
  for (const r of tags(P(xml), 'Relationship')) {
    const id = attr(r, 'Id')
    const target = attr(r, 'Target')
    const type = attr(r, 'Type') ?? ''
    if (id && target) map.set(id, { type, target: target.startsWith('/') ? target.slice(1) : resolvePath(base, target) })
  }
  return map
}

function notesText(xml: string | null, P: (xml: string) => Document): string {
  if (!xml) return ''
  const doc = P(xml)
  // The notes body is the placeholder of type "body"; fall back to all text.
  const lines: string[] = []
  for (const p of tags(doc, 'a:p')) {
    const t = tags(p, 'a:t').map((n) => n.textContent ?? '').join('')
    if (t.trim()) lines.push(t.trim())
  }
  return lines.join('\n')
}

export async function importPptx(data: ArrayBuffer | Uint8Array, fileName = 'deck', parser?: DOMParser): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(data)
  const P = (xml: string) => parseXml(xml, parser)

  // media: target path → data URL
  const media = new Map<string, string>()
  await Promise.all(
    Object.keys(zip.files)
      .filter((p) => p.startsWith('ppt/media/'))
      .map(async (p) => {
        const ext = (p.split('.').pop() ?? '').toLowerCase()
        const mime = MIME[ext]
        if (!mime) return // skip emf/wmf/tiff etc.
        const b64 = await zip.file(p)!.async('base64')
        media.set(p, `data:${mime};base64,${b64}`)
      }),
  )

  const presXmlStr = (await readText(zip, 'ppt/presentation.xml')) ?? ''
  const pres = P(presXmlStr)
  const sldSz = firstTag(pres, 'p:sldSz')
  const cx = num(sldSz, 'cx', 9144000)
  const cy = num(sldSz, 'cy', 5143500)
  const sx = STAGE_W / cx
  const sy = STAGE_H / cy
  const ptToPx = STAGE_W / ((cx / 914400) * 72)

  const presRels = parseRels(await readText(zip, 'ppt/_rels/presentation.xml.rels'), 'ppt', P)
  const order = tags(firstTag(pres, 'p:sldIdLst')!, 'p:sldId')
    .map((e) => attr(e, 'r:id'))
    .map((rid) => (rid ? presRels.get(rid)?.target : undefined))
    .filter((p): p is string => !!p)

  const slides: Slide[] = []
  for (let i = 0; i < order.length; i++) {
    const path = order[i]
    const xml = await readText(zip, path)
    if (!xml) continue
    const doc = P(xml)
    const rels = parseRels(await readText(zip, relsPathFor(path)), dirname(path), P)
    const notesRel = [...rels.values()].find((r) => r.type.endsWith('/notesSlide'))
    const notes = notesRel ? notesText(await readText(zip, notesRel.target), P) : ''
    const spTree = firstTag(doc, 'p:spTree')
    const shapes = spTree ? collectShapes(spTree, IDENTITY, sx, sy, media, rels) : []
    slides.push(classifySlide(shapes, { index: i, ptToPx, notes }))
  }

  const core = await readText(zip, 'docProps/core.xml')
  const title = core ? firstTag(P(core), 'dc:title')?.textContent?.trim() : ''
  const name = title || fileName.replace(/\.pptx$/i, '') || 'Imported deck'

  return { deck: { config: { ...defaultConfig(), deck: name }, slides }, name }
}
