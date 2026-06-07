<script setup lang="ts">
// A live Markdown source pane: shows the exact .md the deck serializes to, and
// (Tier 2) parses edits back into the deck. The conversion engine already runs
// in the browser (core/deck.ts is pure TS), so this is a thin two-way bridge.
import { ref, watch } from 'vue'
import type { Deck } from '../core/types'
import { parseDeck, serializeDeck } from '../core/deck'

const props = defineProps<{ deck: Deck }>()
const emit = defineEmits<{ apply: [Deck]; close: [] }>()

const text = ref(serializeDeck(props.deck))
const error = ref<string | null>(null)
let focused = false
let timer: ReturnType<typeof setTimeout> | null = null

// ── horizontal resize (drag the left edge) ──
const width = ref(420)
let startX = 0
let startW = 0
function onResizeDown(e: PointerEvent) {
  e.preventDefault()
  startX = e.clientX
  startW = width.value
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeUp)
}
function onResizeMove(e: PointerEvent) {
  // pane is docked right, so dragging the left edge leftward widens it
  width.value = Math.max(280, Math.min(window.innerWidth - 360, startW + (startX - e.clientX)))
}
function onResizeUp() {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeUp)
}

// Regenerate the source whenever the deck changes elsewhere (visual edits) —
// but never while the user is typing here, or it would fight their cursor.
watch(
  () => props.deck,
  () => {
    if (!focused) {
      text.value = serializeDeck(props.deck)
      error.value = null
    }
  },
  { deep: true },
)

function parseAndApply() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  try {
    const d = parseDeck(text.value)
    error.value = null
    emit('apply', d)
  } catch (e) {
    // Mid-typing the YAML is often momentarily invalid — keep the last good deck
    // and just surface the message instead of clobbering anything.
    error.value = (e as Error).message
  }
}
function onInput(e: Event) {
  text.value = (e.target as HTMLTextAreaElement).value
  if (timer) clearTimeout(timer)
  timer = setTimeout(parseAndApply, 400)
}
function onFocus() {
  focused = true
}
function onBlur() {
  focused = false
  parseAndApply()
}
</script>

<template>
  <aside class="source-pane" :style="{ width: width + 'px' }">
    <div class="sp-resizer" title="Drag to resize" @pointerdown="onResizeDown" />
    <header class="sp-head">
      <span class="sp-title">Markdown source</span>
      <span v-if="error" class="sp-status err" :title="error">parse error</span>
      <span v-else class="sp-status ok">in sync</span>
      <button class="sp-close" title="Close source view" @click="emit('close')">✕</button>
    </header>
    <textarea
      class="sp-text"
      spellcheck="false"
      :value="text"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
    />
    <div v-if="error" class="sp-error">{{ error }}</div>
  </aside>
</template>

<style scoped>
.source-pane {
  position: relative;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #101216;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'JetBrains Mono', monospace;
}
.sp-resizer {
  position: absolute;
  top: 0;
  left: -3px;
  width: 7px;
  height: 100%;
  cursor: ew-resize;
  z-index: 6;
}
.sp-resizer:hover {
  background: rgba(127, 199, 255, 0.25);
}
.sp-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.sp-title {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
  color: rgba(230, 236, 242, 0.45);
}
.sp-status {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
}
.sp-status.ok {
  color: #4ade80;
  background: rgba(74, 222, 128, 0.1);
}
.sp-status.err {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
}
.sp-close {
  margin-left: auto;
  background: transparent;
  border: none;
  color: rgba(230, 236, 242, 0.5);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
}
.sp-close:hover {
  color: #fff;
}
.sp-text {
  flex: 1;
  min-height: 0;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: #d6deea;
  padding: 12px;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.55;
  tab-size: 2;
  white-space: pre;
  overflow: auto;
}
.sp-text::selection {
  background: rgba(127, 199, 255, 0.3);
}
.sp-error {
  flex: none;
  max-height: 96px;
  overflow: auto;
  padding: 8px 12px;
  background: rgba(248, 113, 113, 0.08);
  border-top: 1px solid rgba(248, 113, 113, 0.25);
  color: #fca5a5;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
}
</style>
