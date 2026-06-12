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
}>()

const MIN = 7
const body = ref<HTMLElement | null>(null)
const fitSize = ref(props.baseSize)

function overflows(el: HTMLElement): boolean {
  return el.scrollHeight - el.clientHeight > 1 || el.scrollWidth - el.clientWidth > 1
}

// Write a candidate size straight onto the element. We keep the element's inline
// font-size authoritative (never clear it) so the rendered size is correct even
// when Vue skips a no-op style patch — e.g. the ResizeObserver refit lands on the
// same size as last time, so `fitSize` doesn't change and Vue wouldn't re-apply it.
function apply(px: number) {
  if (body.value) body.value.style.fontSize = px + 'px'
}

function fit() {
  const el = body.value
  if (!el) return
  // Not laid out yet (e.g. an off-screen / unmounted thumbnail) — measuring now
  // would falsely report overflow and shrink to MIN. Wait for a real size; the
  // ResizeObserver fires fit() again once the box has dimensions.
  if (el.clientHeight === 0) return
  const base = props.baseSize
  // Measure at the full size first; if it fits, keep it.
  apply(base)
  if (!overflows(el)) {
    fitSize.value = base
    return
  }
  // Largest size in [MIN, base] that fits — binary search on the live element.
  let lo = MIN
  let hi = base
  for (let i = 0; i < 12 && hi - lo > 0.4; i++) {
    const mid = (lo + hi) / 2
    apply(mid)
    if (overflows(el)) hi = mid
    else lo = mid
  }
  const result = Math.max(MIN, Math.floor(lo * 10) / 10)
  apply(result) // leave the chosen size on the element, not the last probed mid
  fitSize.value = result
}

let ro: ResizeObserver | null = null
onMounted(() => {
  fit()
  ro = new ResizeObserver(fit)
  if (body.value) ro.observe(body.value)
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
  <div ref="body" class="el-text-body" :style="[style, { fontSize: fitSize + 'px' }]">
    <div
      v-for="(row, ri) in parseContent(content)"
      :key="ri"
      class="el-line"
      :class="{ bullet: row.bullet }"
      v-html="inlineMd(row.text)"
    />
  </div>
</template>

<style scoped>
.el-text-body {
  position: relative;
  z-index: 1;
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
</style>
