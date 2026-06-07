<script setup lang="ts">
// A compact color control: a swatch button that opens a popover of theme
// swatches (plus an optional transparent swatch and a custom-color picker).
// The popover is teleported to <body> so the toolbar's overflow: hidden can't
// clip it. Emits the chosen color string (a hex, or 'transparent').
import { onUnmounted, ref } from 'vue'

defineProps<{
  modelValue: string | undefined
  swatches: string[] // theme colors, in display order
  allowTransparent?: boolean
  /** Hex shown in the custom picker when the value is unset/transparent. */
  fallback?: string
  title?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const TRANSPARENT = 'transparent'
const open = ref(false)
const btn = ref<HTMLButtonElement | null>(null)
const pop = ref<HTMLDivElement | null>(null)
const pos = ref({ top: 0, left: 0 })

function isTransparent(c: string | undefined) {
  return !c || c === TRANSPARENT
}
function eq(a: string | undefined, b: string) {
  if (b === TRANSPARENT) return isTransparent(a)
  return (a ?? '').toLowerCase() === b.toLowerCase()
}

function place() {
  const r = btn.value?.getBoundingClientRect()
  if (r) pos.value = { top: r.bottom + 6, left: r.left }
}
function toggle() {
  open.value = !open.value
  if (open.value) {
    place()
    window.addEventListener('pointerdown', onOutside, true)
  } else {
    window.removeEventListener('pointerdown', onOutside, true)
  }
}
function close() {
  open.value = false
  window.removeEventListener('pointerdown', onOutside, true)
}
function onOutside(e: PointerEvent) {
  const t = e.target as Node
  if (btn.value?.contains(t) || pop.value?.contains(t)) return
  close()
}
function pick(c: string) {
  emit('update:modelValue', c)
  close()
}
function onCustom(e: Event) {
  // Live update while dragging the native picker; leave the popover open.
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

onUnmounted(() => window.removeEventListener('pointerdown', onOutside, true))
</script>

<template>
  <button
    ref="btn"
    class="cp-trigger"
    :class="{ checker: isTransparent(modelValue) }"
    :style="isTransparent(modelValue) ? {} : { background: modelValue }"
    :title="title"
    @click="toggle"
  />
  <Teleport to="body">
    <div
      v-if="open"
      ref="pop"
      class="cp-pop"
      :style="{ top: pos.top + 'px', left: pos.left + 'px' }"
    >
      <div class="cp-grid">
        <button
          v-for="c in swatches"
          :key="c"
          class="cp-sw"
          :class="{ sel: eq(modelValue, c) }"
          :style="{ background: c }"
          :title="c"
          @click="pick(c)"
        />
        <button
          v-if="allowTransparent"
          class="cp-sw checker"
          :class="{ sel: isTransparent(modelValue) }"
          title="Transparent"
          @click="pick(TRANSPARENT)"
        />
      </div>
      <label class="cp-custom">
        <input
          type="color"
          :value="isTransparent(modelValue) ? (fallback ?? '#7fc7ff') : modelValue"
          @input="onCustom"
        />
        <span>Custom…</span>
      </label>
    </div>
  </Teleport>
</template>

<style scoped>
.cp-trigger {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  cursor: pointer;
  padding: 0;
}
.cp-trigger:hover {
  border-color: rgba(255, 255, 255, 0.5);
}
/* Checkerboard to signal transparency. */
.checker {
  background-color: #2a2e36;
  background-image:
    linear-gradient(45deg, #555 25%, transparent 25%),
    linear-gradient(-45deg, #555 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #555 75%),
    linear-gradient(-45deg, transparent 75%, #555 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
}
.cp-pop {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: #1a1d24;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
}
.cp-grid {
  display: grid;
  grid-template-columns: repeat(5, 22px);
  gap: 6px;
}
.cp-sw {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  cursor: pointer;
  padding: 0;
}
.cp-sw:hover {
  transform: scale(1.08);
}
.cp-sw.sel {
  outline: 2px solid #7fc7ff;
  outline-offset: 1px;
}
.cp-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.7);
  cursor: pointer;
}
.cp-custom input[type='color'] {
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
}
</style>
