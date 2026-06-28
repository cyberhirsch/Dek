<script setup lang="ts">
// Read-only render of a box's text that auto-shrinks to fit. The configured
// `size` is treated as the *maximum*: if the text overflows the box (taller or
// wider than the content area) the font is scaled down — by binary search — to
// the largest size that still fits, never below MIN. This keeps the chosen size
// when there's room but prevents content from being clipped by `overflow: hidden`.
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { inlineMd, parseContent } from '../render/inline'

const props = defineProps<{
  content?: string
  baseSize: number
  style: Record<string, string>
  editable?: boolean
}>()
const emit = defineEmits<{ split: [] }>()

const MIN = 7
const frame = ref<HTMLElement | null>(null)
const body = ref<HTMLElement | null>(null)
const fitSize = ref(props.baseSize)
const shrunk = ref(false)

function overflows(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1
}

// Write a candidate size straight onto the element. We keep the element's inline
// font-size authoritative (never clear it) so the rendered size is correct even
// when Vue skips a no-op style patch — e.g. the ResizeObserver refit lands on the
// same size as last time, so `fitSize` doesn't change and Vue wouldn't re-apply it.
function apply(px: number, reserveButton: boolean) {
  if (!body.value) return
  body.value.style.fontSize = px + 'px'
  body.value.style.height = reserveButton ? 'calc(100% - 28px)' : '100%'
}

function fit() {
  const el = body.value
  const host = frame.value
  if (!el || !host) return
  // Not laid out yet (e.g. an off-screen / unmounted thumbnail) — measuring now
  // would falsely report overflow and shrink to MIN. Wait for a real size; the
  // ResizeObserver fires fit() again once the box has dimensions.
  if (host.clientHeight === 0 || host.clientWidth === 0) return
  const base = props.baseSize
  // Measure at the full size first; if it fits, keep it.
  apply(base, false)
  if (!overflows(el)) {
    fitSize.value = base
    shrunk.value = false
    return
  }
  shrunk.value = true
  // Largest size in [MIN, base] that fits — binary search on the live element.
  let lo = MIN
  let hi = base
  apply(lo, true)
  if (overflows(el)) {
    fitSize.value = lo
    return
  }
  for (let i = 0; i < 12 && hi - lo > 0.4; i++) {
    const mid = (lo + hi) / 2
    apply(mid, true)
    if (overflows(el)) hi = mid
    else lo = mid
  }
  const result = Math.max(MIN, Math.floor(lo * 10) / 10)
  apply(result, true) // leave the chosen size on the element, not the last probed mid
  fitSize.value = result
}

let ro: ResizeObserver | null = null
onMounted(() => {
  fit()
  ro = new ResizeObserver(fit)
  if (frame.value) ro.observe(frame.value)
})
onUnmounted(() => ro?.disconnect())
// Refit when the text or any style that affects layout (font, weight, padding…) changes.
watch(
  () => [props.content, props.baseSize, JSON.stringify(props.style)],
  () => fit(),
  { flush: 'post' },
)
</script>

<template>
  <div ref="frame" class="box-text-wrap" :class="{ shrunk }" :data-fit-size="fitSize">
    <div ref="body" class="el-text-body" :style="[style, { fontSize: fitSize + 'px' }]">
      <div
        v-for="(row, ri) in parseContent(content)"
        :key="ri"
        class="el-line"
        :class="{ bullet: row.bullet }"
        v-html="inlineMd(row.text)"
      />
    </div>
    <button
      v-if="editable && shrunk"
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
.box-text-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}
.el-text-body {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  line-height: 1.25;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
}
.el-line {
  position: relative;
}
.el-text-body :deep(a) {
  color: var(--dek-accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.el-line.bullet {
  padding-left: 1.4em;
}
.el-line.bullet::before {
  content: '▪';
  position: absolute;
  left: 0;
  top: 0;
  color: var(--dek-accent);
}
.fit-split {
  position: absolute;
  right: 4px;
  bottom: 2px;
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
