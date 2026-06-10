// PDF → Dek deck (browser-native, via pdf.js). A PDF carries no editable layout
// structure, so each page is rendered onto a 16:9 canvas (letterboxed on the deck
// background) and becomes a full-bleed image slide; the page's text is kept as
// speaker notes. Faithful and works for any PDF — edit further in Dek if wanted.
import type { Slide } from '../core/types'
import { defaultConfig } from '../core/deck'
import type { ImportResult } from './pptx'

const OUT_W = 1600
const OUT_H = 900 // 16:9, matches the stage ratio so the page never crops
const BG = '#070809'

export async function importPdf(
  data: ArrayBuffer | Uint8Array,
  fileName = 'deck',
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  // Lazy: pdf.js is heavy, only pulled in when a PDF is actually imported.
  const pdfjs = (await import('pdfjs-dist')) as typeof import('pdfjs-dist')
  const workerUrl = ((await import('pdfjs-dist/build/pdf.worker.min.mjs?url')) as { default: string }).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const doc = await pdfjs.getDocument({ data }).promise
  const canvas = document.createElement('canvas')
  canvas.width = OUT_W
  canvas.height = OUT_H
  const ctx = canvas.getContext('2d')!

  const slides: Slide[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(OUT_W / base.width, OUT_H / base.height)
    const vp = page.getViewport({ scale })
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, OUT_W, OUT_H)
    const offsetX = Math.round((OUT_W - vp.width) / 2)
    const offsetY = Math.round((OUT_H - vp.height) / 2)
    await page.render({ canvas, canvasContext: ctx, viewport: page.getViewport({ scale, offsetX, offsetY }) }).promise
    const image = canvas.toDataURL('image/jpeg', 0.82)

    let text = ''
    try {
      const tc = await page.getTextContent()
      text = tc.items
        .map((it) => ('str' in it ? it.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    } catch {
      /* page without a text layer */
    }
    const slide: Slide = { layout: 'image-full', image, title: '', caption: '', focus: { x: 0, y: 0, scale: 1 } }
    if (text) slide.notes = text
    slides.push(slide)
    onProgress?.(i, doc.numPages)
    page.cleanup()
  }

  const name = fileName.replace(/\.pdf$/i, '') || 'Imported PDF'
  return { deck: { config: { ...defaultConfig(), deck: name }, slides }, name }
}
