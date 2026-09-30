<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Deck, DeckConfig, Slide, SlideElement } from '../core/types'
import type { SlideSplitTarget } from '../core/split'
import type { IdleText } from './ContextMenu.vue'
import { themeVars as buildThemeVars } from '../render/theme'
import { parseContent } from '../render/inline'
import { playToEnd, slideHasVideo, toggleVideoIn } from '../render/videoControl'
import { slideBeats } from '../core/narration'
import { currentVoice } from '../render/voice'
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
  /** Presenter pen (D / the HUD pencil). Owned by App so the HUD can show it. */
  drawing?: boolean
  inkColor?: string
  /** Narrate mode (Enter): Dek presents by itself, speaking the notes' `>` lines. */
  narrating?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [n: number]
  'update:drawing': [on: boolean]
  'update:narrating': [on: boolean]
  /** Narration ran off the end of the deck. */
  'narration-end': []
  patch: [p: Partial<Slide>]
  'config-patch': [p: Partial<DeckConfig>]
  upload: [e: { field: 'image' | 'poster' | 'portraits' | 'gallery' | 'table'; file: File; index?: number; el?: number }]
  'update:elements': [els: SlideElement[]]
  'update:selectedEl': [sel: number[]]
  'create-element': [el: SlideElement]
  'tool-reset': []
  'element-image': [index: number, file: File]
  split: [e: { index: number; target: SlideSplitTarget }]
  'drop-image': [file: File, target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number }]
  'drop-link': [url: string, target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number }]
  ctxmenu: [p: { x: number; y: number; sx: number; sy: number; index: number; kind?: 'text' | 'link' | 'image' | 'cells'; url?: string; imageField?: 'image' | 'portraits' | 'gallery' | 'table'; imageIndex?: number; imageEl?: number; cells?: number[]; idle?: IdleText }]
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

// ── step reveals ──
// A slide with `steps: true` reveals its content rows one at a time. `revealed`
// counts how many are shown on the current slide; it resets on every slide
// change. `revealIntent` decides whether we land on a slide fully-revealed
// (arriving by going *back*) or collapsed (going forward / jumping).
const revealed = ref(0)
let revealIntent: 'start' | 'end' = 'start'
function stepRows(index: number): number {
  const s = props.deck.slides[index]
  if (!s || !s.steps) return 0
  return parseContent(s.content).length
}
const reveal = computed(() => {
  if (props.editable) return undefined
  const s = props.deck.slides[renderIndex.value]
  return s?.steps ? revealed.value : undefined
})

watch(
  () => props.modelValue,
  (n) => {
    pendingIndex = n
    revealed.value = revealIntent === 'end' ? stepRows(n) : 0
    revealIntent = 'start'
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

// ── narrate mode ──
// Enter starts and stops it. On each slide Dek says the notes' `>` lines
// (revealing build rows as it goes), plays the slide's video to its end, then
// moves on. Turning pages by hand while it runs just continues from there.
// The voice is an engine (render/voice.ts): the browser's speech now, audio
// from a local model later.
const narrating = computed(() => !!props.narrating && !props.editable)
let narration: AbortController | null = null
const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(done, ms)
    function done() {
      clearTimeout(t)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done)
  })
/** Silence on a slide with nothing to say and no video, so it can be read. */
const QUIET_SLIDE_MS = 4000
const BETWEEN_SLIDES_MS = 800
async function narrateSlide(signal: AbortSignal) {
  // Let the throttled render catch up, then give the slide a moment to mount
  // its media (a video's poster and play button).
  for (let i = 0; i < 40 && renderIndex.value !== props.modelValue; i++) await pause(50, signal)
  await pause(350, signal)
  if (signal.aborted) return
  const index = props.modelValue
  const slide = props.deck.slides[index]
  const rows = stepRows(index)
  const beats = slideBeats(slide)
  // On a video slide the first passage introduces the film (credit, what to
  // watch for), the video plays to its end, and the passages after it are the
  // discussion. Without a video, every passage in turn.
  const video = !!stage.value && slideHasVideo(stage.value)
  const say = async (b: (typeof beats)[number]) => {
    if (b.reveal != null) revealed.value = b.reveal
    if (b.text) await currentVoice().speak(b.text, signal)
    else await pause(1200, signal)
  }
  const [intro, ...rest] = beats
  if (intro) await say(intro)
  if (signal.aborted) return
  if (video && stage.value) await playToEnd(stage.value, signal)
  for (const b of rest) {
    if (signal.aborted) return
    await say(b)
  }
  if (signal.aborted) return
  if (rows) revealed.value = rows
  if (!beats.length && !video) await pause(QUIET_SLIDE_MS, signal)
  await pause(BETWEEN_SLIDES_MS, signal)
  if (signal.aborted) return
  if (index >= props.deck.slides.length - 1) {
    emit('update:narrating', false)
    emit('narration-end')
    return
  }
  revealIntent = 'start'
  go(index + 1)
}
function restartNarration() {
  narration?.abort()
  narration = null
  if (!narrating.value) return
  narration = new AbortController()
  void narrateSlide(narration.signal)
}
watch([() => props.modelValue, narrating], restartNarration)

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

// One "step" forward/back: reveal or hide a build on the current slide if it has
// any left in that direction, otherwise cross to the neighbouring slide.
function advance(dir: 1 | -1) {
  const rows = stepRows(props.modelValue)
  if (dir > 0 && revealed.value < rows) {
    revealed.value += 1
    return
  }
  if (dir < 0 && revealed.value > 0) {
    revealed.value -= 1
    return
  }
  revealIntent = dir < 0 ? 'end' : 'start'
  go(props.modelValue + dir)
}

// ── drawing while presenting ──
// D (or the HUD pencil) turns the pointer into a pen; turning it off wipes the
// ink. Ink is per slide (flip away and back and it's still there) and never
// saved — it's chalk on the board, not deck content. App turns the pen off when
// the presentation ends, which wipes it too.
interface Stroke {
  d: string
  color: string
}
const ink = ref<Record<number, Stroke[]>>({})
const live = ref<Stroke | null>(null)
const frame = ref<HTMLElement | null>(null)
const drawing = computed(() => !!props.drawing && !props.editable)
function toggleDrawing() {
  emit('update:drawing', !props.drawing)
}
watch(drawing, (on) => {
  if (on) return
  ink.value = {}
  live.value = null
})
function stagePoint(e: PointerEvent): string {
  const r = frame.value!.getBoundingClientRect()
  const x = ((e.clientX - r.left) / r.width) * STAGE_W
  const y = ((e.clientY - r.top) / r.height) * STAGE_H
  return `${x.toFixed(1)} ${y.toFixed(1)}`
}
function onInkDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  const p = stagePoint(e)
  // A zero-length segment so a single click leaves a dot.
  live.value = { d: `M${p} L${p}`, color: props.inkColor ?? 'var(--dek-accent2)' }
}
function onInkMove(e: PointerEvent) {
  if (live.value === null) return
  live.value = { ...live.value, d: live.value.d + ` L${stagePoint(e)}` }
}
function onInkUp() {
  if (live.value === null) return
  const i = renderIndex.value
  ink.value = { ...ink.value, [i]: [...(ink.value[i] ?? []), live.value] }
  live.value = null
}

const PLAY_KEYS = new Set([' ', '.', 'b', 'B', 'MediaPlayPause'])

// A click into a YouTube/Vimeo player moves keyboard focus into its iframe,
// and from then on every key — the remote's included — goes to the player,
// out of Dek's reach. While presenting, hand focus straight back: the click
// itself still reached the player.
function onWindowBlur() {
  if (props.editable) return
  setTimeout(() => {
    const a = document.activeElement as HTMLElement | null
    if (a?.tagName === 'IFRAME' && stage.value?.contains(a)) {
      a.blur()
      window.focus()
    }
  }, 0)
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
  // Play/pause the slide's video: Space, the media key, and a presenter
  // remote's ■ button (Kensington and Logitech send `.` or `b` — PowerPoint's
  // black-screen keys). The arrows and PageUp/PageDown (the remote's ◀ ▶)
  // keep turning slides. Space still advances on a slide without a video.
  const mod = e.ctrlKey || e.metaKey || e.altKey
  if (!props.editable && !mod && PLAY_KEYS.has(e.key)) {
    e.preventDefault()
    if (stage.value && toggleVideoIn(stage.value)) return
    if (e.key === ' ') advance(1)
    return
  }
  if (!props.editable && !mod && e.key === 'Enter') {
    e.preventDefault()
    emit('update:narrating', !props.narrating)
    return
  }
  if (!props.editable && !mod && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    toggleDrawing()
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
    e.preventDefault()
    advance(1)
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    advance(-1)
  } else if (e.key === 'PageDown') {
    // Page keys jump whole slides, skipping any remaining build steps.
    e.preventDefault()
    go(props.modelValue + 1)
  } else if (e.key === 'PageUp') {
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

// Present-mode: swipe left/right advances/rewinds, like a tablet's photo
// viewer. Only the horizontal delta counts (a vertical drag is scrolling
// intent, not a page turn) and it must clear a distance threshold so a tap
// or a scroll flick doesn't also fire a slide change.
const SWIPE_THRESHOLD = 50
let touchStartX = 0
let touchStartY = 0
function onTouchStart(e: TouchEvent) {
  if (props.editable || props.navEnabled === false) return
  const t = e.touches[0]
  touchStartX = t.clientX
  touchStartY = t.clientY
}
function onTouchEnd(e: TouchEvent) {
  // A pen stroke is not a swipe.
  if (props.editable || props.navEnabled === false || drawing.value) return
  const t = e.changedTouches[0]
  const dx = t.clientX - touchStartX
  const dy = t.clientY - touchStartY
  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return
  advance(dx < 0 ? 1 : -1)
}

let ro: ResizeObserver
onMounted(() => {
  fit()
  ro = new ResizeObserver(fit)
  if (stage.value) ro.observe(stage.value)
  window.addEventListener('keydown', onKey)
  window.addEventListener('blur', onWindowBlur)
  stage.value?.addEventListener('wheel', onWheel, { passive: false })
  stage.value?.addEventListener('touchstart', onTouchStart, { passive: true })
  stage.value?.addEventListener('touchend', onTouchEnd, { passive: true })
})
onUnmounted(() => {
  narration?.abort()
  ro?.disconnect()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('blur', onWindowBlur)
  stage.value?.removeEventListener('wheel', onWheel)
  stage.value?.removeEventListener('touchstart', onTouchStart)
  stage.value?.removeEventListener('touchend', onTouchEnd)
})
</script>

<template>
  <div ref="stage" class="dek-stage" :style="themeVars">
    <div
      ref="frame"
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
        :reveal="reveal"
        @patch="emit('patch', $event)"
        @config-patch="emit('config-patch', $event)"
        @upload="emit('upload', $event)"
        @update:elements="emit('update:elements', $event)"
        @update:selected-el="emit('update:selectedEl', $event)"
        @create-element="emit('create-element', $event)"
        @tool-reset="emit('tool-reset')"
        @element-image="(i, f) => emit('element-image', i, f)"
        @split="emit('split', { index: renderIndex, target: $event })"
        @drop-image="(f, t) => emit('drop-image', f, t)"
        @drop-link="(u, t) => emit('drop-link', u, t)"
        @ctxmenu="emit('ctxmenu', $event)"
      />
      <!-- Presenter ink (D). Drawn in slide coordinates, so it scales with
           the stage; it takes the pointer only while the pen is active. -->
      <svg
        v-if="drawing || ink[renderIndex]?.length"
        class="dek-ink"
        :class="{ pen: drawing }"
        :viewBox="`0 0 ${STAGE_W} ${STAGE_H}`"
        @pointerdown="drawing && onInkDown($event)"
        @pointermove="onInkMove"
        @pointerup="onInkUp"
        @pointercancel="onInkUp"
      >
        <path v-for="(st, k) in ink[renderIndex] ?? []" :key="k" :d="st.d" :style="{ stroke: st.color }" />
        <path v-if="live" :d="live.d" :style="{ stroke: live.color }" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.dek-ink {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 50;
  pointer-events: none;
  touch-action: none;
}
.dek-ink.pen {
  pointer-events: auto;
  /* A pen nib: a small accent dot, hotspot at its centre. */
  cursor:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Ccircle cx='6' cy='6' r='4' fill='%23fff' stroke='%23000' stroke-opacity='.5'/%3E%3C/svg%3E") 6 6,
    crosshair;
}
.dek-ink path {
  fill: none;
  stroke: var(--dek-accent2, #ffb474);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
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
