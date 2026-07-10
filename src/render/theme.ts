import type { DeckConfig } from '../core/types'
import { DEFAULT_THEME, withAlpha } from '../tokens'

/** Maps deck theme config to the CSS custom properties slides consume.
 *  Unset fields fall back to the default theme tokens (src/tokens). */
export function themeVars(config: DeckConfig): Record<string, string> {
  const t = config.theme ?? {}
  const d = DEFAULT_THEME
  const text = t.text ?? d.color.text
  const accent = t.accent ?? d.color.accent
  return {
    '--dek-bg': t.bg ?? d.color.bg,
    '--dek-text': text,
    '--dek-accent': accent,
    '--dek-accent2': t.accent2 ?? d.color.accent2,
    '--dek-font-heading': `'${t.fontHeading ?? d.font.heading}', ${d.font.headingFallback}`,
    '--dek-font-body': `'${t.fontBody ?? d.font.body}', ${d.font.bodyFallback}`,
    // Derived from *this theme's* text/accent so secondary content adapts instead
    // of hardcoding the dark theme's off-white (which vanished on a light bg).
    // Three tiers keep the hierarchy legible in both directions:
    '--dek-dim': withAlpha(text, 0.72), //   prominent secondary: captions, cite, byline, role
    '--dek-faint': withAlpha(text, 0.55), // chrome: header, footer, page number, labels (≥3:1 on light)
    '--dek-line': withAlpha(text, 0.14), //  hairline borders and frames
    // Links wear the accent, not the browser's blue/purple. Visited is the same
    // accent, just calmer — so a clicked link reads as "seen" without shouting.
    '--dek-link': accent,
    '--dek-link-visited': withAlpha(accent, 0.72),
  }
}
