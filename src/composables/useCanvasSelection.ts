// Freeform-canvas selection state: which tool is active, which element(s) are
// selected, and a pending image waiting to be placed. Extracted from App.vue so
// the "what's selected on the canvas" concern lives in one place (App.vue #6/#34).
import { computed, ref, watch, type Ref } from 'vue'
import type { CanvasTool, Deck, SlideElement } from '../core/types'

export function useCanvasSelection(deck: Ref<Deck | null>, current: Ref<number>) {
  const activeTool = ref<CanvasTool>('select')
  // Selected element indices in selection order; the last one is the "primary"
  // element whose styles the top bar displays (patches apply to the whole set).
  const selectedEls = ref<number[]>([])
  // URL of an image waiting to be placed by the image tool (set by Insert image).
  const pendingImage = ref('')

  // Changing slides clears the canvas selection and drops back to the select tool.
  watch(current, () => {
    selectedEls.value = []
    activeTool.value = 'select'
  })

  const primaryEl = computed(() =>
    selectedEls.value.length ? selectedEls.value[selectedEls.value.length - 1] : null,
  )
  const selectedElement = computed<SlideElement | null>(() => {
    if (!deck.value || primaryEl.value == null) return null
    return deck.value.slides[current.value]?.elements?.[primaryEl.value] ?? null
  })

  return { activeTool, selectedEls, pendingImage, primaryEl, selectedElement }
}
