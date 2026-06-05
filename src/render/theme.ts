import type { DeckConfig } from '../core/types'

/** Maps deck theme config to the CSS custom properties slides consume. */
export function themeVars(config: DeckConfig): Record<string, string> {
  const t = config.theme ?? {}
  return {
    '--dek-bg': t.bg ?? '#070809',
    '--dek-text': t.text ?? '#e6ecf2',
    '--dek-accent': t.accent ?? '#7fc7ff',
    '--dek-accent2': t.accent2 ?? '#ffb474',
    '--dek-font-heading': `'${t.fontHeading ?? 'Cormorant Garamond'}', serif`,
    '--dek-font-body': `'${t.fontBody ?? 'JetBrains Mono'}', monospace`,
  }
}
