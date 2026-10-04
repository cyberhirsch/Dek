// Moving slides in the slide list, groups included.
//
// A slide's group is a label on the slide (`group:`); the list draws a heading
// wherever a run of equal labels starts. So a move has to settle the labels,
// or a dragged slide keeps its old one and splits the group it lands in —
// which looked like the group being copied along.
import type { Slide } from './types'

export interface MoveResult {
  slides: Slide[]
  /** Index of the first moved slide in the result. */
  at: number
}

/**
 * Move the slides at `indices` (as one block, order kept) to just before
 * `before` (an index in the original array).
 *
 * - Loose slides take the group of the slide directly above where they land:
 *   inside a group they join it, at the border between two groups they join
 *   the one above, below an ungrouped slide (or at the very top) they become
 *   ungrouped.
 * - A chapter (`chapter: true`, dragged by its heading) keeps its name, and is
 *   never dropped into the middle of another group: a drop there moves to the
 *   end of that group.
 */
export function moveSlides(slides: Slide[], indices: number[], before: number, chapter = false): MoveResult {
  const sorted = [...new Set(indices)].filter((i) => i >= 0 && i < slides.length).sort((a, b) => a - b)
  if (!sorted.length) return { slides, at: 0 }
  const block = sorted.map((i) => slides[i])
  const rest = slides.filter((_, i) => !sorted.includes(i))
  let at = Math.max(0, Math.min(rest.length, before - sorted.filter((i) => i < before).length))

  if (chapter) {
    // Inside a group (same group above and below): slide to its end.
    while (at > 0 && at < rest.length && rest[at - 1].group && rest[at - 1].group === rest[at].group) at++
    return { slides: [...rest.slice(0, at), ...block, ...rest.slice(at)], at }
  }

  const group = at > 0 ? rest[at - 1].group : undefined
  const moved = block.map((s) => {
    const copy = { ...s }
    if (group) copy.group = group
    else delete copy.group
    return copy
  })
  return { slides: [...rest.slice(0, at), ...moved, ...rest.slice(at)], at }
}
