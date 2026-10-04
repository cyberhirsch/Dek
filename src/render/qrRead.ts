// Read the link from a QR code in a picture. Chrome's built-in barcode reader
// doesn't exist on Windows, so this uses jsQR (Apache-2.0), loaded only when a
// picture is actually scanned. Only web links count: a QR code holding text,
// Wi-Fi details or a phone number is ignored.
import { safeLink } from './qr'

/** Longest side the picture is scanned at; a QR code in a corner of a large
 *  photo needs the second, sharper pass. */
const PASSES = [1600, 3200]

async function bitmapOf(src: string): Promise<ImageBitmap | null> {
  try {
    const blob = await (await fetch(src)).blob()
    return await createImageBitmap(blob)
  } catch {
    return null
  }
}

/** The web link in a QR code somewhere in these RGBA pixels, if any. */
export async function linkFromPixels(data: Uint8ClampedArray, w: number, h: number): Promise<string | undefined> {
  const { default: jsQR } = await import('jsqr')
  const hit = jsQR(data, w, h, { inversionAttempts: 'attemptBoth' })
  return hit?.data ? safeLink(hit.data.trim()) : undefined
}

export async function readQrLink(src: string): Promise<string | undefined> {
  const bmp = await bitmapOf(src)
  if (!bmp) return undefined
  try {
    const long = Math.max(bmp.width, bmp.height)
    for (const max of PASSES) {
      const k = Math.min(1, max / long)
      const w = Math.max(1, Math.round(bmp.width * k))
      const h = Math.max(1, Math.round(bmp.height * k))
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return undefined
      // A white ground, so a transparent PNG's code reads as dark-on-light.
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bmp, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      const link = await linkFromPixels(data, w, h)
      if (link) return link
      if (k === 1) break // already at full size: a sharper pass can't help
    }
    return undefined
  } finally {
    bmp.close()
  }
}
