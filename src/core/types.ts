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
  | 'table'
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
  'table',
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
  /** Makes the cell clickable in present/export (http(s)/mailto only). */
  link?: string
}

export interface TextItem {
  text: string
  /** Defaults to true for legacy string items. */
  bullet?: boolean
}

/** A table cell that needs more than plain text — an image, a link, a merge.
 *  Image wins if both `text` and `image` are set, matching how image-caption
 *  and gallery already treat "image present → show image". */
export interface TableCell {
  text?: string
  image?: string
  /** Makes the cell clickable in present/export (http(s)/mailto only). */
  link?: string
  /** How many columns/rows this cell spans from its own position. Default 1.
   *  The positions it covers are stored as `null`. */
  colspan?: number
  rowspan?: number
}

/** One stored cell. The common case — plain text or a number — stays a bare
 *  scalar so `deck.md` reads as a table (`- [Maya, 42]`); an object carries
 *  anything more; `null` marks a position covered by another cell's merge. */
export type TableCellValue = string | number | TableCell | null

/**
 * A table's data — the ONE shape shared by the `table` layout (`slide.table`)
 * and the `table` canvas element (`element.table`). Keeping a single object
 * means bake/unbake is a copy, and every table feature is built once.
 */
export interface TableData {
  /** Row-major grid. Rows may differ in length; the widest row sets the
   *  column count and shorter rows read as blank-padded. */
  rows: TableCellValue[][]
  /** Fractions of the grid's width/height, summing to 1; omitted ⇒ uniform. */
  colWidths?: number[]
  rowHeights?: number[]
  /** Cell typography: a 'heading'/'body' theme token (or a literal family),
   *  and the *base* size cell text shrinks below to fit, never above. */
  font?: string
  size?: number
  /** The first row names the columns: styled as a header in the grid, and
   *  skipped as data by the chart views. */
  header?: boolean
  /** How the data is shown. The rows stay the source of truth either way —
   *  switching view never changes them. Default `table`. */
  view?: TableView
}

export type TableView = 'table' | 'pie'

// ── Free-positioned canvas elements ──────────────────────────────────────────
// Any slide may carry an `elements` array: movable / rotatable objects drawn on
// top of the layout, Google-Slides style. Coordinates are in the 1280×720 stage
// space (top-left origin) so they scale with the slide. The moment a slide is
// edited freely (an element added or moved), its `layout` flips to `freeform`.

export type ElementType = 'box' | 'arrow' | 'image' | 'video' | 'diagram' | 'table'

/** The active canvas tool. 'text', 'rect' and 'image' all create a `box`. */
export type CanvasTool = 'select' | 'text' | 'rect' | 'arrow' | 'image'

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

/**
 * A box: the one object behind both "text boxes" and "shapes". A rectangle is a
 * box with a fill/stroke and no text; a text box is a box with transparent
 * fill/stroke and `content`. Both can have both.
 */
export interface BoxElement extends ElementBase {
  type: 'box'
  // shape
  fill?: string
  stroke?: string
  strokeWidth?: number
  /** Corner radius in px. */
  radius?: number
  // image (optional): a box may carry a picture, shown behind any text and
  // clipped to the box (so an "image" is just a box with a src). Add/replace via
  // the toolbar; coexists with fill/stroke/radius/content.
  src?: string
  fit?: 'cover' | 'contain'
  focus?: Focus
  /** CSS-filter-style image adjustments, independently toggleable. */
  invert?: boolean
  desaturate?: boolean
  /** A URL rendered as a QR code filling the box. The *link* is stored, never a
   *  generated image, so `deck.md` stays readable and editing the URL redraws
   *  the code (the same contract as `diagram`'s Mermaid `code`). */
  qr?: string
  /** Makes the box clickable while presenting. Only `http(s)`/`mailto` are
   *  followed; clicks never navigate while editing. */
  link?: string
  // text (optional). Inline Markdown: **bold**, *italic*, <u>underline</u>, `code`.
  content?: string
  /** Font family, or the tokens 'heading' / 'body' (resolve to the theme fonts). */
  font?: string
  /** Font size in stage px. */
  size?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  valign?: 'top' | 'middle' | 'bottom'
  /** Numeric font weight (e.g. 300 for the light heading look). When set it wins
   *  over `bold`, except `bold: true` always forces 700 so the B button works. */
  weight?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** Line-height multiplier (default 1.25). Baking sets the layout CSS values
   *  (1.05 headings, 1.45 body) so conversion keeps the rendered look. */
  lineHeight?: number
  /** Gap between content lines in em (default 0.4). Baked lists use ~0.7 to
   *  match the layouts' 18px list gap. */
  lineGap?: number
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

export interface VideoElement extends ElementBase {
  type: 'video'
  /** Video URL (YouTube / Vimeo / direct file). */
  video: string
  poster?: string
}

export interface DiagramElement extends ElementBase {
  type: 'diagram'
  /** Mermaid source. */
  code: string
}

/**
 * A table as a single canvas object, so the `table` layout can bake to freeform
 * and un-bake back without the grid collapsing into loose text/image boxes.
 * Mirrors the `table` layout's own fields (flat row-major `cells`, fractional
 * track sizes) — one data shape, one renderer (`TableGrid.vue`), used by both.
 */
export interface TableElement extends ElementBase {
  type: 'table'
  table: TableData
}

export type SlideElement = BoxElement | ArrowElement | ImageElement | VideoElement | DiagramElement | TableElement

/** A partial patch of an element's style fields (everything except `type`). */
export type ElementPatch = Partial<
  Omit<BoxElement, 'type'> &
    Omit<ArrowElement, 'type'> &
    Omit<ImageElement, 'type'> &
    Omit<VideoElement, 'type'> &
    Omit<DiagramElement, 'type'> &
    Omit<TableElement, 'type'>
>

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
  /** `text` / `text-image`: reveal the content rows one at a time while
   *  presenting (arrow / space / swipe steps through them). Off by default. */
  steps?: boolean
  // lists
  items?: Array<string | TextItem | GalleryItem>
  portraits?: string[]
  // image-ish
  image?: string
  // video-embed: a video URL (YouTube/Vimeo/file) + optional poster still
  video?: string
  poster?: string
  /** video-embed framing. `framed` (the default) centres a bordered 16:9 frame
   *  with room for a caption; `full` bleeds the video to the slide edges. The
   *  stage is itself 16:9, so both are 16:9 — `full` just has no margin. */
  videoFit?: 'framed' | 'full'
  side?: 'left' | 'right'
  /** text-image: aspect ratio of the image frame. */
  imageRatio?: '16:9' | '1:1' | '9:16'
  /** How the image sits in its frame: `cover` fills and crops overflow (the
   *  default for text-image / image-full), `contain` shows the whole image
   *  letterboxed (the default for image-caption). */
  imageFit?: 'cover' | 'contain'
  /** Makes the layout image (`image` field) clickable in present/export — the
   *  layout counterpart of a freeform box's `link`. `http(s)`/`mailto` only. */
  imageLink?: string
  /** CSS-filter-style adjustments for the layout image, independently
   *  toggleable — the layout counterpart of a freeform box's `invert`/`desaturate`. */
  imageInvert?: boolean
  imageDesaturate?: boolean
  captionPos?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  columns?: number | 'auto'
  focus?: Focus
  /** table: the grid itself — the same object a `table` canvas element carries. */
  table?: TableData
  // diagram: Mermaid source
  code?: string
  // freeform
  body?: string
  /** Free-positioned canvas elements drawn over the layout. */
  elements?: SlideElement[]
  /** Content kept but NOT rendered by the current layout — preserved verbatim so
   *  switching layouts is reversible (the "Map + keep hidden" policy). Holds
   *  inactive slot fields (e.g. a `cite` while in a text layout) and, under
   *  `elements`, canvas objects with no slot in this layout. Never rendered. */
  stash?: Partial<Slide>
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
  /** Which built-in preset (src/tokens) these values came from, so the UI can
   *  show the active choice. Free-edited themes simply have no preset id. */
  preset?: string
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
