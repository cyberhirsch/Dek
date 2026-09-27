<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Focus } from '../core/types'
import { clampPan, minScale, panBounds } from '../render/pan'
import { rememberNaturalSize } from '../render/naturalSize'
import { droppedImage, reportDropFailure, resolveDroppedImage } from '../render/dropImage'

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
  if (img?.naturalWidth) {
    natural.value = { w: img.naturalWidth, h: img.naturalHeight }
    // Share it: layouts use picture shapes too (gallery frames, columns).
    rememberNaturalSize(props.src, img.naturalWidth, img.naturalHeight)
  }
}
function readFrame() {
  const el = root.value
  if (el) frameSize.value = { w: el.clientWidth, h: el.clientHeight }
}
function boundsFor(scale: number) {
  return panBounds(natural.value, frameSize.value, props.fit ?? 'cover', scale)
}
/** The editing hint, shortened for narrow frames. A gallery cell can be
 *  ~250px wide, and the full sentence (~420px) would be clipped mid-word; the
 *  ⇄ button is visible on hover anyway, so the short form drops that part. */
const hint = computed(() => {
  const wide = frameSize.value.w >= 460
  if (canPan.value) return wide ? 'drag to pan · scroll to zoom · click ⇄ or drop to replace' : 'drag to pan · scroll to zoom'
  return wide ? 'scroll to zoom in, then drag to pan · click ⇄ or drop to replace' : 'scroll to zoom'
})
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
  const extra = filters.length ? { filter: filters.join(' ') } : {}
  const transform = `translate(${x}px, ${y}px) scale(${f.scale})`
  const { w: iw, h: ih } = natural.value
  const { w: fw, h: fh } = frameSize.value
  if (iw > 0 && ih > 0 && fw > 0 && fh > 0) {
    // The <img> box is the WHOLE fitted picture, centred and overflowing the
    // frame, which clips it. Not `object-fit` on a frame-sized box: that crops
    // inside the element, so pan slid an already-cropped picture (background
    // in, hidden sides never out) and zoom-out only shrank the crop.
    const k = props.fit === 'contain' ? Math.min(fw / iw, fh / ih) : Math.max(fw / iw, fh / ih)
    const dw = iw * k
    const dh = ih * k
    return {
      position: 'absolute',
      left: (fw - dw) / 2 + 'px',
      top: (fh - dh) / 2 + 'px',
      width: dw + 'px',
      height: dh + 'px',
      maxWidth: 'none',
      maxHeight: 'none',
      objectFit: 'fill',
      transform,
      transformOrigin: 'center',
      ...extra,
    } as Record<string, string>
  }
  // Until the picture and frame are measured, fit by CSS (no pan applies yet).
  return {
    width: '100%',
    height: '100%',
    objectFit: props.fit ?? 'cover',
    transform,
    transformOrigin: 'center',
    ...extra,
  } as Record<string, string>
})

// ── pan / zoom ──
const dragging = ref(false)
let start = { x: 0, y: 0 }
let origin = { x: 0, y: 0 }
let screenPerPx = 1

function curFocus(): Focus {
  return { x: 0, y: 0, scale: 1, ...(props.focus ?? {}) }
}
function onMouseDown(e: MouseEvent) {
  if (!props.editable || !props.pannable) return
  dragging.value = true
  start = { x: e.clientX, y: e.clientY }
  // The stage is CSS-scaled; pointer deltas are screen px, the pan is in the
  // frame's own px. Convert, so the picture tracks the cursor at any zoom.
  const el = root.value
  screenPerPx = el && el.clientWidth ? el.getBoundingClientRect().width / el.clientWidth || 1 : 1
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
    x: clampPan(origin.x + (e.clientX - start.x) / screenPerPx, b.x),
    y: clampPan(origin.y + (e.clientY - start.y) / screenPerPx, b.y),
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
  // Zoom out as far as the whole picture (render/pan.ts minScale): for cover
  // that's below 1, so the sides cover cropped away can be brought back.
  // Further out only shrinks the picture into a smaller box, so it stops there.
  const floor = minScale(natural.value, frameSize.value, props.fit ?? 'cover')
  const next = +(f.scale + (e.deltaY < 0 ? 0.06 : -0.06)).toFixed(2)
  const scale = Math.max(floor, Math.min(5, next))
  // Zooming back out shrinks the pannable range, so re-clamp: otherwise the
  // picture stays stranded at an offset that's now off-frame.
  const b = boundsFor(scale)
  emit('update:focus', { ...f, scale, x: clampPan(f.x, b.x), y: clampPan(f.y, b.y) })
}

// ── drop to replace ──
const over = ref(false)
const fetching = ref(false)
async function onDrop(e: DragEvent) {
  over.value = false
  // A picture dragged from another browser window usually arrives as its
  // address, not a file; read both now — the DataTransfer empties after this
  // handler returns — then fetch the address (render/dropImage.ts).
  const d = droppedImage(e.dataTransfer)
  if (!d.file && !d.url) return
  if (d.url) fetching.value = true
  const file = await resolveDroppedImage(d)
  fetching.value = false
  if (file) emit('file', file)
  else reportDropFailure()
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
    <div v-else-if="fetching" class="fi-drop">fetching the picture…</div>
    <!-- "drag to pan" only when there's hidden overflow to drag into view;
         a fully-visible picture has nothing to pan to, so zoom leads instead. -->
    <div v-if="editable && pannable && src" class="fi-hint">{{ hint }}</div>
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
