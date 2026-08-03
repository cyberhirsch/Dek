<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Focus } from '../core/types'
import { clampPan, panBounds } from '../render/pan'

const props = defineProps<{
  src?: string
  focus?: Focus
  fit?: 'cover' | 'contain'
  invert?: boolean
  desaturate?: boolean
  editable?: boolean
  pannable?: boolean // allow pan/zoom (only single-image layouts)
}>()
const emit = defineEmits<{
  'update:focus': [f: Focus]
  file: [f: File]
}>()

// Measured live: the picture's intrinsic size (once loaded) and the frame's
// rendered size. Together they say how much of the picture is hidden outside
// the frame, which is exactly how far a pan may travel — see render/pan.ts.
const root = ref<HTMLElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)
const natural = ref({ w: 0, h: 0 })
const frameSize = ref({ w: 0, h: 0 })
let frameObserver: ResizeObserver | null = null

function readNatural() {
  const img = imgEl.value
  if (img?.naturalWidth) natural.value = { w: img.naturalWidth, h: img.naturalHeight }
}
function readFrame() {
  const el = root.value
  if (el) frameSize.value = { w: el.clientWidth, h: el.clientHeight }
}
function boundsFor(scale: number) {
  return panBounds(natural.value, frameSize.value, props.fit ?? 'cover', scale)
}
/** Whether there's any hidden overflow left to drag into view at all. */
const canPan = computed(() => {
  const b = boundsFor(props.focus?.scale ?? 1)
  return b.x > 0.5 || b.y > 0.5
})

onMounted(() => {
  readNatural() // a cached image can already be complete before @load fires
  readFrame()
  frameObserver = new ResizeObserver(readFrame)
  if (root.value) frameObserver.observe(root.value)
})
onUnmounted(() => frameObserver?.disconnect())

const style = computed(() => {
  const f = props.focus ?? { x: 0, y: 0, scale: 1 }
  const filters = [props.desaturate && 'grayscale(1)', props.invert && 'invert(1)'].filter(Boolean)
  // Clamp on render too, not just while dragging: decks saved before pan was
  // bounded can hold an off-frame focus, and this pulls them back into view
  // without rewriting stored data.
  const b = boundsFor(f.scale)
  const x = clampPan(f.x, b.x)
  const y = clampPan(f.y, b.y)
  return {
    width: '100%',
    height: '100%',
    objectFit: props.fit ?? 'cover',
    transform: `translate(${x}px, ${y}px) scale(${f.scale})`,
    transformOrigin: 'center',
    ...(filters.length ? { filter: filters.join(' ') } : {}),
  } as Record<string, string>
})

// ── pan / zoom ──
const dragging = ref(false)
let start = { x: 0, y: 0 }
let origin = { x: 0, y: 0 }

function curFocus(): Focus {
  return { x: 0, y: 0, scale: 1, ...(props.focus ?? {}) }
}
function onMouseDown(e: MouseEvent) {
  if (!props.editable || !props.pannable) return
  dragging.value = true
  start = { x: e.clientX, y: e.clientY }
  const f = curFocus()
  // Start from the clamped position the user can actually see, so a drag that
  // begins on a stored out-of-bounds focus doesn't jump.
  const b = boundsFor(f.scale)
  origin = { x: clampPan(f.x, b.x), y: clampPan(f.y, b.y) }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
function onMove(e: MouseEvent) {
  if (!dragging.value) return
  const f = curFocus()
  const b = boundsFor(f.scale)
  emit('update:focus', {
    ...f,
    x: clampPan(origin.x + (e.clientX - start.x), b.x),
    y: clampPan(origin.y + (e.clientY - start.y), b.y),
  })
}
function onUp() {
  dragging.value = false
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
}
function onWheel(e: WheelEvent) {
  if (!props.editable || !props.pannable) return
  e.preventDefault()
  const f = curFocus()
  // Scale 1 is the fit baseline — the image exactly fills the frame (cover) or
  // sits fully inside it (contain). Below 1 it just shrinks within the frame,
  // leaving gaps that read as the image being "cropped" into a small box, and it
  // can't reveal more of a cover image (that content is already fitted). So 1 is
  // the floor: zoom in to crop/frame, never out past the natural fit.
  const scale = Math.max(1, Math.min(5, +(f.scale + (e.deltaY < 0 ? 0.06 : -0.06)).toFixed(2)))
  // Zooming back out shrinks the pannable range, so re-clamp: otherwise the
  // picture stays stranded at an offset that's now off-frame.
  const b = boundsFor(scale)
  emit('update:focus', { ...f, scale, x: clampPan(f.x, b.x), y: clampPan(f.y, b.y) })
}

// ── drop to replace ──
const over = ref(false)
function onDrop(e: DragEvent) {
  over.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) emit('file', file)
}
// `dragleave` also fires when the pointer crosses onto a child (the drop overlay,
// the replace button) — clearing `over` there made the "drop to replace" hint
// flicker. Only clear when the pointer actually leaves the frame.
function onDragLeave(e: DragEvent) {
  const to = e.relatedTarget as Node | null
  if (!to || !(e.currentTarget as HTMLElement).contains(to)) over.value = false
}

// ── click to browse ──
const fileEl = ref<HTMLInputElement | null>(null)
function pick() {
  fileEl.value?.click()
}
function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f && f.type.startsWith('image/')) emit('file', f)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div
    ref="root"
    class="fi"
    :class="{ editable, pannable: editable && pannable && canPan, dragging }"
    @mousedown="onMouseDown"
    @wheel="onWheel"
    @dragover.prevent="editable && (over = true)"
    @dragleave.prevent="onDragLeave($event)"
    @drop.prevent="editable && onDrop($event)"
  >
    <img v-if="src" ref="imgEl" :src="src" :style="style" alt="" draggable="false" @load="readNatural" />
    <div v-else class="img-empty" :class="{ clickable: editable }" @click="editable && pick()">
      {{ editable ? '＋ click or drop an image' : 'no image' }}
    </div>

    <!-- replace button for an existing image (editable) -->
    <button v-if="editable && src" class="fi-upload" title="Replace image" @click.stop="pick">⇄</button>

    <input ref="fileEl" type="file" accept="image/*" class="fi-input" @change="onPick" />

    <div v-if="over" class="fi-drop">drop to replace</div>
    <!-- "drag to pan" only when there's hidden overflow to drag into view;
         a fully-visible picture has nothing to pan to, so zoom leads instead. -->
    <div v-if="editable && pannable && src" class="fi-hint">
      {{ canPan ? 'drag to pan · scroll to zoom' : 'scroll to zoom in, then drag to pan' }} · click ⇄ or drop to replace
    </div>
  </div>
</template>

<style scoped>
.fi {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.fi.pannable {
  cursor: move;
}
.fi.editable {
  outline: 1px dashed rgba(127, 199, 255, 0.35);
  outline-offset: -1px;
}
.fi-drop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(40, 110, 200, 0.35);
  border: 3px dashed rgba(127, 199, 255, 0.8);
  color: #fff;
  font-size: 18px;
  z-index: 4;
}
.fi-hint {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.55);
  padding: 3px 8px;
  border-radius: 999px;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
  white-space: nowrap;
}
.fi:hover .fi-hint {
  opacity: 1;
}
.fi-input {
  display: none;
}
.img-empty.clickable {
  cursor: pointer;
}
.img-empty.clickable:hover {
  color: rgba(127, 199, 255, 0.85);
}
.fi-upload {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 4;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(7, 8, 9, 0.65);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}
.fi:hover .fi-upload {
  opacity: 1;
}
.fi-upload:hover {
  background: rgba(127, 199, 255, 0.4);
}
</style>
