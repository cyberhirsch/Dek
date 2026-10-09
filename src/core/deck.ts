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
import { emptyTable, tableFromLegacy } from './table'

const SEP = /^---[ \t]*$/m

function splitBlocks(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return text
    .split(SEP)
    .map((b) => b.replace(/^\n+/, '').replace(/\n+$/, ''))
    .filter((b) => b.length > 0)
}

/** Parse one `---` block, tagging any YAML error with which block failed so a
 *  malformed deck reports e.g. "slide 12: bad indentation…" instead of a bare,
 *  position-less YAML exception. */
function parseBlock(block: string, label: string): unknown {
  try {
    return YAML.parse(block) ?? {}
  } catch (e) {
    const detail = (e as Error).message?.split('\n')[0] ?? String(e)
    throw new Error(`${label}: ${detail}`)
  }
}

export function parseDeck(raw: string): Deck {
  const blocks = splitBlocks(raw)
  if (blocks.length === 0) {
    return { config: defaultConfig(), slides: [] }
  }

  // Heuristic: the first block is config UNLESS it already declares a layout
  // (lets a deck omit the global block entirely).
  const first = parseBlock(blocks[0], 'deck config')
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
    const obj = parseBlock(b, `slide ${i + 1}`) as Slide
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
    // Migrate the flat pre-`table` fields into the one shared `table` object.
    migrateLegacyTable(obj)
    // Migrate legacy element types (text/rect → box, flat table → `table`).
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
  // A canvas table saved before the shared `table` object: `rows`/`cols` were
  // counts and `cells` a flat list. Only migrate when `table` is absent, so an
  // already-migrated element is never touched twice.
  if (t === 'table' && !('table' in el)) {
    const { rows, cols, cells, colWidths, rowHeights, font, size, ...rest } = el as unknown as Record<string, unknown>
    return {
      ...rest,
      table: tableFromLegacy({
        rows: rows as number | undefined,
        cols: cols as number | undefined,
        cells,
        colWidths: colWidths as number[] | undefined,
        rowHeights: rowHeights as number[] | undefined,
        font: font as string | undefined,
        size: size as number | undefined,
      }),
    } as SlideElement
  }
  return el
}

const LEGACY_TABLE_FIELDS = ['tableRows', 'tableCols', 'tableCells', 'tableColWidths', 'tableRowHeights', 'tableFont', 'tableSize']

/** Fold the old flat `table*` layout fields into `slide.table`. They may also
 *  sit in `stash` (a table slide switched to another layout under the old
 *  format), so that is migrated too — otherwise switching back would
 *  resurrect the old fields. */
function migrateLegacyTable(obj: Record<string, unknown>) {
  const fold = (o: Record<string, unknown>) => {
    if (!LEGACY_TABLE_FIELDS.some((k) => k in o)) return
    if (!o.table) {
      o.table = tableFromLegacy({
        rows: o.tableRows as number | undefined,
        cols: o.tableCols as number | undefined,
        cells: o.tableCells,
        colWidths: o.tableColWidths as number[] | undefined,
        rowHeights: o.tableRowHeights as number[] | undefined,
        font: o.tableFont as string | undefined,
        size: o.tableSize as number | undefined,
      })
    }
    for (const k of LEGACY_TABLE_FIELDS) delete o[k]
  }
  fold(obj)
  if (obj.stash && typeof obj.stash === 'object') fold(obj.stash as Record<string, unknown>)
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

const yamlOpts = { lineWidth: 0, indent: 2, flowCollectionPadding: false } as const

/** Stringify one block, writing each table row on a single line
 *  (`- [Maya, 42]`) so a table reads as a table in deck.md. Everything else
 *  keeps block style. A row is recognised structurally — an item of the `rows`
 *  sequence inside a `table` map — wherever that sits (slide, stash, element). */
export function stringifyBlock(value: unknown): string {
  const doc = new YAML.Document(value)
  YAML.visit(doc, {
    Pair(_key, pair, path) {
      if (!YAML.isScalar(pair.key) || pair.key.value !== 'rows' || !YAML.isSeq(pair.value)) return
      const owner = path[path.length - 2]
      if (!YAML.isPair(owner) || !YAML.isScalar(owner.key) || owner.key.value !== 'table') return
      for (const row of pair.value.items) if (YAML.isSeq(row)) row.flow = true
    },
  })
  return doc.toString(yamlOpts).trimEnd()
}

export function serializeDeck(deck: Deck): string {
  const parts: string[] = []
  parts.push('---\n' + stringifyBlock(deck.config))
  for (const slide of deck.slides) {
    parts.push('---\n' + stringifyBlock(slide))
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
      preset: 'default',
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
      return { layout, title: 'Heading', content: '- First point' }
    case 'text-image':
      return { layout, title: 'Heading', side: 'left', image: '', content: '- First point' }
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
    case 'table':
      return { layout, title: '', table: { ...emptyTable(3, 3), header: true } }
    case 'poll':
      return { layout, title: 'Your question?', poll: { kind: 'choice', options: ['Yes', 'No'] } }
    case 'freeform':
      return { layout, elements: [] }
  }
}
