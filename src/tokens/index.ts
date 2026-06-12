// Design tokens — the single source of truth for Dek's visual numbers.
//
// `base.tokens.json` holds everything theme-independent (stage geometry, padding,
// radii, the type scale and role sizes, element stroke defaults). The
// `theme.*.tokens.json` files hold what a theme may change (colors, fonts, glow).
//
// The JSON is imported directly (resolveJsonModule), so TypeScript derives exact
// types from the files themselves — a misspelled token name is a compile error,
// with no codegen step. A theme file is a *preset*: `themePreset()` turns one
// into the `DeckConfig.theme` fields stored per deck, so switching themes stays
// a deck-level setting and existing decks are unaffected.
import type { DeckTheme } from '../core/types'
import base from './base.tokens.json'
import themeDefault from './theme.default.tokens.json'
import themeLight from './theme.light.tokens.json'

export const BASE = base

export const THEMES = {
  default: themeDefault,
  light: themeLight,
} as const
export type ThemeId = keyof typeof THEMES
export type ThemeTokens = (typeof THEMES)[ThemeId]

/** The theme every deck starts from (and the fallback for unset fields). */
export const DEFAULT_THEME = themeDefault

/** `#rrggbb` → `rgba(r,g,b,a)` for derived translucent colors (e.g. the default
 *  box stroke = accent at strokeAlpha). */
export function withAlpha(hex: string, alpha: number): string {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** The per-deck `theme:` config block a token theme populates. */
export function themePreset(id: ThemeId): DeckTheme {
  const t = THEMES[id]
  return {
    bg: t.color.bg,
    text: t.color.text,
    accent: t.color.accent,
    accent2: t.color.accent2,
    fontHeading: t.font.heading,
    fontBody: t.font.body,
    glow: t.glow,
  }
}
