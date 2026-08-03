<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import EditableText from './EditableText.vue'
import { opticalMarginLeft } from '../render/optical'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    editable?: boolean
    tag?: string
    contentClass?: string
    placeholder?: string
    multiline?: boolean
    prefix?: string
    baseSize: number
    minSize?: number
    splittable?: boolean
  }>(),
  {
    minSize: 11,
    prefix: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  split: []
}>()

const frame = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const fitSize = ref(props.baseSize)
const shrunk = ref(false)
let animationFrame = 0
let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

function overflows(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1
}

function apply(size: number, reserveButton: boolean) {
  const el = body.value
  if (!el) return
  el.style.fontSize = `${size}px`
  el.style.height = reserveButton ? 'calc(100% - 28px)' : '100%'
}

// Optical margin correction: only meaningful for left-aligned italic display
// type (Cormorant headings) — centered/right-aligned text has no single
// reference edge to correct against, and upright body/mono text doesn't have
// the diagonal-stroke indent this compensates for. Both are read straight off
// the actual computed style, so this applies itself automatically to whatever
// heading uses FittedText — no per-usage opt-in to remember. A nonzero shift
// needs `overflow-x` relaxed on the frame, or the correction (which nudges the
// line a few px into what's normally reserved padding) would just get clipped
// by the same box it's trying to escape; `overflow-y` stays governed by the
// stylesheet's `hidden`, since only the left-edge concern applies here.
function applyOpticalMargin() {
  const host = frame.value
  // `contentClass` (where the italic heading rule actually lives, e.g. `.mark`)
  // lands on this child via Vue's attribute fallthrough, not on `.fitted-text-body`
  // itself — checking the wrapper's own computed style would never see it.
  const target = body.value?.firstElementChild as HTMLElement | null
  if (!target || !host) return
  const cs = getComputedStyle(target)
  const text = `${props.prefix}${props.modelValue ?? ''}`
  const shift = cs.fontStyle === 'italic' && cs.textAlign !== 'center' && cs.textAlign !== 'right'
    ? opticalMarginLeft(text, cs.font)
    : 0
  target.style.marginLeft = shift ? `${shift}px` : ''
  host.style.overflowX = shift ? 'visible' : ''
}

function fit() {
  const el = body.value
  const host = frame.value
  if (!el || !host || host.clientHeight === 0 || host.clientWidth === 0) return

  const base = props.baseSize
  apply(base, false)
  if (!overflows(el)) {
    fitSize.value = base
    shrunk.value = false
    applyOpticalMargin()
    return
  }

  shrunk.value = true
  let lo = Math.min(props.minSize, base)
  let hi = base
  apply(lo, props.splittable)
  if (overflows(el)) {
    fitSize.value = lo
    applyOpticalMargin()
    return
  }
  for (let i = 0; i < 12 && hi - lo > 0.25; i += 1) {
    const mid = (lo + hi) / 2
    apply(mid, props.splittable)
    if (overflows(el)) hi = mid
    else lo = mid
  }
  const result = Math.floor(lo * 10) / 10
  apply(result, props.splittable)
  fitSize.value = result
  applyOpticalMargin()
}

function scheduleFit() {
  cancelAnimationFrame(animationFrame)
  // fit() only reads/writes real DOM refs (already current by the time typing
  // fires the MutationObserver), so it doesn't need to wait for a Vue nextTick
  // on top of the animation frame — that extra tick widens the window where a
  // just-typed character can render clipped (still at the old font size, one
  // paint before fit() catches up and shrinks it to fit).
  animationFrame = requestAnimationFrame(fit)
}

onMounted(() => {
  scheduleFit()
  resizeObserver = new ResizeObserver(scheduleFit)
  if (frame.value) resizeObserver.observe(frame.value)
  mutationObserver = new MutationObserver(scheduleFit)
  if (body.value) mutationObserver.observe(body.value, { childList: true, characterData: true, subtree: true })
  void document.fonts?.ready.then(scheduleFit)
})
onUnmounted(() => {
  cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  mutationObserver?.disconnect()
})
watch(
  () => [props.modelValue, props.baseSize, props.minSize, props.splittable],
  scheduleFit,
  { flush: 'post' },
)
</script>

<template>
  <div ref="frame" class="fitted-text" :class="{ shrunk }" :data-fit-size="fitSize">
    <div ref="body" class="fitted-text-body" :style="{ fontSize: fitSize + 'px' }">
      <EditableText
        v-if="editable"
        :tag="tag"
        :class="contentClass"
        :model-value="modelValue"
        :placeholder="placeholder"
        :multiline="multiline"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <component :is="tag || 'div'" v-else :class="contentClass">{{ prefix }}{{ modelValue }}</component>
    </div>
    <button
      v-if="editable && splittable && shrunk"
      class="fit-split"
      title="Split overflowing text into a continuation slide"
      @pointerdown.stop.prevent
      @click.stop="emit('split')"
    >
      Split
    </button>
  </div>
</template>

<style scoped>
.fitted-text {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.fitted-text-body {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.fitted-text-body > :deep(*) {
  max-width: 100%;
  font-size: inherit !important;
  overflow-wrap: anywhere;
}
.fit-split {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 6;
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(127, 199, 255, 0.5);
  border-radius: 5px;
  background: rgba(7, 8, 9, 0.88);
  color: var(--dek-accent);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.fit-split:hover {
  background: rgba(127, 199, 255, 0.18);
  border-color: var(--dek-accent);
}
</style>
