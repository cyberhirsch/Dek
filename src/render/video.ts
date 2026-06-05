// Parse a video URL (YouTube / Vimeo / direct file) into an embeddable form.

export interface ParsedVideo {
  provider: 'youtube' | 'vimeo' | 'file' | 'other'
  id?: string
  embedUrl: string
  thumb?: string
}

export function parseVideo(url?: string): ParsedVideo | null {
  if (!url) return null
  let m: RegExpMatchArray | null

  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/))) {
    const id = m[1]
    return {
      provider: 'youtube',
      id,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      thumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    }
  }
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
    const id = m[1]
    return { provider: 'vimeo', id, embedUrl: `https://player.vimeo.com/video/${id}` }
  }
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) {
    return { provider: 'file', embedUrl: url }
  }
  return { provider: 'other', embedUrl: url }
}

export function autoplaySrc(p: ParsedVideo): string {
  const sep = p.embedUrl.includes('?') ? '&' : '?'
  if (p.provider === 'youtube') return `${p.embedUrl}${sep}autoplay=1&rel=0`
  if (p.provider === 'vimeo') return `${p.embedUrl}${sep}autoplay=1`
  return p.embedUrl
}
