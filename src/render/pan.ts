// Pan bounds for a framed image.
//
// A picture is centred in its frame, sized by `object-fit`, then scaled and
// translated by the editor's focus. Panning is only meaningful where the
// picture actually OVERFLOWS its frame — that hidden overflow is the only
// thing a drag has to reveal. Without a limit the drag keeps going past the
// picture's own edge and pulls it off the frame: background shows on one side
// while the picture runs out the other, which reads as the image being cropped
// even though nothing was cropped at all.
//
// The maximum offset per axis is half that overflow: at the limit one edge of
// the picture sits exactly on the matching edge of the frame.

export interface PanBounds {
  x: number
  y: number
}

export function panBounds(
  natural: { w: number; h: number },
  frame: { w: number; h: number },
  fit: 'cover' | 'contain',
  scale: number,
): PanBounds {
  const { w: iw, h: ih } = natural
  const { w, h } = frame
  // Before the image loads (or in a zero-sized frame) there's nothing to
  // measure — no overflow can be proven, so allow no pan rather than guess.
  if (!(iw > 0 && ih > 0 && w > 0 && h > 0)) return { x: 0, y: 0 }
  // `object-fit` picks the ratio that makes the picture cover (max) or sit
  // inside (min) the frame; the focus scale multiplies it.
  const fitRatio = fit === 'contain' ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih)
  const s = fitRatio * (scale > 0 ? scale : 1)
  return {
    x: Math.max(0, (iw * s - w) / 2),
    y: Math.max(0, (ih * s - h) / 2),
  }
}

/**
 * The furthest a picture may be zoomed out: the scale at which the WHOLE
 * picture fits the frame. For `contain` that is the fit itself (1). For
 * `cover` it is below 1 — cover crops whatever doesn't match the frame's
 * shape, and a floor of 1 left that crop out of reach: no zoom or pan could
 * ever show it. Going further than whole-picture only shrinks it into a
 * smaller box, which reveals nothing, so that is the floor.
 */
export function minScale(natural: { w: number; h: number }, frame: { w: number; h: number }, fit: 'cover' | 'contain'): number {
  const { w: iw, h: ih } = natural
  const { w, h } = frame
  if (fit === 'contain' || !(iw > 0 && ih > 0 && w > 0 && h > 0)) return 1
  return Math.min(w / iw, h / ih) / Math.max(w / iw, h / ih)
}

/** Clamp one axis of a pan offset into `[-max, max]`. `|| 0` normalises the
 *  `-0` that falls out of clamping a negative offset to a zero bound (and any
 *  NaN from a corrupt stored focus) so the emitted transform stays clean. */
export function clampPan(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value)) || 0
}

export interface Placement {
  /** The visible part of the picture, in the frame's coordinate space. */
  x: number
  y: number
  w: number
  h: number
  /** How much of the source is cut from each side, as fractions (0..1) — the
   *  shape of OOXML's `srcRect`. */
  crop: { l: number; t: number; r: number; b: number }
}

/**
 * Exactly what `FramedImage` shows, as a rectangle plus a source crop: the
 * picture fitted by `object-fit`, centred, then zoomed about the frame's centre
 * and panned (pan clamped as on screen), then clipped to the frame. Lets an
 * exporter that can only place a cropped picture — PowerPoint — reproduce
 * cover, contain, pan and zoom without distorting anything. Null when there's
 * nothing visible to place.
 */
export function placePicture(
  natural: { w: number; h: number },
  frame: { w: number; h: number },
  fit: 'cover' | 'contain',
  focus?: { x?: number; y?: number; scale?: number },
): Placement | null {
  const { w: iw, h: ih } = natural
  const { w: fw, h: fh } = frame
  if (!(iw > 0 && ih > 0 && fw > 0 && fh > 0)) return null
  const k = fit === 'contain' ? Math.min(fw / iw, fh / ih) : Math.max(fw / iw, fh / ih)
  const s = focus?.scale && focus.scale > 0 ? focus.scale : 1
  const b = panBounds(natural, frame, fit, s)
  const tx = clampPan(focus?.x ?? 0, b.x)
  const ty = clampPan(focus?.y ?? 0, b.y)
  // The fitted picture, centred, before the transform…
  const dw = iw * k
  const dh = ih * k
  const cx = fw / 2
  const cy = fh / 2
  // …after zooming about the centre and panning.
  const x0 = cx + s * (-dw / 2) + tx
  const y0 = cy + s * (-dh / 2) + ty
  const x1 = cx + s * (dw / 2) + tx
  const y1 = cy + s * (dh / 2) + ty
  // Clip to the frame.
  const vx0 = Math.max(0, x0)
  const vy0 = Math.max(0, y0)
  const vx1 = Math.min(fw, x1)
  const vy1 = Math.min(fh, y1)
  if (vx1 <= vx0 || vy1 <= vy0) return null
  const spanX = x1 - x0
  const spanY = y1 - y0
  return {
    x: vx0,
    y: vy0,
    w: vx1 - vx0,
    h: vy1 - vy0,
    crop: { l: (vx0 - x0) / spanX, t: (vy0 - y0) / spanY, r: (x1 - vx1) / spanX, b: (y1 - vy1) / spanY },
  }
}
