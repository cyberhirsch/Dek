// Optical margin correction for display-size headings.
//
// Browsers align text by its *advance box*, not its visible ink. A capital
// with a diagonal top stroke ("V", "A", "W", "Y") doesn't reach the left edge
// of its box until partway down — so a heading starting with one reads as
// indented next to a straight-stemmed sibling below it (an "E", a "D") even
// though both boxes start at the exact same x-coordinate. Professional type
// systems correct this per style (display vs. body, roman vs. italic) by
// nudging the line a few px so the *ink*, not the box, sits on the margin —
// "optical margin alignment". This measures the actual rendered glyph (in its
// real font/style/size, via canvas TextMetrics) rather than guessing from a
// hand-tuned per-letter table, so it adapts to whatever font, weight, or size
// a heading uses without a lookup table to maintain.

let scratch: CanvasRenderingContext2D | null | undefined

function measurer(): CanvasRenderingContext2D | null {
  if (scratch !== undefined) return scratch
  scratch = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  return scratch
}

/** The first non-whitespace character a line will actually paint, or null for
 *  blank/whitespace-only text. Unicode-aware so an astral character (emoji,
 *  etc.) is measured as one glyph, not a stray surrogate half. */
export function leadingGlyph(text: string): string | null {
  const m = text.match(/\S/u)
  return m ? m[0] : null
}

// However far a correction goes, cap it — a a few percent of the font size is
// a real optical nudge; anything more suggests a font-metrics fluke, not a
// glyph that genuinely reads as indented.
const MAX_SHIFT_RATIO = 0.12

/** Px to shift a line of `text`, rendered in `computedFont` (a CSS font
 *  shorthand, e.g. from `getComputedStyle(el).font`), left so its first
 *  glyph's visible ink — not its advance box — sits at the reference margin.
 *  Returns 0 (no correction) when: there's no canvas to measure with (e.g.
 *  under test, no DOM); the text is blank; or the glyph already sits flush or
 *  overshoots the box (optical alignment lets diagonals/curves/punctuation
 *  hang slightly past the grid — it only pulls back glyphs that look
 *  indented, never pushes flush ones further out). */
export function opticalMarginLeft(text: string, computedFont: string): number {
  const glyph = leadingGlyph(text)
  const ctx = measurer()
  if (!glyph || !ctx || !computedFont) return 0
  ctx.font = computedFont
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const m = ctx.measureText(glyph)
  const overshoot = m.actualBoundingBoxLeft
  if (!Number.isFinite(overshoot) || overshoot >= 0) return 0
  // actualBoundingBoxLeft is negative here: the glyph's ink starts to the
  // right of its box's nominal left edge (the "indented" look). Its own
  // magnitude is exactly the px shift needed to bring that ink back to the
  // margin — use it directly, clamped against the emergency ratio above.
  const sizeMatch = computedFont.match(/(\d+(?:\.\d+)?)px/)
  const size = sizeMatch ? Number(sizeMatch[1]) : 0
  const cap = size ? -size * MAX_SHIFT_RATIO : -Infinity
  return Math.max(overshoot, cap)
}
