<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Deck, DeckConfig, Slide, SlideElement } from '../core/types'
import { themeVars as buildThemeVars } from '../render/theme'
import SlideView from './SlideView.vue'
import type { CanvasTool } from '../core/types'

const props = defineProps<{
  deck: Deck
  modelValue: number
  editable?: boolean
  bulletFormatCommand?: number
  navEnabled?: boolean
  tool?: CanvasTool
  selectedEl?: number[]
  pendingImage?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [n: number]
  patch: [p: Partial<Slide>]
  'config-patch': [p: Partial<DeckConfig>]
  upload: [e: { field: 'image' | 'poster' | 'portraits' | 'gallery'; file: File; index?: number }]
  'update:elements': [els: SlideElement[]]
  'update:selectedEl': [sel: number[]]
  'create-element': [el: SlideElement]
  'tool-reset': []
  'element-image': [index: number, file: File]
  'drop-image': [file: File, target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number }]
  ctxmenu: [p: { x: number; y: number; sx: number; sy: number; index: number; kind?: 'text' | 'link'; url?: string }]
}>()

const stage = ref<HTMLElement | null>(null)
const scale = ref(1)
const STAGE_W = 1280
const STAGE_H = 720

const themeVars = computed(() => buildThemeVars(props.deck.config))

// The HUD counter (in App) follows `modelValue` instantly, but rendering a slide
// (images, Mermaid, a full remount via :key) is the expensive part. Throttle the
// index that actually drives SlideView so a fast scroll zips through the numbers
// and the heavy frame catches up once movement settles — instead of rendering
// every intermediate slide.
const renderIndex = ref(props.modelValue)
let renderTimer: ReturnType<typeof setTimeout> | null = null
let lastRender = 0
// Local running index for wheel nav: the v-model round-trip to the parent is
// async, so rapid synchronous wheel events would otherwise all read a stale
// modelValue and under-advance. We track it here and keep it in sync.
let pendingIndex = props.modelValue
watch(
  () => props.modelValue,
  (n) => {
    pendingIndex = n
    if (renderTimer) {
      clearTimeout(renderTimer)
      renderTimer = null
    }
    // In the editor the rendered slide must always match the selected one
    // (edits target it) — only throttle while presenting.
    if (props.editable) {
      renderIndex.value = n
      return
    }
    const now = performance.now()
    if (now - lastRender > 110) {
      renderIndex.value = n
      lastRender = now
    } else {
      renderTimer = setTimeout(() => {
        renderIndex.value = props.modelValue
        lastRender = performance.now()
      }, 110)
    }
  },
)

function fit() {
  const el = stage.value
  if (!el) return
  const { width, height } = el.getBoundingClientRect()
  scale.value = Math.min(width / STAGE_W, height / STAGE_H)
}

function go(n: number) {
  const max = props.deck.slides.length - 1
  emit('update:modelValue', Math.max(0, Math.min(max, n)))
}

function onKey(e: KeyboardEvent) {
  // Suspended while an overlay (overview / presenter / export) owns the keyboard.
  if (props.navEnabled === false) return
  // Don't hijack arrows/space while typing in a contenteditable or form field
  // (e.g. the Markdown source textarea) — only Page Up/Down still navigates.
  const ae = document.activeElement as HTMLElement | null
  if (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) {
    if (e.key === 'PageDown') go(props.modelValue + 1)
    if (e.key === 'PageUp') go(props.modelValue - 1)
    return
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault()
    go(props.modelValue + 1)
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault()
    go(props.modelValue - 1)
  } else if (e.key === 'Home') {
    go(0)
  } else if (e.key === 'End') {
    go(props.deck.slides.length - 1)
  }
}

// Present-mode: wheel scroll flips through slides. Accumulate delta into discrete
// steps (no time lock) so it feels immediate; a fast flick advances several at
// once while the counter stays responsive (the frame render is throttled above).
let wheelAccum = 0
function onWheel(e: WheelEvent) {
  if (props.editable || props.navEnabled === false) return
  e.preventDefault()
  wheelAccum += e.deltaY
  const STEP = 90
  let steps = Math.trunc(wheelAccum / STEP)
  if (!steps) return
  steps = Math.max(-6, Math.min(6, steps)) // cap inertia spikes
  wheelAccum -= steps * STEP
  const max = props.deck.slides.length - 1
  pendingIndex = Math.max(0, Math.min(max, pendingIndex + steps))
  emit('update:modelValue', pendingIndex)
}

let ro: ResizeObserver
onMounted(() => {
  fit()
  ro = new ResizeObserver(fit)
  if (stage.value) ro.observe(stage.value)
  window.addEventListener('keydown', onKey)
  stage.value?.addEventListener('wheel', onWheel, { passive: false })
})
onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('keydown', onKey)
  stage.value?.removeEventListener('wheel', onWheel)
})
</script>

<template>
  <div ref="stage" class="dek-stage" :style="themeVars">
    <div
      class="dek-frame"
      :style="{
        width: STAGE_W + 'px',
        height: STAGE_H + 'px',
        transform: `scale(${scale})`,
      }"
    >
      <SlideView
        v-if="deck.slides[renderIndex]"
        :key="renderIndex"
        :slide="deck.slides[renderIndex]"
        :config="deck.config"
        :index="renderIndex"
        :total="deck.slides.length"
        :editable="editable"
        :bullet-format-command="bulletFormatCommand"
        :tool="tool"
        :selected-el="selectedEl"
        :pending-image="pendingImage"
        @patch="emit('patch', $event)"
        @config-patch="emit('config-patch', $event)"
        @upload="emit('upload', $event)"
        @update:elements="emit('update:elements', $event)"
        @update:selected-el="emit('update:selectedEl', $event)"
        @create-element="emit('create-element', $event)"
        @tool-reset="emit('tool-reset')"
        @element-image="(i, f) => emit('element-image', i, f)"
        @drop-image="(f, t) => emit('drop-image', f, t)"
        @ctxmenu="emit('ctxmenu', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.dek-stage {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #050506;
}
.dek-frame {
  position: relative;
  flex: none;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}
</style>
