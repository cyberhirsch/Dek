// Parse a video URL (YouTube / Vimeo / direct file) into an embeddable form.

export interface ParsedVideo {
  provider: 'youtube' | 'vimeo' | 'file' | 'other'
  id?: string
  embedUrl: string
  thumb?: string
  /** Playback window in whole seconds, read from the URL: `t=` / `start=` and
   *  `end=` (YouTube), `#t=` (Vimeo). Lets a slide play one segment of a long
   *  video instead of the lecturer scrubbing live. */
  start?: number
  end?: number
}

/** `130`, `130s`, `2m10s`, `1h2m10s` → seconds. Anything else → undefined. */
export function parseTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const v = value.trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(v)) return Math.floor(Number(v))
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/** Read `t` / `start` / `end` from the query string and the `#t=` fragment. */
function timeWindow(url: string): { start?: number; end?: number } {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return {}
  }
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''))
  const start = parseTimestamp(u.searchParams.get('start') ?? u.searchParams.get('t') ?? hash.get('t'))
  const end = parseTimestamp(u.searchParams.get('end'))
  return {
    ...(start ? { start } : {}),
    ...(end && (!start || end > start) ? { end } : {}),
  }
}

export function parseVideo(url?: string): ParsedVideo | null {
  if (!url) return null
  let m: RegExpMatchArray | null

  // watch?v= anywhere in the query (…?t=45&v=ID too), embed/, shorts/, live/, youtu.be/
  if ((m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/))) {
    const id = m[1]
    const { start, end } = timeWindow(url)
    const params = [start ? `start=${start}` : '', end ? `end=${end}` : ''].filter(Boolean).join('&')
    return {
      provider: 'youtube',
      id,
      embedUrl: `https://www.youtube.com/embed/${id}${params ? `?${params}` : ''}`,
      thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
    }
  }
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
    const id = m[1]
    // Vimeo's player takes a start time as a fragment; it has no end parameter.
    const { start } = timeWindow(url)
    return {
      provider: 'vimeo',
      id,
      embedUrl: `https://player.vimeo.com/video/${id}${start ? `#t=${start}s` : ''}`,
      ...(start ? { start } : {}),
    }
  }
  if (/\.(mp4|webm|ogg)(\?.*)?(#.*)?$/i.test(url)) {
    // A media fragment (`clip.mp4#t=30,95`) is honoured by <video> itself.
    return { provider: 'file', embedUrl: url }
  }
  return { provider: 'other', embedUrl: url }
}

export function autoplaySrc(p: ParsedVideo): string {
  // enablejsapi lets Dek pause/resume it from the keyboard (render/videoControl.ts).
  const extra = p.provider === 'youtube' ? 'autoplay=1&rel=0&enablejsapi=1' : p.provider === 'vimeo' ? 'autoplay=1' : ''
  if (!extra) return p.embedUrl
  // Query parameters go before any #fragment (Vimeo's #t= start time).
  const [base, frag] = p.embedUrl.split('#')
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}${extra}${frag ? `#${frag}` : ''}`
}
