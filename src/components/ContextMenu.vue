<script lang="ts">
// One menu entry. A divider is a thin rule; everything else is a clickable row
// that runs its `action` and closes the menu. `check` shows a leading tick (for
// toggles like image fit); `hint` is a right-aligned shortcut reminder.
export interface CtxItem {
  label: string
  hint?: string
  action?: () => void
  disabled?: boolean
  check?: boolean
}
export interface CtxDivider {
  divider: true
}
export type CtxEntry = CtxItem | CtxDivider

export const isDivider = (e: CtxEntry): e is CtxDivider => 'divider' in e
</script>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{ x: number; y: number; items: CtxEntry[] }>()
const emit = defineEmits<{ close: [] }>()

const root = ref<HTMLElement | null>(null)
const pos = ref({ left: props.x, top: props.y })
const active = ref(-1)

const selectable = () =>
  props.items.flatMap((it, i) => (!isDivider(it) && !it.disabled ? [i] : []))

function run(it: CtxEntry) {
  if (isDivider(it) || it.disabled) return
  it.action?.()
  emit('close')
}
function move(dir: 1 | -1) {
  const sel = selectable()
  if (!sel.length) return
  const cur = sel.indexOf(active.value)
  active.value = sel[(cur + dir + sel.length) % sel.length]
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    move(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    move(-1)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const it = props.items[active.value]
    if (it) run(it)
  }
}
const closeNow = () => emit('close')
function onDocPointer(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) emit('close')
}

onMounted(async () => {
  window.addEventListener('keydown', onKey, true)
  // Capture phase so the very next click anywhere dismisses the menu first.
  window.addEventListener('pointerdown', onDocPointer, true)
  window.addEventListener('resize', closeNow)
  window.addEventListener('wheel', closeNow, { passive: true })
  // Clamp inside the viewport once we know the menu's size.
  await nextTick()
  const el = root.value
  if (!el) return
  const r = el.getBoundingClientRect()
  let left = props.x
  let top = props.y
  if (left + r.width > window.innerWidth) left = window.innerWidth - r.width - 8
  if (top + r.height > window.innerHeight) top = window.innerHeight - r.height - 8
  pos.value = { left: Math.max(4, left), top: Math.max(4, top) }
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('resize', closeNow)
  window.removeEventListener('wheel', closeNow)
})
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="ctx" :style="{ left: pos.left + 'px', top: pos.top + 'px' }" @contextmenu.prevent>
      <template v-for="(it, i) in items" :key="i">
        <div v-if="isDivider(it)" class="ctx-div" />
        <button
          v-else
          class="ctx-item"
          :class="{ disabled: it.disabled, active: i === active }"
          :disabled="it.disabled"
          @mousedown.prevent
          @click="run(it)"
          @mouseenter="active = i"
        >
          <span class="ctx-check">{{ it.check ? '✓' : '' }}</span>
          <span class="ctx-label">{{ it.label }}</span>
          <span class="ctx-hint">{{ it.hint ?? '' }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx {
  position: fixed;
  z-index: 200;
  min-width: 188px;
  padding: 5px;
  border-radius: 9px;
  background: rgba(20, 23, 28, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  font-family: 'JetBrains Mono', monospace;
  user-select: none;
}
.ctx-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border: none;
  background: transparent;
  color: #e6ecf2;
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.ctx-item.active:not(.disabled) {
  background: rgba(127, 199, 255, 0.16);
}
.ctx-item.disabled {
  color: rgba(230, 236, 242, 0.32);
  cursor: default;
}
.ctx-check {
  flex: none;
  width: 12px;
  color: #7fc7ff;
}
.ctx-label {
  flex: 1;
}
.ctx-hint {
  flex: none;
  color: rgba(230, 236, 242, 0.4);
  font-size: 10px;
  padding-left: 14px;
}
.ctx-div {
  height: 1px;
  margin: 4px 6px;
  background: rgba(255, 255, 255, 0.1);
}
</style>
