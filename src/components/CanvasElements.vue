<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { SlideElement, TextElement, RectElement, ArrowElement, ImageElement } from '../core/types'
import { inlineMd } from '../render/inline'
import { newElement } from '../core/bake'
import FramedImage from './FramedImage.vue'

const STAGE_W = 1280

const props = defineProps<{
  elements: SlideElement[]
  editable?: boolean
  tool?: 'select' | 'text' | 'rect' | 'arrow'
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

// While transforming, render from this local draft for smoothness; commit on up.
const draft = ref<SlideElement[] | null>(null)
const items = computed<SlideElement[]>(() => draft.value ?? props.elements)

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
  return {
    left: el.x + 'px',
    top: el.y + 'px',
    width: el.w + 'px',
    height: el.h + 'px',
    transform: `rotate(${el.rotation ?? 0}deg)`,
  } as Record<string, string>
}
function textStyle(el: TextElement) {
  return {
    fontSize: (el.size ?? 28) + 'px',
    textAlign: el.align ?? 'left',
    color: el.color ?? 'var(--text)',
    fontWeight: el.bold ? '700' : '400',
    justifyContent: el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start',
  } as Record<string, string>
}
function rectStyle(el: RectElement) {
  return {
    background: el.fill ?? 'transparent',
    border: `${el.strokeWidth ?? 2}px solid ${el.stroke ?? 'transparent'}`,
    borderRadius: (el.radius ?? 0) + 'px',
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
    // creating: let the background handler place a new element instead
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
    let { x, y, w, hgt } = { x: o.x, y: o.y, w: o.w, hgt: o.h }
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
    // rotate
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
  const el = props.elements[i]
  if (el.type !== 'text') return
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
  const content = node.innerText.replace(/\n+$/, '')
  if (content !== (props.elements[i] as TextElement).content) {
    const next = props.elements.map((el) => ({ ...el }))
    ;(next[i] as TextElement).content = content
    emit('update:elements', next)
  }
}

// type narrowing helpers for the template
const asText = (el: SlideElement) => el as TextElement
const asRect = (el: SlideElement) => el as RectElement
const asArrow = (el: SlideElement) => el as ArrowElement
const asImage = (el: SlideElement) => el as ImageElement

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
      <!-- text -->
      <template v-if="el.type === 'text'">
        <div
          v-if="editing === i"
          class="el-text-body editing"
          :style="textStyle(asText(el))"
          :data-edit="i"
          contenteditable="true"
          spellcheck="false"
          @pointerdown.stop
          @blur="commitEdit"
          @keydown.escape.prevent="commitEdit"
        >{{ asText(el).content }}</div>
        <div v-else class="el-text-body" :style="textStyle(asText(el))" v-html="inlineMd(asText(el).content)" />
      </template>

      <!-- rectangle -->
      <div v-else-if="el.type === 'rect'" class="el-rect" :style="rectStyle(asRect(el))" />

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
}
.canvas-layer.editable .el {
  cursor: move;
}
.el-text-body {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  font-family: var(--font-body);
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
}
.el-text-body.editing {
  outline: none;
  cursor: text;
  background: rgba(127, 199, 255, 0.08);
}
.el-rect {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}
.el-arrow {
  display: block;
  overflow: visible;
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
