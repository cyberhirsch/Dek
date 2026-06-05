// Dek core types — the shared schema for code / LLM / WYSIWYG editing paths.

export type LayoutId =
  | 'cover'
  | 'section'
  | 'statement'
  | 'speaker'
  | 'bullets'
  | 'bullets-image'
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
  'bullets',
  'bullets-image',
  'image-full',
  'image-caption',
  'video-embed',
  'gallery',
  'diagram',
  'freeform',
]

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
  // lists
  items?: Array<string | GalleryItem>
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
