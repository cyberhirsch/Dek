<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { Deck } from '../core/types'
import SlideThumb from './SlideThumb.vue'

const props = defineProps<{ deck: Deck; current: number }>()
const emit = defineEmits<{ jump: [i: number]; close: [] }>()

const grid = ref<HTMLElement | null>(null)
const focus = ref(props.current)
const scrollTop = ref(0)
const viewW = ref(1)
const viewH = ref(1)
const CELL_W = 220
const CELL_H = 124
const GAP = 16
const OVERSCAN_ROWS = 2

const columns = computed(() => Math.max(1, Math.floor((viewW.value + GAP) / (CELL_W + GAP))))
const rows = computed(() => Math.ceil(props.deck.slides.length / columns.value))
const totalHeight = computed(() => rows.value * (CELL_H + GAP) - GAP)
const visibleRange = computed(() => {
  const row0 = Math.max(0, Math.floor(scrollTop.value / (CELL_H + GAP)) - OVERSCAN_ROWS)
  const row1 = Math.min(rows.value - 1, Math.ceil((scrollTop.value + viewH.value) / (CELL_H + GAP)) + OVERSCAN_ROWS)
  return {
    start: row0 * columns.value,
    end: Math.min(props.deck.slides.length, (row1 + 1) * columns.value),
  }
})
const visible = computed(() => {
  const out: { index: number; top: number; left: number }[] = []
  for (let i = visibleRange.value.start; i < visibleRange.value.end; i++) {
    out.push({
      index: i,
      top: Math.floor(i / columns.value) * (CELL_H + GAP),
      left: (i % columns.value) * (CELL_W + GAP),
    })
  }
  return out
})

function syncViewport() {
  if (!grid.value) return
  scrollTop.value = grid.value.scrollTop
  viewW.value = grid.value.clientWidth
  viewH.value = grid.value.clientHeight
}

function scrollFocusIntoView(block: ScrollLogicalPosition = 'nearest') {
  nextTick(() => {
    const g = grid.value
    if (!g) return
    const top = Math.floor(focus.value / columns.value) * (CELL_H + GAP)
    const bottom = top + CELL_H
    if (block === 'center') g.scrollTop = Math.max(0, top - (g.clientHeight - CELL_H) / 2)
    else if (top < g.scrollTop) g.scrollTop = top
    else if (bottom > g.scrollTop + g.clientHeight) g.scrollTop = bottom - g.clientHeight
    syncViewport()
  })
}

function move(delta: number) {
  const max = props.deck.slides.length - 1
  focus.value = Math.max(0, Math.min(max, focus.value + delta))
  scrollFocusIntoView()
}

function onKey(e: KeyboardEvent) {
  const k = e.key
  if (k === 'Escape' || k.toLowerCase() === 'o') {
    e.preventDefault()
    emit('close')
  } else if (k === 'ArrowRight') {
    e.preventDefault()
    move(1)
  } else if (k === 'ArrowLeft') {
    e.preventDefault()
    move(-1)
  } else if (k === 'ArrowDown') {
    e.preventDefault()
    move(columns.value)
  } else if (k === 'ArrowUp') {
    e.preventDefault()
    move(-columns.value)
  } else if (k === 'Home') {
    e.preventDefault()
    move(-1e9)
  } else if (k === 'End') {
    e.preventDefault()
    move(1e9)
  } else if (k === 'Enter') {
    e.preventDefault()
    emit('jump', focus.value)
    emit('close')
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  syncViewport()
  ro = new ResizeObserver(syncViewport)
  if (grid.value) ro.observe(grid.value)
  scrollFocusIntoView('center')
})
let ro: ResizeObserver | null = null
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  ro?.disconnect()
})
</script>

<template>
  <div class="ov" @click.self="emit('close')">
    <div class="ov-head">
      <span>Overview — {{ deck.slides.length }} slides</span>
      <button @click="emit('close')">Close (Esc)</button>
    </div>
    <div ref="grid" class="ov-grid" @scroll="syncViewport">
      <div class="ov-canvas" :style="{ height: totalHeight + 'px', width: columns * (CELL_W + GAP) - GAP + 'px' }">
      <button
        v-for="cell in visible"
        :key="cell.index"
        class="cell"
        :class="{ active: cell.index === current, focused: cell.index === focus }"
        :style="{ transform: `translate(${cell.left}px, ${cell.top}px)`, width: CELL_W + 'px', height: CELL_H + 'px' }"
        @click="emit('jump', cell.index); emit('close')"
        @mouseenter="focus = cell.index"
      >
        <span class="n">{{ cell.index + 1 }}</span>
        <span v-if="deck.slides[cell.index].group" class="g">{{ deck.slides[cell.index].group }}</span>
        <SlideThumb :slide="deck.slides[cell.index]" :config="deck.config" :index="cell.index" :total="deck.slides.length" :width="220" />
      </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ov {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(5, 5, 6, 0.96);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  font-family: 'JetBrains Mono', monospace;
  color: #e6ecf2;
}
.ov-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.ov-head button {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 7px;
  padding: 5px 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.ov-grid {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.ov-canvas {
  position: relative;
  margin: 0 auto;
}
.cell {
  position: absolute;
  top: 0;
  left: 0;
  background: none;
  border: 2px solid transparent;
  border-radius: 7px;
  padding: 0;
  cursor: pointer;
  display: flex;
}
.cell:hover { border-color: rgba(127, 199, 255, 0.5); }
.cell.focused { border-color: rgba(127, 199, 255, 0.7); }
.cell.active { border-color: #7fc7ff; box-shadow: 0 0 0 2px rgba(127, 199, 255, 0.4); }
.cell .n {
  position: absolute;
  top: 4px;
  left: 6px;
  z-index: 2;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.55);
  padding: 1px 6px;
  border-radius: 4px;
}
.cell .g {
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 2;
  font-size: 10px;
  color: var(--dek-accent, #7fc7ff);
  background: rgba(0, 0, 0, 0.55);
  padding: 1px 6px;
  border-radius: 4px;
  max-width: 60%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
