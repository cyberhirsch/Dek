// Element creation defaults, derived from the design tokens (src/tokens).
// Anything that creates a canvas element — the toolbar tools, drag-and-drop,
// bake-to-freeform — draws from here so "what a new box looks like" is defined
// exactly once and follows the theme.
import { BASE, DEFAULT_THEME, withAlpha } from '../tokens'

/** A fresh shape box: transparent fill, thin translucent-accent stroke, themed
 *  corner radius. */
export const BOX_DEFAULTS = {
  fill: 'transparent',
  stroke: withAlpha(DEFAULT_THEME.color.accent, BASE.element.box.strokeAlpha),
  strokeWidth: BASE.element.box.strokeWidth,
  radius: BASE.radius.element,
} as const

/** A fresh text box: invisible chrome, body type at the standard canvas size. */
export const TEXT_DEFAULTS = {
  fill: 'transparent',
  stroke: 'transparent',
  font: 'body',
  size: BASE.type.roles.textBox,
} as const

/** A fresh arrow: thin, in the theme's text color. */
export const ARROW_DEFAULTS = {
  stroke: DEFAULT_THEME.color.text,
  strokeWidth: BASE.element.arrow.strokeWidth,
} as const

/** The font-size steps the UI walks through (top bar stepper). */
export const TYPE_SCALE: readonly number[] = BASE.type.scale
