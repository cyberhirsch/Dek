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
    <div v-else class="img-empty">{{ editable ? 'drop image here' : 'no image' }}</div>

    <div v-if="over" class="fi-drop">drop to replace</div>
    <div v-if="editable && pannable && src" class="fi-hint">drag to pan · scroll to zoom · drop to replace</div>
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
</style>
