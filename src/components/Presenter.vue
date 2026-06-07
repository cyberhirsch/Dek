<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Deck } from '../core/types'
import SlideThumb from './SlideThumb.vue'

const props = defineProps<{ deck: Deck; current: number }>()
const emit = defineEmits<{ 'update:current': [i: number]; close: [] }>()

const slide = computed(() => props.deck.slides[props.current])
const next = computed(() => props.deck.slides[props.current + 1])

function go(d: number) {
  const i = Math.max(0, Math.min(props.deck.slides.length - 1, props.current + d))
  emit('update:current', i)
}

// timer
const elapsed = ref(0)
let iv: ReturnType<typeof setInterval>
const clock = computed(() => {
  const m = Math.floor(elapsed.value / 60)
  const s = elapsed.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
function reset() {
  elapsed.value = 0
}

// resizable side pane (drag the divider so notes can be bigger or smaller)
const sideW = ref(420)
let rsx = 0
let rsw = 0
function onSideDown(e: PointerEvent) {
  e.preventDefault()
  rsx = e.clientX
  rsw = sideW.value
  window.addEventListener('pointermove', onSideMove)
  window.addEventListener('pointerup', onSideUp)
}
function onSideMove(e: PointerEvent) {
  sideW.value = Math.max(240, Math.min(window.innerWidth - 360, rsw + (rsx - e.clientX)))
}
function onSideUp() {
  window.removeEventListener('pointermove', onSideMove)
  window.removeEventListener('pointerup', onSideUp)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p' || e.key.toLowerCase() === 's') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault()
    go(1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    go(-1)
  }
}
onMounted(() => {
  iv = setInterval(() => elapsed.value++, 1000)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  clearInterval(iv)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="pres">
    <div class="pres-head">
      <span>Presenter view</span>
      <div class="timer">
        <span class="clock">{{ clock }}</span>
        <button @click="reset">reset</button>
      </div>
      <button class="close" @click="emit('close')">Exit (Esc)</button>
    </div>

    <div class="pres-body">
      <div class="main">
        <div class="label">Current · {{ current + 1 }} / {{ deck.slides.length }}</div>
        <SlideThumb :slide="slide" :config="deck.config" :index="current" :total="deck.slides.length" :width="640" />
        <div class="nav">
          <button :disabled="current === 0" @click="go(-1)">← Prev</button>
          <button :disabled="current >= deck.slides.length - 1" @click="go(1)">Next →</button>
        </div>
      </div>

      <div class="side-resizer" title="Drag to resize" @pointerdown="onSideDown" />

      <div class="side" :style="{ flex: 'none', width: sideW + 'px' }">
        <div class="next">
          <div class="label">Next</div>
          <SlideThumb v-if="next" :slide="next" :config="deck.config" :index="current + 1" :total="deck.slides.length" :width="300" />
          <div v-else class="end">— end —</div>
        </div>
        <div class="notes">
          <div class="label">Speaker notes</div>
          <div class="notes-body">{{ slide?.notes || 'No notes for this slide.' }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pres {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: #050506;
  display: flex;
  flex-direction: column;
  font-family: 'JetBrains Mono', monospace;
  color: #e6ecf2;
}
.pres-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  font-size: 13px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.timer {
  display: flex;
  align-items: center;
  gap: 10px;
}
.clock {
  font-size: 22px;
  color: var(--dek-accent, #7fc7ff);
}
.timer button,
.close {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 7px;
  padding: 4px 10px;
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
}
.pres-body {
  flex: 1;
  display: flex;
  gap: 24px;
  padding: 24px;
  min-height: 0;
}
.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.side-resizer {
  flex: none;
  width: 8px;
  margin: 0 -8px 0 0;
  cursor: ew-resize;
  border-radius: 4px;
}
.side-resizer:hover {
  background: rgba(127, 199, 255, 0.3);
}
.side {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.label {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.45);
  margin-bottom: 8px;
}
.nav {
  display: flex;
  gap: 10px;
}
.nav button {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
}
.nav button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.notes {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.notes-body {
  flex: 1;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px;
  font-size: 16px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: #e6ecf2;
}
.end {
  color: rgba(230, 236, 242, 0.4);
  padding: 20px 0;
}
</style>
