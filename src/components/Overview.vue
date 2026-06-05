<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { Deck } from '../core/types'
import SlideThumb from './SlideThumb.vue'

defineProps<{ deck: Deck; current: number }>()
const emit = defineEmits<{ jump: [i: number]; close: [] }>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' || e.key.toLowerCase() === 'o') {
    e.preventDefault()
    emit('close')
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="ov" @click.self="emit('close')">
    <div class="ov-head">
      <span>Overview — {{ deck.slides.length }} slides</span>
      <button @click="emit('close')">Close (Esc)</button>
    </div>
    <div class="ov-grid">
      <button
        v-for="(s, i) in deck.slides"
        :key="i"
        class="cell"
        :class="{ active: i === current }"
        @click="emit('jump', i); emit('close')"
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
.cell.active { border-color: #7fc7ff; }
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
