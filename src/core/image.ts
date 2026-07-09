// Client-side image downscaling for uploads. Runs before an image ever reaches
// the storage backend, so `Assets/` never accumulates untouched camera-resolution
// photos. Anything already small enough passes through untouched.
const MAX_DIM = 2560
const SIZE_CAP = 1.5 * 1024 * 1024 // 1.5 MB
const JPEG_QUALITY = 0.85

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Read a file as a data URL, downscaling/re-encoding it first if it's larger
 *  than {@link MAX_DIM}px or {@link SIZE_CAP} bytes. SVGs and GIFs (animation)
 *  pass through untouched — canvas re-encoding would flatten or break them. */
export async function fileToOptimizedDataUrl(file: File): Promise<string> {
  const raw = await fileToDataUrl(file)
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return raw
  }
  if (file.size <= SIZE_CAP) {
    const probe = await loadImage(raw)
    if (probe.width <= MAX_DIM && probe.height <= MAX_DIM) return raw
  }

  const img = await loadImage(raw)
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return raw
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const isPng = file.type === 'image/png'
  const optimized = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', JPEG_QUALITY)
  // A resize can still lose to the original on already-compressed source images
  // (e.g. a small PNG icon) — keep whichever is smaller.
  return optimized.length < raw.length ? optimized : raw
}
