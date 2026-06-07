<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { SlideElement, BoxElement, ArrowElement, ImageElement, VideoElement, DiagramElement, CanvasTool } from '../core/types'
import { inlineMd, parseContent, htmlToInline } from '../render/inline'
import { newElement } from '../core/bake'
import { parseVideo, autoplaySrc } from '../render/video'
import FramedImage from './FramedImage.vue'
import MermaidDiagram from './MermaidDiagram.vue'

const STAGE_W = 1280

const props = defineProps<{
  elements: SlideElement[]
  editable?: boolean
  tool?: CanvasTool
  selected?: number | null
}>()

const emit = defineEmits<{
  'update:elements': [els: SlideElement[]]
  'update:selected': [i: number | null]
  /** A creation tool was used on the canvas — the parent decides whether to bake
   *  the slide to freeform first, then append this element. */
  create: [el: SlideElement]
  'tool-reset': []
}>()

const root = ref<HTMLElement | null>(null)
const editing = ref<number | null>(null) // index being text-edited

// Capture pointer events only when there's something to do here: a creation tool
// is active, or the slide actually has elements. Otherwise stay transparent so
// the underlying semantic layout (EditableText, image frames) stays clickable.
const interactive = computed(
  () => !!props.editable && ((props.tool && props.tool !== 'select') || props.elements.length > 0),
)

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]

function toStage(e: PointerEvent): { x: number; y: number } {
  const el = root.value!
  const r = el.getBoundingClientRect()
  const s = r.width / STAGE_W || 1
  return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
}

// ── element styles ──
function boxStyle(el: SlideElement) {
  const s: Record<string, string> = {
    left: el.x + 'px',
    top: el.y + 'px',
    width: el.w + 'px',
    height: el.h + 'px',
    transform: `rotate(${el.rotation ?? 0}deg)`,
  }
  if (el.type === 'box') {
    s.background = el.fill ?? 'transparent'
    s.border = `${el.strokeWidth ?? 0}px solid ${el.stroke ?? 'transparent'}`
    s.borderRadius = (el.radius ?? 0) + 'px'
  }
  return s
}
function resolveFont(font?: string): string {
  if (!font || font === 'body') return 'var(--dek-font-body)'
  if (font === 'heading') return 'var(--dek-font-heading)'
  return `'${font}', sans-serif`
}
function textStyle(el: BoxElement) {
  const deco = [el.underline ? 'underline' : '', el.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  // Inset the text so it never collides with a rounded corner: padding scales
  // with the corner radius (capped so the content area never collapses).
  const r = el.radius ?? 0
  const padX = Math.min(Math.max(10, r * 0.5), el.w / 2)
  const padY = Math.min(Math.max(6, r * 0.35), el.h / 2)
  return {
    fontFamily: resolveFont(el.font),
    fontSize: (el.size ?? 28) + 'px',
    textAlign: el.align ?? 'left',
    color: el.color ?? 'var(--dek-text)',
    // bold always wins (so the B button works); otherwise use an explicit weight
    // (e.g. 300 from a baked heading), defaulting to 400.
    fontWeight: el.bold ? '700' : el.weight != null ? String(el.weight) : '400',
    fontStyle: el.italic ? 'italic' : 'normal',
    textDecoration: deco || 'none',
    justifyContent: el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start',
    padding: `${padY}px ${padX}px`,
    borderRadius: 'inherit',
  } as Record<string, string>
}

// ── selection / creation ──
function onBackgroundDown(e: PointerEvent) {
  if (!props.editable) return
  if (props.tool && props.tool !== 'select') {
    const p = toStage(e)
    emit('create', newElement(props.tool, p.x, p.y))
    emit('tool-reset')
    return
  }
  emit('update:selected', null)
  if (editing.value != null) commitEdit()
}

function onElementDown(e: PointerEvent, i: number) {
  if (!props.editable) return
  if (props.tool && props.tool !== 'select') {
    onBackgroundDown(e)
    return
  }
  e.stopPropagation()
  emit('update:selected', i)
  if (editing.value != null && editing.value !== i) commitEdit()
  startDrag(e, i, 'move')
}

// ── transform engine ──
interface DragState {
  mode: 'move' | 'resize' | 'rotate'
  handle?: Handle
  index: number
  start: { x: number; y: number }
  orig: SlideElement
  cx: number
  cy: number
}
let drag: DragState | null = null
const draft = ref<SlideElement[] | null>(null)
const items = computed<SlideElement[]>(() => draft.value ?? props.elements)

function startDrag(e: PointerEvent, index: number, mode: 'move' | 'resize' | 'rotate', handle?: Handle) {
  if (editing.value != null) return
  e.preventDefault()
  e.stopPropagation()
  const orig = { ...props.elements[index] }
  draft.value = props.elements.map((el) => ({ ...el }))
  drag = {
    mode,
    handle,
    index,
    start: toStage(e),
    orig,
    cx: orig.x + orig.w / 2,
    cy: orig.y + orig.h / 2,
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragUp)
}

function onDragMove(e: PointerEvent) {
  if (!drag || !draft.value) return
  const p = toStage(e)
  const dx = p.x - drag.start.x
  const dy = p.y - drag.start.y
  const o = drag.orig
  const next = { ...draft.value[drag.index] }

  if (drag.mode === 'move') {
    next.x = Math.round(o.x + dx)
    next.y = Math.round(o.y + dy)
  } else if (drag.mode === 'resize') {
    const h = drag.handle!
    let x = o.x
    let y = o.y
    let w = o.w
    let hgt = o.h
    if (h.includes('e')) w = o.w + dx
    if (h.includes('s')) hgt = o.h + dy
    if (h.includes('w')) {
      x = o.x + dx
      w = o.w - dx
    }
    if (h.includes('n')) {
      y = o.y + dy
      hgt = o.h - dy
    }
    const MINW = 12
    const MINH = next.type === 'arrow' ? 0 : 12
    if (w < MINW) {
      if (h.includes('w')) x = o.x + o.w - MINW
      w = MINW
    }
    if (hgt < MINH) {
      if (h.includes('n')) y = o.y + o.h - MINH
      hgt = MINH
    }
    next.x = Math.round(x)
    next.y = Math.round(y)
    next.w = Math.round(w)
    next.h = Math.round(hgt)
  } else {
    let deg = (Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180) / Math.PI + 90
    if (e.shiftKey) deg = Math.round(deg / 15) * 15
    next.rotation = Math.round(deg)
  }

  draft.value[drag.index] = next
}

function onDragUp() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragUp)
  if (draft.value) emit('update:elements', draft.value)
  draft.value = null
  drag = null
}

function onHandleDown(e: PointerEvent, i: number, h: Handle) {
  startDrag(e, i, 'resize', h)
}
function onRotateDown(e: PointerEvent, i: number) {
  startDrag(e, i, 'rotate')
}

// ── text inline editing ──
function onElementDblClick(i: number) {
  if (!props.editable) return
  if (props.elements[i].type !== 'box') return
  editing.value = i
  emit('update:selected', i)
  nextTick(() => {
    const node = root.value?.querySelector<HTMLElement>(`[data-edit="${i}"]`)
    if (node) {
      node.focus()
      const range = document.createRange()
      range.selectNodeContents(node)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  })
}
function commitEdit() {
  const i = editing.value
  if (i == null) return
  const node = root.value?.querySelector<HTMLElement>(`[data-edit="${i}"]`)
  editing.value = null
  if (!node) return
  const content = htmlToInline(node.innerHTML).replace(/\n+$/, '')
  if (content !== (props.elements[i] as BoxElement).content) {
    const next = props.elements.map((el) => ({ ...el }))
    ;(next[i] as BoxElement).content = content
    emit('update:elements', next)
  }
}

// ── video element playback ──
const playing = ref<Set<number>>(new Set())
function videoPoster(el: VideoElement) {
  return el.poster || parseVideo(el.video)?.thumb || ''
}
function playVideo(i: number, el: VideoElement) {
  if (!parseVideo(el.video)) return
  playing.value = new Set(playing.value).add(i)
}
function videoSrc(el: VideoElement) {
  const pv = parseVideo(el.video)
  return pv ? autoplaySrc(pv) : ''
}
function isFileVideo(el: VideoElement) {
  return parseVideo(el.video)?.provider === 'file'
}

// type-narrowing helpers for the template
const asBox = (el: SlideElement) => el as BoxElement
const asArrow = (el: SlideElement) => el as ArrowElement
const asImage = (el: SlideElement) => el as ImageElement
const asVideo = (el: SlideElement) => el as VideoElement
const asDiagram = (el: SlideElement) => el as DiagramElement

defineExpose({ commitEdit })
</script>

<template>
  <div
    ref="root"
    class="canvas-layer"
    :class="{ editable, creating: editable && tool && tool !== 'select' }"
    :style="{ pointerEvents: interactive ? 'auto' : 'none' }"
    @pointerdown="onBackgroundDown"
  >
    <div
      v-for="(el, i) in items"
      :key="i"
      class="el"
      :class="['el-' + el.type, { selected: editable && selected === i && editing == null }]"
      :style="boxStyle(el)"
      @pointerdown="onElementDown($event, i)"
      @dblclick="onElementDblClick(i)"
    >
      <!-- box: shape (via the element's own bg/border) + optional text -->
      <template v-if="el.type === 'box'">
        <div
          v-if="editing === i"
          class="el-text-body editing"
          :style="textStyle(asBox(el))"
          :data-edit="i"
          data-rich
          contenteditable="true"
          spellcheck="false"
          @pointerdown.stop
          @blur="commitEdit"
          @keydown.escape.prevent="commitEdit"
          v-html="inlineMd(asBox(el).content)"
        />
        <div v-else class="el-text-body" :style="textStyle(asBox(el))">
          <div
            v-for="(row, ri) in parseContent(asBox(el).content)"
            :key="ri"
            class="el-line"
            :class="{ bullet: row.bullet }"
            v-html="inlineMd(row.text)"
          />
        </div>
      </template>

      <!-- arrow -->
      <svg
        v-else-if="el.type === 'arrow'"
        class="el-arrow"
        :width="el.w"
        :height="Math.max(el.h, 1)"
        :viewBox="`0 0 ${el.w} ${Math.max(el.h, 1)}`"
        preserveAspectRatio="none"
        overflow="visible"
      >
        <defs>
          <marker :id="`ah-${i}`" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" :fill="asArrow(el).stroke ?? '#e6ecf2'" />
          </marker>
        </defs>
        <line
          x1="0"
          :y1="el.h / 2"
          :x2="el.w"
          :y2="el.h / 2"
          :stroke="asArrow(el).stroke ?? '#e6ecf2'"
          :stroke-width="asArrow(el).strokeWidth ?? 3"
          :marker-end="`url(#ah-${i})`"
        />
      </svg>

      <!-- image -->
      <FramedImage v-else-if="el.type === 'image'" :src="asImage(el).src" :focus="asImage(el).focus" :fit="asImage(el).fit ?? 'cover'" />

      <!-- video -->
      <div v-else-if="el.type === 'video'" class="el-video">
        <template v-if="playing.has(i)">
          <iframe v-if="!isFileVideo(asVideo(el))" :src="videoSrc(asVideo(el))" allow="autoplay; encrypted-media; fullscreen" allowfullscreen />
          <video v-else :src="asVideo(el).video" controls autoplay />
        </template>
        <template v-else>
          <FramedImage :src="videoPoster(asVideo(el))" fit="contain" />
          <button class="vid-play" title="Play" @click.stop="playVideo(i, asVideo(el))" @pointerdown.stop><span class="tri" /></button>
        </template>
      </div>

      <!-- diagram -->
      <div v-else-if="el.type === 'diagram'" class="el-diagram">
        <MermaidDiagram :code="asDiagram(el).code" />
      </div>

      <!-- selection chrome -->
      <template v-if="editable && selected === i && editing == null">
        <span class="rot-line" />
        <span class="handle rot" @pointerdown="onRotateDown($event, i)" />
        <span
          v-for="h in HANDLES"
          :key="h"
          class="handle"
          :class="'h-' + h"
          @pointerdown="onHandleDown($event, i, h)"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.canvas-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
}
.canvas-layer.creating {
  cursor: crosshair;
}
.el {
  position: absolute;
  transform-origin: center center;
  box-sizing: border-box;
}
.canvas-layer.editable .el {
  cursor: move;
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
.el-text-body.editing {
  display: block;
  white-space: pre-wrap;
}
.el-line {
  position: relative;
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
.el-text-body.editing {
  outline: none;
  cursor: text;
  background: rgba(127, 199, 255, 0.08);
}
.el-arrow {
  display: block;
  overflow: visible;
}
.el-video {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}
.el-video iframe,
.el-video video {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
/* play button stays clickable even when the layer is non-interactive (present mode) */
.el-video .vid-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
}
.el-video .vid-play:hover { background: rgba(0, 0, 0, 0.75); }
.el-video .tri {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 13px 0 13px 22px;
  border-color: transparent transparent transparent #fff;
  margin-left: 4px;
}
.el-diagram {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
/* selection */
.el.selected::after {
  content: '';
  position: absolute;
  inset: -2px;
  border: 1.5px solid #7fc7ff;
  pointer-events: none;
}
.handle {
  position: absolute;
  width: 11px;
  height: 11px;
  background: #fff;
  border: 1.5px solid #7fc7ff;
  border-radius: 2px;
  z-index: 5;
}
.handle.rot {
  border-radius: 50%;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  cursor: grab;
}
.rot-line {
  position: absolute;
  top: -22px;
  left: 50%;
  width: 1px;
  height: 22px;
  background: #7fc7ff;
  transform: translateX(-50%);
  pointer-events: none;
}
.h-nw { top: -6px; left: -6px; cursor: nwse-resize; }
.h-n  { top: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
.h-ne { top: -6px; right: -6px; cursor: nesw-resize; }
.h-e  { top: 50%; right: -6px; transform: translateY(-50%); cursor: ew-resize; }
.h-se { bottom: -6px; right: -6px; cursor: nwse-resize; }
.h-s  { bottom: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
.h-sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
.h-w  { top: 50%; left: -6px; transform: translateY(-50%); cursor: ew-resize; }
</style>
