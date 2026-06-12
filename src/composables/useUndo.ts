// Undo/redo history for the editor. Snapshots are full deck state (config +
// slides + the focused slide index); rapid same-key edits (e.g. typing) coalesce
// into one step so a burst of keystrokes is a single undo. Pure ref logic with no
// component lifecycle, so it can be exercised directly in a test.
import { ref, computed, type Ref } from 'vue'
import type { Deck, DeckConfig, Slide } from '../core/types'

interface Snap {
  config: DeckConfig
  slides: Slide[]
  index: number
}

export interface UndoDeps {
  deck: Ref<Deck | null>
  current: Ref<number>
  selected: Ref<number[]>
  /** Move the selection anchor (App owns it as a plain variable). */
  setAnchor: (n: number) => void
  /** Persist after an undo/redo restores a snapshot. */
  save: () => void
}

const MAX_DEPTH = 80
const COALESCE_MS = 800

export function useUndo({ deck, current, selected, setAnchor, save }: UndoDeps) {
  const past = ref<Snap[]>([])
  const future = ref<Snap[]>([])
  let lastSnapKey = ''
  let lastSnapTime = 0
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  function cloneState(): Snap {
    return {
      config: JSON.parse(JSON.stringify(deck.value!.config)),
      slides: JSON.parse(JSON.stringify(deck.value!.slides)),
      index: current.value,
    }
  }
  /** Record a checkpoint before a mutation. `coalesce` merges rapid same-key
   *  edits (e.g. typing) into a single undo step. */
  function snap(key: string, coalesce = false) {
    if (!deck.value) return
    const now = Date.now()
    if (coalesce && key === lastSnapKey && now - lastSnapTime < COALESCE_MS) {
      lastSnapTime = now
      return
    }
    past.value.push(cloneState())
    if (past.value.length > MAX_DEPTH) past.value.shift()
    future.value = []
    lastSnapKey = key
    lastSnapTime = now
  }
  function applySnap(s: Snap) {
    deck.value!.config = s.config
    deck.value!.slides = s.slides
    current.value = Math.min(s.index, s.slides.length - 1)
    selected.value = [current.value]
    setAnchor(current.value)
    lastSnapKey = ''
    save()
  }
  function undo() {
    if (!past.value.length) return
    future.value.push(cloneState())
    applySnap(past.value.pop()!)
  }
  function redo() {
    if (!future.value.length) return
    past.value.push(cloneState())
    applySnap(future.value.pop()!)
  }
  /** Drop all history (e.g. when a different deck is loaded). */
  function reset() {
    past.value = []
    future.value = []
    lastSnapKey = ''
  }

  return { canUndo, canRedo, snap, undo, redo, reset }
}
