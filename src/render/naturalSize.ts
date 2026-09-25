// A shared, reactive cache of images' natural sizes, keyed by src. Asking for
// an unknown size starts loading it and returns undefined; when it arrives the
// cache updates and any computed that asked re-runs. So a gallery can lay out
// by its pictures' shapes (frames that hug the picture, the best column count)
// and the Review panel can judge picture sizes — all from one load per image.
// FramedImage feeds sizes it measures anyway, so most arrive for free.

import { reactive } from 'vue'

export interface NaturalSize {
  w: number
  h: number
}

const sizes = reactive(new Map<string, NaturalSize>())
const requested = new Set<string>()

/** Record a size measured elsewhere (FramedImage reads it on load). */
export function rememberNaturalSize(src: string | undefined, w: number, h: number) {
  if (src && w > 0 && h > 0) {
    const known = sizes.get(src)
    if (!known || known.w !== w || known.h !== h) sizes.set(src, { w, h })
  }
}

/** The natural size of `src` if known; otherwise starts loading it once and
 *  returns undefined. Reactive: a computed calling this re-runs on arrival. */
export function naturalSize(src: string | undefined): NaturalSize | undefined {
  if (!src) return undefined
  const known = sizes.get(src)
  if (known) return known
  if (!requested.has(src) && typeof Image !== 'undefined') {
    requested.add(src)
    const img = new Image()
    img.onload = () => rememberNaturalSize(src, img.naturalWidth, img.naturalHeight)
    img.src = src
  }
  return undefined
}

/** Every size known so far — for code that must not trigger loads. */
export function knownNaturalSizes(): ReadonlyMap<string, NaturalSize> {
  return sizes
}
