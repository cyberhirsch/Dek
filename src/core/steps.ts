// Where a presentation is: which slide, and how many of its build rows are
// showing. A slide with `steps: true` reveals its content rows one at a time,
// so "next" means "next row" until all are out, then "next slide". Shared by
// the audience screen and the presenter view, so both always agree — moving by
// slide number alone left a build slide showing only its heading.
import type { Slide } from './types'
import { parseContent } from '../render/inline'

export interface StepPos {
  index: number
  revealed: number
}

/** How many build rows a slide reveals one by one (0 without `steps`). */
export function buildRows(slide: Pick<Slide, 'steps' | 'content'> | undefined): number {
  return slide?.steps ? parseContent(slide.content).length : 0
}

/** One step forward (+1) or back (−1). Going back onto a build slide lands
 *  with all its rows showing, as you left it. */
export function stepMove(slides: Pick<Slide, 'steps' | 'content'>[], pos: StepPos, dir: 1 | -1): StepPos {
  const rows = buildRows(slides[pos.index])
  if (dir > 0) {
    if (pos.revealed < rows) return { index: pos.index, revealed: pos.revealed + 1 }
    if (pos.index < slides.length - 1) return { index: pos.index + 1, revealed: 0 }
    return pos
  }
  if (pos.revealed > 0) return { index: pos.index, revealed: pos.revealed - 1 }
  if (pos.index > 0) return { index: pos.index - 1, revealed: buildRows(slides[pos.index - 1]) }
  return pos
}
