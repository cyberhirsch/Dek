import type { Deck, GalleryItem, LayoutId, Slide } from './types'
import { LAYOUT_IDS } from './types'

export type IssueKind = 'schema' | 'asset' | 'review'
export type IssueSeverity = 'error' | 'warning' | 'info'

export interface DeckIssue {
  kind: IssueKind
  severity: IssueSeverity
  slide: number
  field?: string
  message: string
}

export type AssetKind = 'local' | 'remote' | 'data' | 'blob' | 'unknown' | 'orphan'

export interface AssetUse {
  slide: number
  field: string
}

export interface AssetRef {
  ref: string
  kind: AssetKind
  uses: AssetUse[]
  approxBytes?: number
  /** Basename on disk — set for `local` (derived from ref) and `orphan` (the
   *  unreferenced file). Used to match against the folder listing and to delete. */
  filename?: string
}

export interface DeckAnalysis {
  issues: DeckIssue[]
  assets: AssetRef[]
  counts: Record<IssueSeverity, number>
}

type Field =
  | 'title'
  | 'subtitle'
  | 'byline'
  | 'text'
  | 'cite'
  | 'name'
  | 'role'
  | 'caption'
  | 'notes'
  | 'content'
  | 'items'
  | 'portraits'
  | 'image'
  | 'video'
  | 'poster'
  | 'side'
  | 'captionPos'
  | 'columns'
  | 'focus'
  | 'code'
  | 'body'
  | 'group'

interface LayoutRule {
  required?: Field[]
  image?: Field[]
  list?: 'text' | 'gallery'
}

const RULES: Record<LayoutId, LayoutRule> = {
  cover: { required: ['title'] },
  section: { required: ['title'] },
  statement: { required: ['text'] },
  speaker: { required: ['name'], image: ['portraits'] },
  text: { required: ['title', 'content'], list: 'text' },
  'text-image': { required: ['title', 'content', 'image'], image: ['image'], list: 'text' },
  'image-full': { required: ['image'], image: ['image'] },
  'image-caption': { required: ['image'], image: ['image'] },
  'video-embed': { required: ['video'], image: ['poster'] },
  gallery: { required: ['items'], image: ['items'], list: 'gallery' },
  diagram: { required: ['code'] },
  freeform: {},
}

const TEXT_LAYOUTS = new Set<LayoutId>(['cover', 'section', 'statement', 'text', 'text-image'])

function isBlank(v: unknown): boolean {
  if (v == null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

function issue(
  issues: DeckIssue[],
  slide: number,
  severity: IssueSeverity,
  kind: IssueKind,
  message: string,
  field?: string,
) {
  issues.push({ slide, field, severity, kind, message })
}

function isGalleryItem(v: unknown): v is GalleryItem {
  return !!v && typeof v === 'object' && typeof (v as GalleryItem).image === 'string'
}

function validateSlide(slide: Slide, index: number, issues: DeckIssue[]) {
  const n = index + 1
  if (!LAYOUT_IDS.includes(slide.layout)) {
    issue(issues, n, 'error', 'schema', `Unknown layout "${slide.layout}".`, 'layout')
    return
  }

  const rule = RULES[slide.layout]
  for (const field of rule.required ?? []) {
    if (isBlank(slide[field])) issue(issues, n, 'warning', 'schema', `Missing ${field}.`, field)
  }

  if (rule.list === 'text') {
    const lines = typeof slide.content === 'string' ? slide.content.split('\n').filter((l) => l.trim()) : []
    if (typeof slide.content !== 'string' || !lines.length) {
      issue(issues, n, 'warning', 'schema', 'Expected a text content block.', 'content')
    } else if (lines.length > 9) {
      issue(issues, n, 'info', 'review', 'Long content block may need splitting.', 'content')
    }
  }

  if (rule.list === 'gallery') {
    if (!Array.isArray(slide.items)) {
      issue(issues, n, 'warning', 'schema', 'Expected gallery items.', 'items')
    } else {
      const missing = slide.items.filter((it) => typeof it !== 'string' && !isGalleryItem(it)).length
      if (missing) issue(issues, n, 'warning', 'schema', 'Gallery contains items without an image.', 'items')
      if (slide.items.length > 6) issue(issues, n, 'info', 'review', 'Dense gallery may need review.', 'items')
    }
  }

  if (slide.layout === 'freeform') {
    if (!isBlank(slide.body)) {
      issue(issues, n, 'info', 'review', 'Freeform HTML slide should be reviewed.', 'body')
    } else if (!(slide.elements && slide.elements.length)) {
      issue(issues, n, 'info', 'review', 'Empty freeform slide.', 'elements')
    }
  }

  if (TEXT_LAYOUTS.has(slide.layout) && typeof slide.title === 'string' && slide.title.length > 90) {
    issue(issues, n, 'info', 'review', 'Long title may overflow the layout.', 'title')
  }
}

function assetKind(ref: string): AssetKind {
  if (ref.startsWith('data:')) return 'data'
  if (ref.startsWith('blob:')) return 'blob'
  if (/^https?:\/\//i.test(ref)) return 'remote'
  if (ref.trim()) return 'local'
  return 'unknown'
}

function approxDataBytes(ref: string): number | undefined {
  if (!ref.startsWith('data:')) return undefined
  const comma = ref.indexOf(',')
  if (comma < 0) return undefined
  const payload = ref.slice(comma + 1)
  return Math.round((payload.length * 3) / 4)
}

/** The on-disk filename a ref points at (its last path segment), or undefined for
 *  data/blob/empty refs that don't correspond to a file. */
function basename(ref: string): string | undefined {
  const base = ref.split('/').pop()
  return base && !ref.startsWith('data:') && !ref.startsWith('blob:') ? base : undefined
}

function addAsset(map: Map<string, AssetRef>, ref: unknown, slide: number, field: string) {
  if (typeof ref !== 'string' || !ref.trim()) return
  const key = ref
  let rec = map.get(key)
  if (!rec) {
    const kind = assetKind(key)
    rec = { ref: key, kind, uses: [], approxBytes: approxDataBytes(key) }
    if (kind === 'local') rec.filename = basename(key)
    map.set(key, rec)
  }
  rec.uses.push({ slide, field })
}

function collectAssets(slide: Slide, index: number, assets: Map<string, AssetRef>) {
  const n = index + 1
  addAsset(assets, slide.image, n, 'image')
  addAsset(assets, slide.poster, n, 'poster')
  for (const [i, p] of (slide.portraits ?? []).entries()) addAsset(assets, p, n, `portraits[${i}]`)
  for (const [i, item] of (slide.items ?? []).entries()) {
    if (typeof item === 'string') {
      if (slide.layout === 'gallery') addAsset(assets, item, n, `items[${i}]`)
    } else if (isGalleryItem(item)) {
      addAsset(assets, item.image, n, `items[${i}].image`)
    }
  }
}

function assetIssues(assets: AssetRef[], issues: DeckIssue[]) {
  for (const asset of assets) {
    const first = asset.uses[0]
    if (!first) continue
    if (asset.kind === 'data') {
      const size = asset.approxBytes ?? 0
      const mb = size / 1024 / 1024
      issue(
        issues,
        first.slide,
        mb > 1 ? 'warning' : 'info',
        'asset',
        mb > 1 ? `Embedded image is ${mb.toFixed(1)} MB; consider saving it beside the deck.` : 'Image is embedded as a data URL.',
        first.field,
      )
    } else if (asset.kind === 'remote') {
      issue(issues, first.slide, 'info', 'asset', 'Remote image depends on network access.', first.field)
    }
  }
}

/** Files on disk that no slide references (by basename) become `orphan` assets:
 *  candidates for cleanup. Matching is by filename only, so a renamed/moved deck
 *  that still points at the same basename won't false-positive. */
function orphanAssets(referenced: AssetRef[], diskFiles: string[]): AssetRef[] {
  const used = new Set(referenced.map((a) => a.filename).filter((f): f is string => !!f))
  return diskFiles
    .filter((f) => !used.has(f))
    .map((f) => ({ ref: f, kind: 'orphan' as const, uses: [], filename: f }))
}

const ASSET_ORDER: Record<AssetKind, number> = { orphan: 0, data: 1, remote: 2, local: 3, blob: 4, unknown: 5 }

export function analyzeDeck(deck: Deck, diskFiles?: string[]): DeckAnalysis {
  const issues: DeckIssue[] = []
  const assetMap = new Map<string, AssetRef>()

  deck.slides.forEach((slide, index) => {
    validateSlide(slide, index, issues)
    collectAssets(slide, index, assetMap)
  })

  const referenced = [...assetMap.values()]
  const orphans = diskFiles ? orphanAssets(referenced, diskFiles) : []
  for (const o of orphans) {
    issue(issues, 0, 'info', 'asset', `Unused asset "${o.filename}" in the folder.`, o.filename)
  }

  const assets = [...referenced, ...orphans].sort((a, b) => {
    return (
      ASSET_ORDER[a.kind] - ASSET_ORDER[b.kind] ||
      (a.uses[0]?.slide ?? 0) - (b.uses[0]?.slide ?? 0) ||
      a.ref.slice(0, 120).localeCompare(b.ref.slice(0, 120))
    )
  })
  assetIssues(assets, issues)

  const counts: Record<IssueSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const i of issues) counts[i.severity] += 1

  return { issues, assets, counts }
}
