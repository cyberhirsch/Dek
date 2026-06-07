<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Focus } from '../core/types'

const props = defineProps<{
  src?: string
  focus?: Focus
  fit?: 'cover' | 'contain'
  editable?: boolean
  pannable?: boolean // allow pan/zoom (only single-image layouts)
}>()
const emit = defineEmits<{
  'update:focus': [f: Focus]
  file: [f: File]
}>()

const style = computed(() => {
  const f = props.focus ?? { x: 0, y: 0, scale: 1 }
  return {
    width: '100%',
    height: '100%',
    objectFit: props.fit ?? 'cover',
    transform: `translate(${f.x}px, ${f.y}px) scale(${f.scale})`,
    transformOrigin: 'center',
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
  origin = { x: f.x, y: f.y }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
function onMove(e: MouseEvent) {
  if (!dragging.value) return
  const f = curFocus()
  emit('update:focus', { ...f, x: origin.x + (e.clientX - start.x), y: origin.y + (e.clientY - start.y) })
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
  const scale = Math.max(0.3, Math.min(5, +(f.scale + (e.deltaY < 0 ? 0.06 : -0.06)).toFixed(2)))
  emit('update:focus', { ...f, scale })
}

// ── drop to replace ──
const over = ref(false)
function onDrop(e: DragEvent) {
  over.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) emit('file', file)
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
    class="fi"
    :class="{ editable, pannable: editable && pannable, dragging }"
    @mousedown="onMouseDown"
    @wheel="onWheel"
    @dragover.prevent="editable && (over = true)"
    @dragleave.prevent="over = false"
    @drop.prevent="editable && onDrop($event)"
  >
    <img v-if="src" :src="src" :style="style" alt="" draggable="false" />
    <div v-else class="img-empty" :class="{ clickable: editable }" @click="editable && pick()">
      {{ editable ? '＋ click or drop an image' : 'no image' }}
    </div>

    <!-- replace button for an existing image (editable) -->
    <button v-if="editable && src" class="fi-upload" title="Replace image" @click.stop="pick">⇄</button>

    <input ref="fileEl" type="file" accept="image/*" class="fi-input" @change="onPick" />

    <div v-if="over" class="fi-drop">drop to replace</div>
    <div v-if="editable && pannable && src" class="fi-hint">drag to pan · scroll to zoom · click ⇄ or drop to replace</div>
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
