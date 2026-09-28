// Pictures travelling with copied slides.
//
// In a deck, a slide points at its pictures by an address only that deck (and
// that tab) understands: an `Assets/…` path, a server path, or a `blob:` URL
// from the folder backend. Copy replaces each with the picture itself, as a
// data: URL; paste saves each back into the TARGET deck's Assets folder and
// points the slide there. Web addresses (http/https) stay as they are.
import type { Slide } from '../core/types'
import { mapSlideAssetRefs } from './assets'

const remote = (ref: string) => /^(https?:)?\/\//i.test(ref)

/** A data: URL can carry the picture's file name as a parameter
 *  (`data:image/png;name=vase.png;base64,…`, RFC 2397), so a pasted picture
 *  lands in Assets under its own name instead of "image". */
function withName(dataUrl: string, name: string | undefined): string {
  if (!name) return dataUrl
  return dataUrl.replace(/^data:([^;,]+)/, (_, type) => `data:${type};name=${encodeURIComponent(name)}`)
}
export function nameOfDataUrl(dataUrl: string): string | undefined {
  const m = /^data:[^,]*?;name=([^;,]+)/.exec(dataUrl)
  return m ? decodeURIComponent(m[1]) : undefined
}

function baseName(ref: string): string | undefined {
  if (/^(blob|data):/i.test(ref)) return undefined
  const last = ref.split(/[?#]/)[0].split('/').pop()
  return last && /\.[a-z0-9]+$/i.test(last) ? decodeURIComponent(last) : undefined
}

async function toDataUrl(ref: string): Promise<string | undefined> {
  try {
    const res = await fetch(ref)
    if (!res.ok) return undefined
    const blob = await res.blob()
    const data = await new Promise<string>((ok, fail) => {
      const fr = new FileReader()
      fr.onload = () => ok(fr.result as string)
      fr.onerror = () => fail(fr.error)
      fr.readAsDataURL(blob)
    })
    return withName(data, baseName(ref))
  } catch {
    return undefined
  }
}

/** Apply an async per-reference mapping to every picture a slide holds
 *  (fields, gallery, tables, canvas, stash — whatever mapSlideAssetRefs walks). */
async function mapRefs(slides: Slide[], fn: (ref: string) => Promise<string | undefined>): Promise<Slide[]> {
  const refs = new Set<string>()
  for (const s of slides)
    mapSlideAssetRefs(s, (r) => {
      if (r) refs.add(r)
      return r
    })
  const out = new Map<string, string>()
  await Promise.all(
    [...refs].map(async (r) => {
      const v = await fn(r)
      if (v !== undefined) out.set(r, v)
    }),
  )
  return slides.map((s) => mapSlideAssetRefs(s, (r) => out.get(r) ?? r))
}

/** For copying: every deck-local picture replaced by its data: URL. A picture
 *  that can't be read keeps its old reference (and will show as missing). */
export function inlineSlidePictures(slides: Slide[]): Promise<Slide[]> {
  return mapRefs(slides, async (r) => (remote(r) || /^data:/i.test(r) ? undefined : toDataUrl(r)))
}

/** For pasting: every data: URL saved as a file in this deck via `upload`
 *  (the deck's own upload path), the slide pointed at the saved file. */
export function storeSlidePictures(
  slides: Slide[],
  upload: (fileName: string, dataUrl: string) => Promise<string>,
): Promise<Slide[]> {
  return mapRefs(slides, async (r) => {
    if (!/^data:image\//i.test(r)) return undefined
    const type = /^data:image\/([\w.+-]+)/i.exec(r)?.[1] ?? 'png'
    const ext = type === 'jpeg' ? 'jpg' : type === 'svg+xml' ? 'svg' : type
    // The name parameter is ours; backends expect a plain data URL.
    return upload(nameOfDataUrl(r) ?? `pasted.${ext}`, r.replace(/;name=[^;,]+/, ''))
  })
}
