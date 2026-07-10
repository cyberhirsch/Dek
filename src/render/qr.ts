// QR codes for canvas boxes.
//
// A box stores the *URL* (`qr: "https://…"`), never a generated image. The code
// is drawn at render time, exactly as a `diagram` slide stores Mermaid source
// rather than an SVG. That keeps `deck.md` small and readable — you and any LLM
// can see and edit the link — and changing the URL can't orphan an asset.
//
// The encoder is loaded on demand so it stays out of the initial bundle.

/** The QR module grid: `true` = a dark cell. Row-major, always square. */
export type QrMatrix = boolean[][]

type Ecl = 'L' | 'M' | 'Q' | 'H'

let libPromise: Promise<typeof import('qrcode-generator')> | null = null
function loadQr() {
  // Never memoize a rejection — a failed chunk fetch would otherwise break every
  // QR box for the rest of the session (same reasoning as MermaidDiagram).
  libPromise ??= import('qrcode-generator').then(
    (m) => (m as unknown as { default: typeof import('qrcode-generator') }).default ?? m,
    (e) => {
      libPromise = null
      throw e
    },
  )
  return libPromise
}

/**
 * Encode `text` into a module matrix.
 *
 * Error correction defaults to 'M' (~15% recoverable). On a projected slide the
 * code is photographed off a screen at an angle, so the extra redundancy of 'Q'
 * or 'H' rarely helps as much as simply drawing the code larger — and it costs
 * modules, which makes each one smaller. 'M' is the right trade for slides.
 */
export async function qrMatrix(text: string, ecl: Ecl = 'M'): Promise<QrMatrix> {
  const qrcode = await loadQr()
  const qr = qrcode(0, ecl) // 0 = pick the smallest version that fits
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  const out: QrMatrix = []
  for (let r = 0; r < n; r++) {
    const row: boolean[] = []
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c))
    out.push(row)
  }
  return out
}

/** The quiet zone the QR spec requires around the symbol, in modules. Without it
 *  scanners fail against a busy slide background. */
export const QUIET_ZONE = 4

export interface QrPath {
  /** `0 0 size size`, where size = modules + 2 × quiet zone. */
  viewBox: string
  /** A single `<path>` `d` covering every dark module. */
  d: string
  size: number
}

/**
 * Flatten a matrix into one SVG path. Runs of horizontal dark modules merge into
 * a single rectangle, which cuts the path length several-fold on a typical URL —
 * worth it because this string ends up inline in the DOM of every thumbnail.
 */
export function matrixToPath(m: QrMatrix, quiet = QUIET_ZONE): QrPath {
  const n = m.length
  const size = n + quiet * 2
  const parts: string[] = []
  for (let r = 0; r < n; r++) {
    const cols = m[r].length
    let c = 0
    while (c < cols) {
      if (!m[r][c]) {
        c += 1
        continue
      }
      let run = 1
      while (c + run < cols && m[r][c + run]) run += 1
      parts.push(`M${c + quiet} ${r + quiet}h${run}v1h-${run}z`)
      c += run
    }
  }
  return { viewBox: `0 0 ${size} ${size}`, d: parts.join(''), size }
}

/** Encode `text` and return a ready-to-inline `<svg>`. `dark`/`light` are CSS
 *  colors; the light square is the quiet zone and must stay opaque, or a busy
 *  slide behind the code defeats the scanner. */
export async function qrSvg(text: string, dark = '#000000', light = '#ffffff'): Promise<string> {
  const { viewBox, d, size } = matrixToPath(await qrMatrix(text))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" shape-rendering="crispEdges" ` +
    `width="100%" height="100%" preserveAspectRatio="xMidYMid meet">` +
    `<rect width="${size}" height="${size}" fill="${light}"/>` +
    `<path d="${d}" fill="${dark}"/>` +
    `</svg>`
  )
}

/** A `data:` URL of the code as SVG — for exports that need an image source
 *  (PPTX) rather than inline markup. */
export async function qrDataUrl(text: string, dark?: string, light?: string): Promise<string> {
  const svg = await qrSvg(text, dark, light)
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

/**
 * Rasterise the code to a PNG data URL. PowerPoint's support for SVG images is
 * unreliable, so the .pptx exporter needs pixels. Browser-only (canvas).
 */
export async function qrPngDataUrl(text: string, size = 640, dark?: string, light?: string): Promise<string> {
  const svgUrl = await qrDataUrl(text, dark, light)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = svgUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return svgUrl
  ctx.imageSmoothingEnabled = false // keep module edges hard, or scanners struggle
  ctx.drawImage(img, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

/** Only `http(s)` and `mailto` links are ever followed or emitted, so deck
 *  content can't smuggle `javascript:` into a click handler. Mirrors the policy
 *  `render/inline.ts` applies to inline Markdown links. */
export function safeLink(url: string | undefined): string | undefined {
  if (!url) return undefined
  return /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : undefined
}

/** The URL a drag carried, if it looks like one we can use. Browsers expose a
 *  dragged link as `text/uri-list`; dragging selected text or a URL from the
 *  address bar only yields `text/plain`. */
export function urlFromDataTransfer(dt: DataTransfer | null): string | undefined {
  if (!dt) return undefined
  const raw = dt.getData('text/uri-list') || dt.getData('text/plain')
  if (!raw) return undefined
  // `text/uri-list` may carry several lines, `#`-prefixed ones being comments.
  const first = raw.split(/[\r\n]+/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
  return safeLink(first)
}
