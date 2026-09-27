// Pictures dropped from another browser window.
//
// Dragging a picture out of a web page rarely hands over a file. Chrome and
// Firefox offer the picture's address instead — as `text/html` (an <img> tag)
// and `text/uri-list`, where the uri-list is the surrounding LINK when the
// picture sits inside one (a thumbnail linking to an article). So the <img>
// in the HTML is the picture; the uri-list is only a fallback.
//
// Dek stores pictures as files next to the deck, so the address is fetched
// and turned into a File, which then goes through the same upload path as a
// file dropped from disk. A site that refuses cross-origin reads (no CORS
// header) can't be fetched from a web page at all; the caller says so rather
// than hotlinking a URL that export and offline presenting can't use.

/** What a drop carried, read synchronously — DataTransfer is emptied once the
 *  drop handler returns, so this must run before any `await`. */
export interface DroppedImage {
  file?: File
  url?: string
}

/** The first <img>'s source in dragged HTML, resolved against `base`. */
export function imageUrlFromHtml(html: string, base?: string): string | undefined {
  const m = /<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(html)
  const raw = m && (m[2] ?? m[3] ?? m[4])
  if (!raw) return undefined
  const src = raw.replace(/&amp;/g, '&').trim()
  try {
    return new URL(src, base).href
  } catch {
    return undefined
  }
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#]|$)/i

export function droppedImage(dt: DataTransfer | null): DroppedImage {
  if (!dt) return {}
  const file = Array.from(dt.files ?? []).find((f) => f.type.startsWith('image/'))
  if (file) return { file }
  const fromHtml = imageUrlFromHtml(dt.getData('text/html'))
  if (fromHtml && /^(https?:|data:image\/)/i.test(fromHtml)) return { url: fromHtml }
  // No <img>: a bare link counts only when it points at a picture file, so a
  // dragged page link is never mistaken for an image.
  const uri = dt
    .getData('text/uri-list')
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'))
  if (uri && (/^data:image\//i.test(uri) || (/^https?:/i.test(uri) && IMAGE_EXT.test(uri)))) return { url: uri }
  return {}
}

const EXT_FOR: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

/** A readable file name for a fetched picture: the URL's last path segment,
 *  with an extension that matches what the server actually sent. */
export function fileNameFor(url: string, type: string): string {
  let stem = 'image'
  if (!/^data:/i.test(url)) {
    try {
      const last = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? '')
      const s = last.replace(/\.[a-z0-9]+$/i, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')
      if (s) stem = s.slice(0, 60)
    } catch {
      /* keep the default */
    }
  }
  return `${stem}.${EXT_FOR[type] ?? 'png'}`
}

/** Fetch a dropped picture's address into a File, or undefined when the site
 *  won't allow it (CORS) or what came back isn't a picture. */
export async function fetchImageFile(url: string): Promise<File | undefined> {
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) return undefined
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return undefined
    return new File([blob], fileNameFor(url, blob.type), { type: blob.type })
  } catch {
    return undefined
  }
}

/** Resolve a drop to a picture file: the file itself, or its address fetched. */
export async function resolveDroppedImage(d: DroppedImage): Promise<File | undefined> {
  if (d.file) return d.file
  if (d.url) return fetchImageFile(d.url)
  return undefined
}

/** The message when a dropped address can't be fetched. Sent as a window
 *  event so any drop target can raise it without threading an emit through
 *  every host component; App shows it as its error toast. */
export const DROP_FAILED_EVENT = 'dek:drop-failed'
export function reportDropFailure(): void {
  window.dispatchEvent(
    new CustomEvent(DROP_FAILED_EVENT, {
      detail:
        "That site doesn't let other pages copy its pictures. Save the picture to disk, then drop the file here.",
    }),
  )
}
