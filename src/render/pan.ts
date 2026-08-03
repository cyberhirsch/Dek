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

/** Clamp one axis of a pan offset into `[-max, max]`. `|| 0` normalises the
 *  `-0` that falls out of clamping a negative offset to a zero bound (and any
 *  NaN from a corrupt stored focus) so the emitted transform stays clean. */
export function clampPan(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value)) || 0
}
