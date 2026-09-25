// Natural pixel size of an image, read from its file header. Pure — no DOM,
// no decoding — so the PPTX exporter can place pictures correctly in any
// environment (and the node test suite can check it).
//
// Covers PNG, JPEG, GIF, WebP (lossy, lossless, extended), BMP and SVG. Returns
// null for anything unrecognised; callers then fall back to the old behaviour.

export interface Size {
  w: number
  h: number
}

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '')
  if (typeof atob === 'function') {
    const bin = atob(clean)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }
  return new Uint8Array(Buffer.from(clean, 'base64'))
}

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
const le32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))

const ok = (w: number, h: number): Size | null => (w > 0 && h > 0 ? { w, h } : null)

export function imageSize(data: string | Uint8Array): Size | null {
  const b = typeof data === 'string' ? fromBase64(data) : data
  if (b.length < 10) return null

  // PNG: signature, then the IHDR chunk's width/height.
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b.length >= 24) return ok(be32(b, 16), be32(b, 20))

  // GIF: logical screen size, little-endian.
  if (ascii(b, 0, 3) === 'GIF') return ok(le16(b, 6), le16(b, 8))

  // BMP: DIB header; height may be negative (top-down).
  if (ascii(b, 0, 2) === 'BM' && b.length >= 26) return ok(le32(b, 18), Math.abs(le32(b, 22) | 0))

  // WebP: RIFF container, three chunk flavours.
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' && b.length >= 16) {
    const chunk = ascii(b, 12, 4)
    if (chunk === 'VP8 ' && b.length >= 30) return ok(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff)
    if (chunk === 'VP8L' && b.length >= 25) {
      const bits = le32(b, 21)
      return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
    }
    if (chunk === 'VP8X' && b.length >= 30) return ok(le24(b, 24) + 1, le24(b, 27) + 1)
    return null
  }

  // JPEG: walk the segments to the first start-of-frame marker. EXIF blocks
  // can come first and be large, so this scans rather than assuming an offset.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]
      // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC), which aren't frames.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return ok(be16(b, i + 7), be16(b, i + 5))
      }
      i += 2 + be16(b, i + 2)
    }
    return null
  }

  // SVG: explicit width/height in px, else the viewBox.
  const head = new TextDecoder().decode(b.subarray(0, Math.min(b.length, 4096)))
  const svg = /<svg\b[^>]*>/i.exec(head)?.[0]
  if (svg) {
    const num = (attr: string) => {
      const m = new RegExp(`\\b${attr}\\s*=\\s*["']\\s*([\\d.]+)\\s*(px)?\\s*["']`, 'i').exec(svg)
      return m ? Number(m[1]) : NaN
    }
    const w = num('width')
    const h = num('height')
    if (w > 0 && h > 0) return { w, h }
    const vb = /\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(svg)
    if (vb) return ok(Number(vb[1]), Number(vb[2]))
  }
  return null
}
