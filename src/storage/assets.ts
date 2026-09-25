import type { Deck, Slide } from '../core/types'
import { mapTableImages } from '../core/table'

const ILLEGAL_FILE_CHARS = /[/\\:*?"<>|]/g

export function cleanDeckName(name: string): string {
  return (name || 'deck').replace(ILLEGAL_FILE_CHARS, '').trim().slice(0, 80) || 'deck'
}

export function deckBaseName(fileName: string): string {
  return cleanDeckName(fileName.replace(/\.md$/i, ''))
}

/** Legacy layout: several decks share a folder, each with a name-matched sibling
 *  `<deck> Assets/`. Still read, but new decks are written as bundles. */
export function assetsFolderForFile(fileName: string): string {
  return `${deckBaseName(fileName)} Assets`
}

export function canonicalAssetRef(fileName: string, assetName: string): string {
  return `/${assetsFolderForFile(fileName)}/${assetName}`
}

// ── bundle layout ──
// A deck is one folder — `My Talk.dek/` holding `deck.md` and `Assets/`. The
// name lives on the folder, so asset refs carry no deck name and renaming the
// deck can't orphan its images (the bug the legacy layout has).

/** The assets subfolder inside a bundle. */
export const BUNDLE_ASSETS = 'Assets'
/** The conventional deck file inside a bundle. */
export const BUNDLE_MD = 'deck.md'

export function bundleAssetRef(assetName: string): string {
  return `${BUNDLE_ASSETS}/${assetName}`
}

/** `My Talk.dek` → `My Talk` (the deck's display name). */
export function bundleDeckName(folderName: string): string {
  return cleanDeckName(folderName.replace(/\.dek$/i, ''))
}

/**
 * Apply `fn` to every image reference a slide holds. This is THE mapper for a
 * bundle's images: it resolves `Assets/…` paths to displayable URLs on load,
 * turns upload URLs back into `Assets/…` paths on save, and lists what Save As
 * copies into a new bundle. A location it misses is therefore not just
 * invisible — an image uploaded there is saved as a temporary `blob:` URL that
 * dies with the tab, while its file sits unreferenced in `Assets/` for the
 * Review panel to offer for deletion. Tables and `stash` were both missed.
 */
export function mapSlideAssetRefs(slide: Slide, fn: (ref: string) => string, inStash = false): Slide {
  const mapped: Slide = { ...slide }
  if (typeof mapped.image === 'string') mapped.image = fn(mapped.image)
  if (typeof mapped.poster === 'string') mapped.poster = fn(mapped.poster)
  if (Array.isArray(mapped.portraits)) {
    mapped.portraits = mapped.portraits.map((portrait) =>
      typeof portrait === 'string' ? fn(portrait) : portrait,
    )
  }
  if (Array.isArray(mapped.items)) {
    // A bare string item is a picture in a gallery. In stash, `items` can only
    // have come from a gallery (text items migrate to `content` on parse).
    const stringsAreImages = mapped.layout === 'gallery' || inStash
    mapped.items = mapped.items.map((item) => {
      if (typeof item === 'string') return stringsAreImages ? fn(item) : item
      return item && typeof item === 'object' && 'image' in item
        ? { ...item, image: fn((item as { image: string }).image) }
        : item
    })
  }
  if (mapped.table) mapped.table = mapTableImages(mapped.table, fn)
  if (Array.isArray(mapped.elements)) {
    mapped.elements = mapped.elements.map((element) => {
      if (element.type === 'box' && typeof element.src === 'string') {
        return { ...element, src: fn(element.src) }
      }
      if (element.type === 'image') return { ...element, src: fn(element.src) }
      if (element.type === 'video' && typeof element.poster === 'string') {
        return { ...element, poster: fn(element.poster) }
      }
      if (element.type === 'table' && element.table) return { ...element, table: mapTableImages(element.table, fn) }
      return element
    })
  }
  // What a layout switch parked is still this slide's — map it the same way,
  // one level deep (stash is never itself stashed).
  if (!inStash && mapped.stash && typeof mapped.stash === 'object') {
    const { layout: _layout, ...stash } = mapSlideAssetRefs(
      { ...(mapped.stash as Slide), layout: mapped.layout },
      fn,
      true,
    )
    mapped.stash = stash
  }
  return mapped
}

export function collectAssetRefs(slides: Slide[]): string[] {
  const refs = new Set<string>()
  for (const slide of slides) {
    mapSlideAssetRefs(slide, (ref) => {
      if (ref) refs.add(ref)
      return ref
    })
  }
  return [...refs]
}

export function isLocalAssetRef(ref: string): boolean {
  return !!ref && !/^(?:data:|blob:|https?:\/\/|\/\/)/i.test(ref)
}

export function localAssetRefs(deck: Deck): string[] {
  return collectAssetRefs(deck.slides).filter(isLocalAssetRef)
}
