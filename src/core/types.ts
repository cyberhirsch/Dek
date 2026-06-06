// Dek core types — the shared schema for code / LLM / WYSIWYG editing paths.

export type LayoutId =
  | 'cover'
  | 'section'
  | 'statement'
  | 'speaker'
  | 'text'
  | 'text-image'
  | 'image-full'
  | 'image-caption'
  | 'video-embed'
  | 'gallery'
  | 'diagram'
  | 'freeform'

export const LAYOUT_IDS: LayoutId[] = [
  'cover',
  'section',
  'statement',
  'speaker',
  'text',
  'text-image',
  'image-full',
  'image-caption',
  'video-embed',
  'gallery',
  'diagram',
  'freeform',
]

/** Old layout names → current ones, applied on read so older decks still load. */
export const LAYOUT_ALIASES: Record<string, LayoutId> = {
  bullets: 'text',
  'bullets-image': 'text-image',
}

/** Pan/zoom of an image inside its frame, written by the visual editor. */
export interface Focus {
  x: number
  y: number
  scale: number
}

export interface GalleryItem {
  image: string
  label?: string
}

export interface TextItem {
  text: string
  /** Defaults to true for legacy string items. */
  bullet?: boolean
}

// ── Free-positioned canvas elements ──────────────────────────────────────────
// Any slide may carry an `elements` array: movable / rotatable objects drawn on
// top of the layout, Google-Slides style. Coordinates are in the 1280×720 stage
// space (top-left origin) so they scale with the slide. The moment a slide is
// edited freely (an element added or moved), its `layout` flips to `freeform`.

export type ElementType = 'text' | 'rect' | 'arrow' | 'image'

export interface ElementBase {
  type: ElementType
  /** Top-left corner, in 1280×720 stage pixels. */
  x: number
  y: number
  w: number
  h: number
  /** Clockwise degrees about the element's centre. Default 0. */
  rotation?: number
}

export interface TextElement extends ElementBase {
  type: 'text'
  /** Inline Markdown: **bold**, *italic*, <u>underline</u>, `code`. */
  content: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  /** Font size in stage px. */
  size?: number
  color?: string
  bold?: boolean
}

export interface RectElement extends ElementBase {
  type: 'rect'
  fill?: string
  stroke?: string
  strokeWidth?: number
  /** Corner radius in px. */
  radius?: number
}

export interface ArrowElement extends ElementBase {
  type: 'arrow'
  /** Drawn from the box's left-middle to its right-middle, then rotated. */
  stroke?: string
  strokeWidth?: number
}

export interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  focus?: Focus
  fit?: 'cover' | 'contain'
}

export type SlideElement = TextElement | RectElement | ArrowElement | ImageElement

/**
 * A single slide. `layout` selects the renderer; the remaining fields are the
 * named content fields for that layout. Unknown fields are preserved verbatim so
 * round-tripping is lossless even as the schema grows.
 */
export interface Slide {
  layout: LayoutId
  // text-ish
  title?: string
  subtitle?: string
  byline?: string
  text?: string
  cite?: string
  name?: string
  role?: string
  caption?: string
  notes?: string
  /** Body text for `text` / `text-image`: Markdown. Lines starting with `- `
   *  render as bullets; other non-empty lines render as paragraphs. */
  content?: string
  // lists
  items?: Array<string | TextItem | GalleryItem>
  portraits?: string[]
  // image-ish
  image?: string
  // video-embed: a video URL (YouTube/Vimeo/file) + optional poster still
  video?: string
  poster?: string
  side?: 'left' | 'right'
  captionPos?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  columns?: number | 'auto'
  focus?: Focus
  // diagram: Mermaid source
  code?: string
  // freeform
  body?: string
  /** Free-positioned canvas elements drawn over the layout. */
  elements?: SlideElement[]
  // sidebar organization (Keynote-style sections). A group = a maximal run of
  // consecutive slides sharing the same non-empty `group` string.
  group?: string
  // anything else is preserved
  [key: string]: unknown
}

export interface DeckTheme {
  bg?: string
  text?: string
  accent?: string
  accent2?: string
  glow?: boolean
  fontHeading?: string
  fontBody?: string
}

export interface DeckConfig {
  deck?: string
  ratio?: string
  paginate?: boolean
  header?: string
  footer?: string
  theme?: DeckTheme
  [key: string]: unknown
}

export interface Deck {
  config: DeckConfig
  slides: Slide[]
}
