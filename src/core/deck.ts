// Dek format parser + serializer.
//
// A `.md` deck is a stream of `---`-delimited YAML blocks:
//   - the FIRST block is the global deck config (deck/theme/header/…)
//   - every following block is one slide (`layout:` + that layout's fields)
//
// Freeform HTML lives inside a `body: |` block scalar so every block is pure
// YAML and the round-trip stays lossless and predictable.

import YAML from 'yaml'
import type { Deck, DeckConfig, Slide, LayoutId } from './types'
import { LAYOUT_IDS } from './types'

const SEP = /^---[ \t]*$/m

function splitBlocks(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return text
    .split(SEP)
    .map((b) => b.replace(/^\n+/, '').replace(/\n+$/, ''))
    .filter((b) => b.length > 0)
}

export function parseDeck(raw: string): Deck {
  const blocks = splitBlocks(raw)
  if (blocks.length === 0) {
    return { config: defaultConfig(), slides: [] }
  }

  // Heuristic: the first block is config UNLESS it already declares a layout
  // (lets a deck omit the global block entirely).
  const first = YAML.parse(blocks[0]) ?? {}
  let config: DeckConfig
  let slideBlocks: string[]
  if (first && typeof first === 'object' && 'layout' in first) {
    config = defaultConfig()
    slideBlocks = blocks
  } else {
    config = { ...defaultConfig(), ...(first as DeckConfig) }
    slideBlocks = blocks.slice(1)
  }

  const slides: Slide[] = slideBlocks.map((b, i) => {
    const obj = (YAML.parse(b) ?? {}) as Slide
    if (!obj.layout) obj.layout = 'freeform'
    if (!LAYOUT_IDS.includes(obj.layout as LayoutId)) {
      console.warn(`[dek] slide ${i + 1}: unknown layout "${obj.layout}"`)
    }
    return obj
  })

  return { config, slides }
}

const yamlOpts = { lineWidth: 0, indent: 2 } as const

export function serializeDeck(deck: Deck): string {
  const parts: string[] = []
  parts.push('---\n' + YAML.stringify(deck.config, yamlOpts).trimEnd())
  for (const slide of deck.slides) {
    parts.push('---\n' + YAML.stringify(slide, yamlOpts).trimEnd())
  }
  return parts.join('\n') + '\n'
}

export function defaultConfig(): DeckConfig {
  return {
    ratio: '16:9',
    paginate: true,
    theme: {
      bg: '#070809',
      text: '#e6ecf2',
      accent: '#7fc7ff',
      accent2: '#ffb474',
      glow: true,
      fontHeading: 'Cormorant Garamond',
      fontBody: 'JetBrains Mono',
    },
  }
}

export function blankSlide(layout: LayoutId = 'bullets'): Slide {
  switch (layout) {
    case 'cover':
      return { layout, title: 'Title', subtitle: '' }
    case 'section':
      return { layout, title: 'Section' }
    case 'statement':
      return { layout, text: 'A bold statement.' }
    case 'speaker':
      return { layout, name: 'Name', role: 'Role', portraits: [] }
    case 'bullets':
      return { layout, title: 'HEADING', items: ['First point'] }
    case 'bullets-image':
      return { layout, title: 'HEADING', side: 'left', image: '', items: ['First point'] }
    case 'image-full':
      return { layout, image: '', title: '', caption: '', focus: { x: 0, y: 0, scale: 1 } }
    case 'image-caption':
      return { layout, image: '', caption: '', captionPos: 'bottom-right', focus: { x: 0, y: 0, scale: 1 } }
    case 'video-embed':
      return { layout, video: '', poster: '', caption: '' }
    case 'gallery':
      return { layout, title: '', columns: 'auto', items: [] }
    case 'diagram':
      return { layout, title: '', code: 'flowchart LR\n  A[Start] --> B[Step]\n  B --> C[End]' }
    case 'freeform':
      return { layout, title: '', body: '<div></div>' }
  }
}
