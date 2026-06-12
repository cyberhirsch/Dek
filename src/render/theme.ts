import type { DeckConfig } from '../core/types'
import { DEFAULT_THEME } from '../tokens'

/** Maps deck theme config to the CSS custom properties slides consume.
 *  Unset fields fall back to the default theme tokens (src/tokens). */
export function themeVars(config: DeckConfig): Record<string, string> {
  const t = config.theme ?? {}
  const d = DEFAULT_THEME
  return {
    '--dek-bg': t.bg ?? d.color.bg,
    '--dek-text': t.text ?? d.color.text,
    '--dek-accent': t.accent ?? d.color.accent,
    '--dek-accent2': t.accent2 ?? d.color.accent2,
    '--dek-font-heading': `'${t.fontHeading ?? d.font.heading}', ${d.font.headingFallback}`,
    '--dek-font-body': `'${t.fontBody ?? d.font.body}', ${d.font.bodyFallback}`,
  }
}
