// PDF → Dek deck (browser-native, via pdf.js). Like the PPTX importer, this pulls
// the *real content* out of each page — text runs (clustered into blocks) and
// embedded raster images (with their on-page position) — reduces them to the
// shared shape model, and runs the same hybrid classifier. No page screenshots.
import type { Slide } from '../core/types'
import { defaultConfig } from '../core/deck'
import { classifySlide } from './classify'
import { STAGE_W, STAGE_H, type Shape, type TextShape, type PicShape, type Para } from './ooxml'
import type { ImportResult } from './pptx'

type Mat = [number, number, number, number, number, number]
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]

// ── text: cluster pdf.js text runs into blocks (≈ PyMuPDF "blocks") ──
interface Run { str: string; x: number; base: number; size: number; w: number }
interface Line { runs: Run[]; base: number; size: number; x0: number; x1: number; text: string }

const BULLET = /^\s*([•▪◦‣·∙●○*]|\d+[.)])\s+/

function joinRuns(runs: Run[]): string {
  runs.sort((a, b) => a.x - b.x)
  let out = ''
  let prevEnd = -Infinity
  for (const r of runs) {
    if (out && r.x - prevEnd > r.size * 0.25 && !/\s$/.test(out)) out += ' '
    out += r.str
    prevEnd = r.x + r.w
  }
  return out.replace(/\s+/g, ' ').trim()
}

function extractText(items: Array<{ str?: string; transform?: number[]; width?: number }>, pageW: number, pageH: number, sx: number, sy: number): TextShape[] {
  const runs: Run[] = []
  for (const it of items) {
    if (!it.str || !it.str.trim() || !it.transform) continue
    const t = it.transform
    const size = Math.hypot(t[1], t[3]) || Math.abs(t[3]) || 12
    runs.push({ str: it.str, x: t[4], base: t[5], size, w: it.width ?? 0 })
  }
  // top → bottom (larger baseline = higher on the page), then left → right
  runs.sort((a, b) => b.base - a.base || a.x - b.x)

  const lines: Line[] = []
  for (const r of runs) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.base - r.base) <= Math.max(last.size, r.size) * 0.4) {
      last.runs.push(r)
      last.size = Math.max(last.size, r.size)
      last.x0 = Math.min(last.x0, r.x)
      last.x1 = Math.max(last.x1, r.x + r.w)
    } else {
      lines.push({ runs: [r], base: r.base, size: r.size, x0: r.x, x1: r.x + r.w, text: '' })
    }
  }
  for (const l of lines) l.text = joinRuns(l.runs)

  // group vertically-close, horizontally-overlapping lines into blocks
  interface Block { lines: Line[]; x0: number; x1: number; topBase: number; botBase: number; size: number }
  const blocks: Block[] = []
  for (const l of lines) {
    if (!l.text) continue
    const last = blocks[blocks.length - 1]
    const gap = last ? last.botBase - l.base : Infinity
    const overlap = last && !(l.x1 < last.x0 - 5 || l.x0 > last.x1 + 5)
    if (last && gap >= 0 && gap < Math.max(last.size, l.size) * 1.9 && overlap) {
      last.lines.push(l)
      last.botBase = l.base
      last.x0 = Math.min(last.x0, l.x0)
      last.x1 = Math.max(last.x1, l.x1)
      last.size = Math.max(last.size, l.size)
    } else {
      blocks.push({ lines: [l], x0: l.x0, x1: l.x1, topBase: l.base, botBase: l.base, size: l.size })
    }
  }

  return blocks.map((b) => {
    const centered = Math.abs((b.x0 + b.x1) / 2 - pageW / 2) < pageW * 0.08 && b.x1 - b.x0 < pageW * 0.85
    const paras: Para[] = b.lines.map((l) => {
      const bullet = BULLET.test(l.text)
      return { md: l.text.replace(BULLET, ''), bullet, level: 0, align: centered ? 'center' : undefined, sizePt: Math.round(l.size) }
    })
    const top = pageH - b.topBase - b.size
    const bottom = pageH - b.botBase
    return {
      kind: 'text',
      x: Math.round(b.x0 * sx),
      y: Math.round(top * sy),
      w: Math.round((b.x1 - b.x0) * sx),
      h: Math.round(Math.max(b.size, bottom - top) * sy),
      paras,
      plain: paras.map((p) => p.md).join(' '),
    }
  })
}

// ── images: walk the operator list tracking the CTM, pull each painted XObject ──
const IMG_KIND_RGBA = 3
const IMG_KIND_RGB = 2

function objToDataUrl(obj: { width?: number; height?: number; kind?: number; data?: Uint8ClampedArray | Uint8Array; bitmap?: CanvasImageSource }): string | null {
  const w = obj.width ?? 0
  const h = obj.height ?? 0
  if (!w || !h) return null
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  if (obj.bitmap) {
    ctx.drawImage(obj.bitmap, 0, 0)
  } else if (obj.data) {
    const img = ctx.createImageData(w, h)
    const src = obj.data
    if (obj.kind === IMG_KIND_RGBA && src.length >= w * h * 4) {
      img.data.set(src.subarray(0, w * h * 4))
    } else if (obj.kind === IMG_KIND_RGB || src.length >= w * h * 3) {
      for (let i = 0, j = 0; i < w * h; i++) {
        img.data[j++] = src[i * 3]
        img.data[j++] = src[i * 3 + 1]
        img.data[j++] = src[i * 3 + 2]
        img.data[j++] = 255
      }
    } else {
      return null // grayscale-1bpp / unsupported packing — skip
    }
    ctx.putImageData(img, 0, 0)
  } else {
    return null
  }
  // JPEG keeps photos small; PNG would balloon a 354-slide deck.
  return canvas.toDataURL('image/jpeg', 0.85)
}

type ImgObj = { width?: number; height?: number; kind?: number; data?: Uint8ClampedArray; bitmap?: CanvasImageSource }
interface PdfPageLike {
  objs: { get(id: string): unknown; has?(id: string): boolean }
  getViewport(o: { scale: number }): { width: number; height: number }
  render(o: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> }
}
function readObj(page: PdfPageLike, id: string): ImgObj | null {
  try {
    if (page.objs.has && !page.objs.has(id)) return null
    return (page.objs.get(id) as ImgObj) ?? null
  } catch {
    return null
  }
}

async function extractImages(
  page: { getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }> } & PdfPageLike,
  OPS: Record<string, number>,
  transform: (a: Mat, b: Mat) => Mat,
  pageH: number,
  sx: number,
  sy: number,
  canvas: HTMLCanvasElement,
): Promise<PicShape[]> {
  // pdf.js only decodes image XObjects during render — but in this setup the
  // render promise never resolves (the decode still happens as a side effect). So
  // we kick off a render, read the op list, wait just until the images appear in
  // page.objs, then cancel the stuck render. Pages without images cancel instantly.
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(canvas.width / base.width, canvas.height / base.height)
  const cctx = canvas.getContext('2d')!
  const task = page.render({ canvas, canvasContext: cctx, viewport: page.getViewport({ scale }) })
  task.promise.catch(() => {}) // we cancel it ourselves; swallow the rejection

  let ctm: Mat = [1, 0, 0, 1, 0, 0]
  const stack: Mat[] = []
  const hits: Array<{ id: string; m: Mat }> = []
  try {
    const opl = await page.getOperatorList()
    for (let i = 0; i < opl.fnArray.length; i++) {
      const fn = opl.fnArray[i]
      const args = opl.argsArray[i]
      if (fn === OPS.save) stack.push(ctm)
      else if (fn === OPS.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      else if (fn === OPS.transform) ctm = transform(ctm, args as Mat)
      else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
        const id = args[0] as string
        if (typeof id === 'string') hits.push({ id, m: ctm })
      }
    }
  } catch {
    /* op list failed — no images */
  }

  if (hits.length) {
    // wait until the painted images have decoded into page.objs (poll, capped)
    const ids = [...new Set(hits.map((h) => h.id))]
    const deadline = performance.now() + 4000
    const ready = (id: string) => {
      try {
        return page.objs.has ? page.objs.has(id) : true
      } catch {
        return false
      }
    }
    while (performance.now() < deadline && !ids.every(ready)) await new Promise((r) => setTimeout(r, 25))
  }
  try {
    ;(task as unknown as { cancel?: () => void }).cancel?.()
  } catch {
    /* ignore */
  }

  const pics: PicShape[] = []
  for (const hit of hits) {
    const obj = readObj(page, hit.id)
    if (!obj) continue
    const src = objToDataUrl(obj)
    if (!src) continue
    const corners = [apply(hit.m, 0, 0), apply(hit.m, 1, 0), apply(hit.m, 1, 1), apply(hit.m, 0, 1)]
    const xs = corners.map((c) => c[0])
    const ys = corners.map((c) => c[1])
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const y0 = Math.min(...ys)
    const y1 = Math.max(...ys)
    const w = x1 - x0
    const h = y1 - y0
    if (w < 12 || h < 12) continue // skip tiny rules/icons
    pics.push({ kind: 'pic', src, x: Math.round(x0 * sx), y: Math.round((pageH - y1) * sy), w: Math.round(w * sx), h: Math.round(h * sy) })
  }
  return pics
}

export async function importPdf(
  data: ArrayBuffer | Uint8Array,
  fileName = 'deck',
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const pdfjs = (await import('pdfjs-dist')) as typeof import('pdfjs-dist')
  const workerUrl = ((await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as { default: string }).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const OPS = pdfjs.OPS as unknown as Record<string, number>
  const transform = (a: Mat, b: Mat): Mat => pdfjs.Util.transform(a, b) as Mat

  const doc = await pdfjs.getDocument({ data }).promise
  const decodeCanvas = document.createElement('canvas')
  decodeCanvas.width = 1280
  decodeCanvas.height = 720
  const slides: Slide[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    const pageW = vp.width
    const pageH = vp.height
    const sx = STAGE_W / pageW
    const sy = STAGE_H / pageH
    const ptToPx = STAGE_W / pageW

    // Images first: pdf.js render (which decodes images) misbehaves if a text
    // request was already issued for the page, so do the render-decode up front.
    const pics = await extractImages(page as never, OPS, transform, pageH, sx, sy, decodeCanvas)
    const tc = await page.getTextContent()
    const texts = extractText(tc.items as Array<{ str?: string; transform?: number[]; width?: number }>, pageW, pageH, sx, sy)
    const shapes: Shape[] = [...texts, ...pics]

    slides.push(classifySlide(shapes, { index: i - 1, ptToPx }))
    onProgress?.(i, doc.numPages)
    page.cleanup()
  }

  const name = fileName.replace(/\.pdf$/i, '') || 'Imported PDF'
  return { deck: { config: { ...defaultConfig(), deck: name }, slides }, name }
}
