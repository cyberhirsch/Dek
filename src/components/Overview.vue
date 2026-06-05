<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { Deck } from '../core/types'
import SlideThumb from './SlideThumb.vue'

const props = defineProps<{ deck: Deck; current: number }>()
const emit = defineEmits<{ jump: [i: number]; close: [] }>()

const grid = ref<HTMLElement | null>(null)
const focus = ref(props.current)

function columns(): number {
  const g = grid.value
  if (!g) return 1
  const first = g.querySelector('.cell') as HTMLElement | null
  if (!first) return 1
  const gap = 16
  return Math.max(1, Math.round((g.clientWidth + gap) / (first.offsetWidth + gap)))
}

function move(delta: number) {
  const max = props.deck.slides.length - 1
  focus.value = Math.max(0, Math.min(max, focus.value + delta))
  nextTick(() => {
    grid.value?.querySelectorAll('.cell')[focus.value]?.scrollIntoView({ block: 'nearest' })
  })
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
    move(columns())
  } else if (k === 'ArrowUp') {
    e.preventDefault()
    move(-columns())
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
  nextTick(() => grid.value?.querySelectorAll('.cell')[focus.value]?.scrollIntoView({ block: 'center' }))
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="ov" @click.self="emit('close')">
    <div class="ov-head">
      <span>Overview — {{ deck.slides.length }} slides</span>
      <button @click="emit('close')">Close (Esc)</button>
    </div>
    <div ref="grid" class="ov-grid">
      <button
        v-for="(s, i) in deck.slides"
        :key="i"
        class="cell"
        :class="{ active: i === current, focused: i === focus }"
        @click="emit('jump', i); emit('close')"
        @mouseenter="focus = i"
      >
        <span class="n">{{ i + 1 }}</span>
        <span v-if="s.group" class="g">{{ s.group }}</span>
        <SlideThumb :slide="s" :config="deck.config" :index="i" :total="deck.slides.length" :width="220" />
      </button>
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  padding: 20px;
  align-content: start;
}
.cell {
  position: relative;
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
