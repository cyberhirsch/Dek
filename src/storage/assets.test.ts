import { describe, expect, it } from 'vitest'
import type { Deck, Slide } from '../core/types'
import {
  assetsFolderForFile,
  canonicalAssetRef,
  collectAssetRefs,
  localAssetRefs,
  mapSlideAssetRefs,
} from './assets'

const slide: Slide = {
  layout: 'freeform',
  image: 'Talk Assets/layout.jpg',
  poster: 'https://example.com/poster.jpg',
  portraits: ['Talk Assets/person.png'],
  items: [{ image: '/Talk Assets/gallery.webp' }],
  elements: [
    { type: 'box', x: 0, y: 0, w: 100, h: 100, src: 'Talk Assets/box.png' },
    { type: 'image', x: 0, y: 0, w: 100, h: 100, src: 'Talk Assets/canvas.png' },
    { type: 'video', x: 0, y: 0, w: 100, h: 100, video: 'https://example.com/video', poster: 'Talk Assets/video.jpg' },
  ],
}

describe('asset references', () => {
  it('derives the Assets folder exactly from the Markdown filename', () => {
    const file = 'Open Source & AI dek - SIM Edition.md'
    expect(assetsFolderForFile(file)).toBe('Open Source & AI dek - SIM Edition Assets')
    expect(assetsFolderForFile('My Talk.md')).toBe('My Talk Assets')
    expect(canonicalAssetRef(file, 'hero.webp')).toBe('/Open Source & AI dek - SIM Edition Assets/hero.webp')
  })

  it('collects layout, gallery, portrait, and canvas image fields', () => {
    expect(collectAssetRefs([slide])).toEqual([
      'Talk Assets/layout.jpg',
      'https://example.com/poster.jpg',
      'Talk Assets/person.png',
      '/Talk Assets/gallery.webp',
      'Talk Assets/box.png',
      'Talk Assets/canvas.png',
      'Talk Assets/video.jpg',
    ])
  })

  it('only requests folder access for local references', () => {
    const deck: Deck = { config: {}, slides: [slide] }
    expect(localAssetRefs(deck)).toEqual([
      'Talk Assets/layout.jpg',
      'Talk Assets/person.png',
      '/Talk Assets/gallery.webp',
      'Talk Assets/box.png',
      'Talk Assets/canvas.png',
      'Talk Assets/video.jpg',
    ])
  })

  it('maps canvas and layout image fields together', () => {
    const mapped = mapSlideAssetRefs(slide, (ref) => `resolved:${ref}`)
    expect(mapped.image).toBe('resolved:Talk Assets/layout.jpg')
    expect(mapped.elements?.[0]).toMatchObject({ src: 'resolved:Talk Assets/box.png' })
    expect(mapped.elements?.[1]).toMatchObject({ src: 'resolved:Talk Assets/canvas.png' })
    expect(mapped.elements?.[2]).toMatchObject({ poster: 'resolved:Talk Assets/video.jpg' })
  })
})
