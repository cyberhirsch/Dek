// Slides on the system clipboard, as Dek's own text: the same YAML blocks a
// deck file is made of, under a marker line. Being plain text, it crosses
// tabs, windows and decks — and also pastes into a text editor or an LLM
// chat, and back from one.
//
// Pictures travel inside the text as data: URLs (storage/slideTransfer.ts),
// because an `Assets/…` path means nothing in another deck's folder.
import type { Slide } from './types'
import { parseDeck, stringifyBlock } from './deck'

/** First line of copied slides. A YAML comment, so the text is still a valid
 *  deck fragment wherever it's pasted. */
export const SLIDES_MARKER = '# Dek slides'

export function slidesToText(slides: Slide[]): string {
  return [SLIDES_MARKER, ...slides.map((s) => '---\n' + stringifyBlock(s))].join('\n') + '\n'
}

/**
 * Slides from clipboard text, or null when the text isn't slides — so an
 * ordinary paste of a sentence never turns into a slide. Accepted: text Dek
 * copied (the marker), a whole deck file (its slides; the config block is
 * dropped), or bare slide blocks, e.g. from an LLM — each needs a `layout:`.
 */
export function slidesFromText(text: string): Slide[] | null {
  const t = text.replace(/^﻿/, '').trim()
  if (!t || !/^\s*layout\s*:/m.test(t)) return null
  let slides: Slide[]
  try {
    slides = parseDeck(t).slides
  } catch {
    return null
  }
  if (!slides.length || !slides.every((s) => typeof s.layout === 'string' && s.layout)) return null
  return slides
}
