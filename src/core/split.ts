import { parseContent, rowsToContent, type ContentRow } from '../render/inline'
import type { BoxElement, Slide } from './types'

export type SlideTextField = 'title' | 'subtitle' | 'byline' | 'text' | 'cite' | 'name' | 'role' | 'caption' | 'content'
export type SlideSplitTarget =
  | { kind: 'field'; field: SlideTextField }
  | { kind: 'gallery-label'; index: number }
  | { kind: 'element'; index: number }

function splitRows(rows: ContentRow[]): [ContentRow[], ContentRow[]] | null {
  if (rows.length > 1) {
    const splitAt = Math.ceil(rows.length / 2)
    return [rows.slice(0, splitAt), rows.slice(splitAt)]
  }

  const row = rows[0]
  if (!row) return null
  const text = row.text.trim()
  if (text.length < 2) return null
  const boundaries = [...text.matchAll(/(?:[.!?]["')\]]?\s+|\s+)/g)]
    .map((match) => (match.index ?? 0) + match[0].length)
    .filter((index) => index > 0 && index < text.length)
  if (!boundaries.length) return null
  const middle = text.length / 2
  const index = boundaries.reduce((best, candidate) =>
    Math.abs(candidate - middle) < Math.abs(best - middle) ? candidate : best,
  )
  return [
    [{ text: text.slice(0, index).trim(), bullet: row.bullet }],
    [{ text: text.slice(index).trim(), bullet: row.bullet }],
  ]
}

function cloneSlide(slide: Slide): Slide {
  return JSON.parse(JSON.stringify(slide)) as Slide
}

export function splitSlide(slide: Slide, target: SlideSplitTarget): [Slide, Slide] | null {
  if (target.kind === 'field') {
    const value = slide[target.field]
    if (typeof value !== 'string') return null
    const rows = target.field === 'content'
      ? parseContent(value)
      : value.split('\n').filter((line) => line.trim()).map((text) => ({ text, bullet: false }))
    const split = splitRows(rows)
    if (!split) return null
    const first = cloneSlide(slide)
    const second = cloneSlide(slide)
    const serialize = target.field === 'content'
      ? rowsToContent
      : (part: ContentRow[]) => part.map((row) => row.text).join('\n')
    first[target.field] = serialize(split[0])
    second[target.field] = serialize(split[1])
    return [first, second]
  }

  if (target.kind === 'gallery-label') {
    const item = slide.items?.[target.index]
    if (!item || typeof item === 'string' || !('image' in item) || typeof item.label !== 'string') return null
    const split = splitRows([{ text: item.label, bullet: false }])
    if (!split) return null
    const first = cloneSlide(slide)
    const second = cloneSlide(slide)
    const firstItem = first.items?.[target.index]
    const secondItem = second.items?.[target.index]
    if (!firstItem || typeof firstItem === 'string' || !('image' in firstItem)) return null
    if (!secondItem || typeof secondItem === 'string' || !('image' in secondItem)) return null
    firstItem.label = split[0].map((row) => row.text).join('\n')
    secondItem.label = split[1].map((row) => row.text).join('\n')
    return [first, second]
  }

  const box = slide.elements?.[target.index]
  if (!box || box.type !== 'box') return null
  const split = splitRows(parseContent(box.content))
  if (!split) return null
  const first = cloneSlide(slide)
  const second = cloneSlide(slide)
  ;(first.elements![target.index] as BoxElement).content = rowsToContent(split[0])
  ;(second.elements![target.index] as BoxElement).content = rowsToContent(split[1])
  return [first, second]
}
