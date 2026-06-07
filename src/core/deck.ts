// Dek format parser + serializer.
//
// A `.md` deck is a stream of `---`-delimited YAML blocks:
//   - the FIRST block is the global deck config (deck/theme/header/…)
//   - every following block is one slide (`layout:` + that layout's fields)
//
// Freeform HTML lives inside a `body: |` block scalar so every block is pure
// YAML and the round-trip stays lossless and predictable.

import YAML from 'yaml'
import type { Deck, DeckConfig, Slide, LayoutId, TextItem, SlideElement } from './types'
import { LAYOUT_IDS, LAYOUT_ALIASES } from './types'

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
    // Migrate old layout names (bullets → text, …) so older decks still load.
    const alias = LAYOUT_ALIASES[obj.layout as string]
    if (alias) obj.layout = alias
    if (!LAYOUT_IDS.includes(obj.layout as LayoutId)) {
      console.warn(`[dek] slide ${i + 1}: unknown layout "${obj.layout}"`)
    }
    // Migrate legacy `items` lists into a Markdown `content` block.
    if (obj.content == null && Array.isArray(obj.items) && isTextItemList(obj.items)) {
      obj.content = itemsToContent(obj.items as Array<string | TextItem>)
      delete obj.items
    }
    // Migrate legacy element types (text/rect → box).
    if (Array.isArray(obj.elements)) obj.elements = obj.elements.map(normalizeElement)
    return obj
  })

  return { config, slides }
}

/** Old element types fold into the unified `box`: `text`/`rect` were already
 *  boxes; `image` becomes a box carrying a `src` (transparent fill/stroke) so a
 *  box is the single model for shapes, text, and pictures. */
function normalizeElement(el: SlideElement): SlideElement {
  const t = (el as { type?: string }).type
  if (t === 'text' || t === 'rect') return { ...el, type: 'box' } as SlideElement
  if (t === 'image') {
    return { fill: 'transparent', stroke: 'transparent', ...el, type: 'box' } as SlideElement
  }
  return el
}

/** True when an `items` array is a text list (not a gallery of {image}). */
function isTextItemList(items: Slide['items']): boolean {
  return !!items && items.every((it) => typeof it === 'string' || (!!it && typeof it === 'object' && 'text' in it))
}

/** Render a legacy text `items` array as a Markdown `content` block:
 *  bullets get `- `, plain paragraphs ({ bullet: false }) are bare lines. */
export function itemsToContent(items: Array<string | TextItem>): string {
  return items
    .map((it) => {
      if (typeof it === 'string') return `- ${it}`
      return it.bullet === false ? it.text : `- ${it.text}`
    })
    .join('\n')
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

/** A brand-new deck: default theme/config and a single empty cover slide. */
export function emptyDeck(name?: string): Deck {
  return {
    config: { ...defaultConfig(), deck: name || 'Untitled' },
    slides: [{ layout: 'cover', title: '', subtitle: '' }],
  }
}

export function blankSlide(layout: LayoutId = 'text'): Slide {
  switch (layout) {
    case 'cover':
      return { layout, title: 'Title', subtitle: '' }
    case 'section':
      return { layout, title: 'Section' }
    case 'statement':
      return { layout, text: 'A bold statement.' }
    case 'speaker':
      return { layout, name: 'Name', role: 'Role', portraits: [] }
    case 'text':
      return { layout, title: 'HEADING', content: '- First point' }
    case 'text-image':
      return { layout, title: 'HEADING', side: 'left', image: '', content: '- First point' }
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
      return { layout, elements: [] }
  }
}
