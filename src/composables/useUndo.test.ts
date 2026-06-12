import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useUndo } from './useUndo'
import { defaultConfig } from '../core/deck'
import type { Deck, Slide } from '../core/types'

function setup() {
  const slide = (title: string): Slide => ({ layout: 'text', title, content: '' })
  const deck = ref<Deck | null>({ config: defaultConfig(), slides: [slide('a')] })
  const current = ref(0)
  const selected = ref<number[]>([0])
  let anchor = 0
  const save = vi.fn()
  const undo = useUndo({
    deck,
    current,
    selected,
    setAnchor: (n) => (anchor = n),
    save,
  })
  return { deck, current, selected, save, getAnchor: () => anchor, ...undo }
}

describe('useUndo', () => {
  it('restores the previous deck state on undo', () => {
    const t = setup()
    expect(t.canUndo.value).toBe(false)

    t.snap('edit')
    t.deck.value!.slides[0].title = 'changed'
    expect(t.canUndo.value).toBe(true)

    t.undo()
    expect(t.deck.value!.slides[0].title).toBe('a')
    expect(t.canUndo.value).toBe(false)
    expect(t.save).toHaveBeenCalled()
  })

  it('re-applies an undone change on redo', () => {
    const t = setup()
    t.snap('edit')
    t.deck.value!.slides[0].title = 'changed'
    t.undo()
    expect(t.canRedo.value).toBe(true)

    t.redo()
    expect(t.deck.value!.slides[0].title).toBe('changed')
    expect(t.canRedo.value).toBe(false)
  })

  it('coalesces rapid same-key edits into one step', () => {
    const t = setup()
    t.snap('type', true)
    t.snap('type', true) // within the window, same key → folded in
    t.snap('type', true)
    t.deck.value!.slides[0].title = 'typed'

    t.undo()
    expect(t.deck.value!.slides[0].title).toBe('a')
    expect(t.canUndo.value).toBe(false) // only one checkpoint was recorded
  })

  it('does not coalesce a different key', () => {
    const t = setup()
    t.snap('type', true)
    t.snap('layout', true) // different key → separate checkpoint
    expect(t.canUndo.value).toBe(true)
    t.undo()
    expect(t.canUndo.value).toBe(true) // still one left
  })

  it('restores the focused slide index and anchor', () => {
    const t = setup()
    t.deck.value!.slides.push({ layout: 'text', title: 'b', content: '' })
    t.current.value = 1
    t.snap('move')
    t.current.value = 0

    t.undo()
    expect(t.current.value).toBe(1)
    expect(t.getAnchor()).toBe(1)
  })

  it('reset() drops all history', () => {
    const t = setup()
    t.snap('edit')
    t.reset()
    expect(t.canUndo.value).toBe(false)
    expect(t.canRedo.value).toBe(false)
  })
})
