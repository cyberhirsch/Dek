<script setup lang="ts">
// Slide actions pinned to the top of the sidebar: add (press & hold to choose a
// layout), duplicate, delete, group. The add menu is teleported to <body> so it
// isn't clipped by the sidebar's overflow.
import { onUnmounted, ref } from 'vue'
import type { LayoutId } from '../core/types'
import { LAYOUT_IDS } from '../core/types'

defineProps<{
  selectedCount: number
  slideCount: number
  hasGroups: boolean
  allCollapsed: boolean
}>()
const emit = defineEmits<{
  add: [id: LayoutId]
  duplicate: []
  remove: []
  group: []
  autogroup: []
  'toggle-collapse': []
}>()

const LAYOUT_LABELS: Record<LayoutId, string> = {
  cover: 'Cover',
  section: 'Section',
  statement: 'Statement',
  speaker: 'Speaker',
  text: 'Text',
  'text-image': 'Text + Image',
  'image-full': 'Image – Full',
  'image-caption': 'Image + Caption',
  'video-embed': 'Video',
  gallery: 'Gallery',
  diagram: 'Diagram',
  freeform: 'Freeform',
}

// ── add-slide picker (press & hold) ──
// Press the ＋ and drag onto a layout to create it on release. A plain click
// (release still on ＋) latches the menu open so you can click a layout, or
// click outside to dismiss.
const addOpen = ref(false)
const addLatched = ref(false)
const addBtn = ref<HTMLButtonElement | null>(null)
const addMenu = ref<HTMLDivElement | null>(null)
const addPos = ref({ top: 0, left: 0 })
const hoverType = ref<LayoutId | null>(null)

function typeAt(x: number, y: number): LayoutId | null {
  const hit = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest?.('[data-add-type]')
  return hit ? ((hit as HTMLElement).dataset.addType as LayoutId) : null
}
function overAddBtn(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y)
  return !!el && !!addBtn.value && addBtn.value.contains(el)
}
function onAddDown(e: PointerEvent) {
  e.preventDefault()
  if (addOpen.value) return closeAdd() // pressing ＋ again toggles the menu closed
  const r = addBtn.value?.getBoundingClientRect()
  if (r) addPos.value = { top: r.bottom + 6, left: r.left }
  addOpen.value = true
  addLatched.value = false
  hoverType.value = null
  window.addEventListener('pointermove', onAddMove)
  window.addEventListener('pointerup', onAddUp)
}
function onAddMove(e: PointerEvent) {
  hoverType.value = typeAt(e.clientX, e.clientY)
}
function onAddUp(e: PointerEvent) {
  window.removeEventListener('pointermove', onAddMove)
  window.removeEventListener('pointerup', onAddUp)
  const t = typeAt(e.clientX, e.clientY)
  if (t) return addPick(t)
  if (overAddBtn(e.clientX, e.clientY)) {
    // released on the ＋ itself → keep the menu open until a click decides
    addLatched.value = true
    window.addEventListener('pointerdown', onAddOutside, true)
    return
  }
  closeAdd()
}
function onAddOutside(e: PointerEvent) {
  const el = e.target as Node
  if (addBtn.value?.contains(el) || addMenu.value?.contains(el)) return
  closeAdd()
}
function addPick(id: LayoutId) {
  emit('add', id)
  closeAdd()
}
function closeAdd() {
  addOpen.value = false
  addLatched.value = false
  hoverType.value = null
  window.removeEventListener('pointermove', onAddMove)
  window.removeEventListener('pointerup', onAddUp)
  window.removeEventListener('pointerdown', onAddOutside, true)
}
onUnmounted(closeAdd)
</script>

<template>
  <div class="slide-actions">
    <button
      ref="addBtn"
      class="sa-btn add-btn"
      :class="{ on: addOpen }"
      title="Add slide — click & hold, then release on a layout"
      @pointerdown="onAddDown"
    >
      ＋
    </button>
    <Teleport to="body">
      <div
        v-if="addOpen"
        ref="addMenu"
        class="add-menu"
        :style="{ top: addPos.top + 'px', left: addPos.left + 'px' }"
      >
        <button
          v-for="id in LAYOUT_IDS"
          :key="id"
          class="add-item"
          :class="{ hover: hoverType === id }"
          :data-add-type="id"
          @click="addPick(id)"
        >
          {{ LAYOUT_LABELS[id] }}
        </button>
      </div>
    </Teleport>

    <button class="sa-btn" title="Duplicate slide" @click="emit('duplicate')">
      <svg viewBox="0 0 24 24" width="14" height="14"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2" /><path d="M4 16V4h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button class="sa-btn danger" title="Delete slide" :disabled="slideCount <= 1" @click="emit('remove')">
      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button class="sa-btn group-btn" title="Group selected" :disabled="selectedCount < 1" @click="emit('group')">
      <svg viewBox="0 0 24 24" width="14" height="14"><rect x="3" y="3" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2" /><rect x="12" y="12" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="2" /></svg>
      <span v-if="selectedCount > 1" class="cnt">{{ selectedCount }}</span>
    </button>
    <button class="sa-btn" title="Auto-group by sections" @click="emit('autogroup')">
      <svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 6h10M4 12h10M4 18h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /><path d="M19 4l.8 2.2L22 7l-2.2.8L19 10l-.8-2.2L16 7l2.2-.8z" fill="currentColor" /></svg>
    </button>
    <button
      class="sa-btn"
      :title="allCollapsed ? 'Expand all groups' : 'Collapse all groups'"
      :disabled="!hasGroups"
      @click="emit('toggle-collapse')"
    >
      <svg v-if="allCollapsed" viewBox="0 0 24 24" width="14" height="14"><path d="M6 5l6 4 6-4M6 13l6 4 6-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <svg v-else viewBox="0 0 24 24" width="14" height="14"><path d="M6 9l6-4 6 4M6 17l6-4 6 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
  </div>
</template>

<style scoped>
.slide-actions {
  flex: none;
  display: flex;
  gap: 4px;
  padding: 8px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: #0c0d10;
}
.sa-btn {
  flex: 1;
  height: 29px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(230, 236, 242, 0.8);
  border-radius: 6px;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
}
.sa-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.sa-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.sa-btn.danger:hover {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.5);
}
.add-btn {
  font-size: 15px;
  line-height: 1;
  touch-action: none; /* let pointerdown start the press-drag, not scroll/select */
}
.add-btn.on {
  border-color: #7fc7ff;
  color: #7fc7ff;
}
.group-btn {
  position: relative;
}
.group-btn .cnt {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: #7fc7ff;
  color: #0b0d11;
  font-size: 9px;
  line-height: 14px;
  text-align: center;
}
.add-menu {
  position: fixed;
  z-index: 1000;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  min-width: 240px;
  padding: 4px;
  background: rgba(24, 26, 31, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
}
.add-item {
  padding: 7px 9px;
  border: none;
  background: transparent;
  color: rgba(230, 236, 242, 0.85);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  font-family: 'JetBrains Mono', monospace;
}
.add-item:hover,
.add-item.hover {
  background: rgba(127, 199, 255, 0.22);
  color: #fff;
}
</style>
