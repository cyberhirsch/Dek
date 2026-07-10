import type { Deck, Slide } from '../core/types'

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

export function mapSlideAssetRefs(slide: Slide, fn: (ref: string) => string): Slide {
  const mapped: Slide = { ...slide }
  if (typeof mapped.image === 'string') mapped.image = fn(mapped.image)
  if (typeof mapped.poster === 'string') mapped.poster = fn(mapped.poster)
  if (Array.isArray(mapped.portraits)) {
    mapped.portraits = mapped.portraits.map((portrait) =>
      typeof portrait === 'string' ? fn(portrait) : portrait,
    )
  }
  if (Array.isArray(mapped.items)) {
    mapped.items = mapped.items.map((item) =>
      item && typeof item === 'object' && 'image' in item
        ? { ...item, image: fn((item as { image: string }).image) }
        : item,
    )
  }
  if (Array.isArray(mapped.elements)) {
    mapped.elements = mapped.elements.map((element) => {
      if (element.type === 'box' && typeof element.src === 'string') {
        return { ...element, src: fn(element.src) }
      }
      if (element.type === 'image') return { ...element, src: fn(element.src) }
      if (element.type === 'video' && typeof element.poster === 'string') {
        return { ...element, poster: fn(element.poster) }
      }
      return element
    })
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
