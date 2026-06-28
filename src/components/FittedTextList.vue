<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { inlineMd, type ContentRow } from '../render/inline'
import EditableTextList from './EditableTextList.vue'

const props = withDefaults(
  defineProps<{
    rows: ContentRow[]
    editable?: boolean
    formatCommand?: number
    baseSize?: number
    minSize?: number
  }>(),
  {
    baseSize: 26,
    minSize: 12,
  },
)

const emit = defineEmits<{
  'update:rows': [rows: ContentRow[]]
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

function fit() {
  const el = body.value
  const host = frame.value
  if (!el || !host || host.clientHeight === 0 || host.clientWidth === 0) return

  const base = props.baseSize
  apply(base, false)
  if (!overflows(el)) {
    fitSize.value = base
    shrunk.value = false
    return
  }

  shrunk.value = true
  let lo = Math.min(props.minSize, base)
  let hi = base
  apply(lo, true)
  if (overflows(el)) {
    fitSize.value = lo
    return
  }

  for (let i = 0; i < 12 && hi - lo > 0.25; i += 1) {
    const mid = (lo + hi) / 2
    apply(mid, true)
    if (overflows(el)) hi = mid
    else lo = mid
  }
  const result = Math.floor(lo * 10) / 10
  apply(result, true)
  fitSize.value = result
}

function scheduleFit() {
  cancelAnimationFrame(animationFrame)
  animationFrame = requestAnimationFrame(() => void nextTick(fit))
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
  () => [props.rows, props.baseSize, props.minSize],
  scheduleFit,
  { deep: true, flush: 'post' },
)
</script>

<template>
  <div ref="frame" class="fitted-list" :class="{ shrunk }" :data-fit-size="fitSize">
    <div ref="body" class="fitted-list-body" :style="{ fontSize: fitSize + 'px' }">
      <EditableTextList
        v-if="editable"
        :rows="rows"
        :format-command="formatCommand"
        @update:rows="emit('update:rows', $event)"
      />
      <ul v-else class="dek-list">
        <li v-for="(it, i) in rows" :key="i" :class="{ plain: !it.bullet }" v-html="inlineMd(it.text)" />
      </ul>
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
.fitted-list {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.fitted-list-body {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.fitted-list-body :deep(.dek-list) {
  height: auto;
  min-height: 0;
  overflow: visible;
  gap: 0.7em;
}
.fitted-list-body :deep(.dek-list li) {
  font-size: inherit !important;
  line-height: 1.45;
  padding-left: 1.3em;
  overflow-wrap: anywhere;
}
.fitted-list-body :deep(.dek-list li::before) {
  font-size: 0.7em;
  top: 0.2em;
}
.fitted-list-body :deep(.dek-list li.editing) {
  margin: -0.23em 0;
  padding: 0.23em 0.3em 0.23em 1.3em;
}
.fitted-list-body :deep(.dek-list li.editing::before) {
  left: 0.3em;
  top: 0.43em;
}
.fitted-list-body :deep(.dek-list li.editing.plain) {
  padding-left: 0.3em;
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
