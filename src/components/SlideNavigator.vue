<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Deck, LayoutId } from '../core/types'
import SlideThumb from './SlideThumb.vue'
import SlideActions from './SlideActions.vue'

const props = defineProps<{
  deck: Deck
  current: number
  selected: number[]
  /** Worst issue severity per slide (0-based), for the validation badge. */
  severity?: Map<number, 'error' | 'warning'>
}>()

const nav = ref<HTMLElement | null>(null)
const emit = defineEmits<{
  'update:current': [i: number]
  select: [e: { index: number; shift: boolean; meta: boolean }]
  reorder: [e: { indices: number[]; before: number }]
  'join-group': [e: { from: number; name: string }]
  ungroup: [name: string]
  rename: [e: { indices: number[]; name: string }]
  add: [id: LayoutId]
  duplicate: []
  remove: []
  group: []
  autogroup: []
  'contextmenu-slide': [p: { x: number; y: number; index: number }]
}>()

// Build navigator rows: a header before each maximal contiguous run sharing a
// non-empty `group`, then the slides (unless the run is collapsed).
type Entry =
  | { kind: 'header'; name: string; runId: number; indices: number[] }
  | { kind: 'slide'; index: number; grouped: boolean }

const collapsed = reactive<Set<number>>(new Set())
const scrollTop = ref(0)
const viewportH = ref(1)
const ROW_H = 104
const HEADER_H = 32
const OVERSCAN = ROW_H * 4

const entries = computed<Entry[]>(() => {
  const s = props.deck.slides
  const out: Entry[] = []
  let i = 0
  while (i < s.length) {
    const g = s[i].group
    if (g) {
      const indices: number[] = []
      let j = i
      while (j < s.length && s[j].group === g) indices.push(j++)
      out.push({ kind: 'header', name: g, runId: i, indices })
      if (!collapsed.has(i)) for (const idx of indices) out.push({ kind: 'slide', index: idx, grouped: true })
      i = j
    } else {
      out.push({ kind: 'slide', index: i, grouped: false })
      i++
    }
  }
  return out
})

type PositionedEntry = Entry & { key: string; top: number; height: number }
const positioned = computed<PositionedEntry[]>(() => {
  let top = 0
  return entries.value.map((e) => {
    const height = e.kind === 'header' ? HEADER_H : ROW_H
    const key = e.kind === 'header' ? `h-${e.runId}` : `s-${e.index}`
    const out = { ...e, key, top, height }
    top += height
    return out
  })
})
const totalHeight = computed(() => {
  const last = positioned.value.at(-1)
  return last ? last.top + last.height : 0
})
const visibleEntries = computed(() => {
  const lo = scrollTop.value - OVERSCAN
  const hi = scrollTop.value + viewportH.value + OVERSCAN
  return positioned.value.filter((e) => e.top + e.height >= lo && e.top <= hi)
})

function syncViewport() {
  if (!nav.value) return
  scrollTop.value = nav.value.scrollTop
  viewportH.value = nav.value.clientHeight
}
function scrollActiveIntoView() {
  nextTick(() => {
    const el = nav.value
    const row = positioned.value.find((e) => e.kind === 'slide' && e.index === props.current)
    if (!el || !row) return
    const top = row.top
    const bottom = row.top + row.height
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight
    syncViewport()
  })
}
let ro: ResizeObserver | null = null
watch(() => props.current, scrollActiveIntoView)
onMounted(() => {
  syncViewport()
  ro = new ResizeObserver(syncViewport)
  if (nav.value) ro.observe(nav.value)
  scrollActiveIntoView()
})
onUnmounted(() => ro?.disconnect())

function toggleCollapse(runId: number) {
  if (collapsed.has(runId)) collapsed.delete(runId)
  else collapsed.add(runId)
}

// ── rename ──
const renaming = ref<number | null>(null)
const renameText = ref('')
function startRename(e: Entry & { kind: 'header' }) {
  renaming.value = e.runId
  renameText.value = e.name
}
function commitRename(e: Entry & { kind: 'header' }) {
  const name = renameText.value.trim()
  if (name && name !== e.name) emit('rename', { indices: e.indices, name })
  renaming.value = null
}

// ── drag & drop reorder ──
const dragFrom = ref<number | null>(null)
const dragSet = ref<number[]>([]) // all indices being dragged (multi-select aware)
const draggingGroup = ref(false) // dragging a whole chapter (its header), not a loose slide
const dropBefore = ref<number | null>(null) // insertion index in slide array
const dropHeader = ref<number | null>(null) // runId of a header being hovered

function onDragStart(index: number) {
  dragFrom.value = index
  draggingGroup.value = false
  // if dragging a slide that's part of a multi-selection, move the whole set
  dragSet.value =
    props.selected.includes(index) && props.selected.length > 1
      ? [...props.selected].sort((a, b) => a - b)
      : [index]
}
// Dragging a chapter's header moves the whole run as one block — a group's
// slides are always contiguous, so this is exactly `reorder`'s existing
// block-move, just seeded with the header's own indices instead of one slide.
function onHeaderDragStart(header: Entry & { kind: 'header' }) {
  dragFrom.value = header.indices[0]
  dragSet.value = header.indices
  draggingGroup.value = true
}
function onSlideDragOver(e: DragEvent, index: number) {
  e.preventDefault()
  dropHeader.value = null
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const after = e.clientY > r.top + r.height / 2
  dropBefore.value = after ? index + 1 : index
}
function onHeaderDragOver(e: DragEvent, header: Entry & { kind: 'header' }) {
  e.preventDefault()
  if (draggingGroup.value) {
    // Reordering one chapter past another: drop in the top/bottom half of the
    // target header to land the dragged chapter before/after it.
    dropHeader.value = null
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const after = e.clientY > r.top + r.height / 2
    dropBefore.value = after ? header.indices[header.indices.length - 1] + 1 : header.indices[0]
  } else {
    dropBefore.value = null
    dropHeader.value = header.runId
  }
}
function onDrop() {
  if (dragFrom.value == null) return cleanupDrag()
  if (dropHeader.value != null) {
    const header = entries.value.find((x) => x.kind === 'header' && x.runId === dropHeader.value) as
      | (Entry & { kind: 'header' })
      | undefined
    if (header) emit('join-group', { from: dragFrom.value, name: header.name })
  } else if (dropBefore.value != null) {
    emit('reorder', { indices: dragSet.value, before: dropBefore.value })
  }
  cleanupDrag()
}
function cleanupDrag() {
  dragFrom.value = null
  dragSet.value = []
  draggingGroup.value = false
  dropBefore.value = null
  dropHeader.value = null
}

const total = computed(() => props.deck.slides.length)
const selSet = computed(() => new Set(props.selected))

// Clicking a slide focuses the navigator itself. This is what makes the arrow
// keys reliable: the click pulls focus off whatever text field was being edited
// on the stage, so the very next Arrow press navigates instead of moving a caret
// (and instead of being swallowed by Deck.vue's "typing → ignore arrows" guard).
function onRowClick(index: number, e: MouseEvent) {
  emit('select', { index, shift: e.shiftKey, meta: e.metaKey || e.ctrlKey })
  nav.value?.focus({ preventScroll: true })
}

// The navigator is a real list: when it holds focus, arrows move between slides.
// stopPropagation keeps Deck.vue's window-level handler from also firing and
// double-stepping. A rename input owns its own keys, so skip while renaming.
function onNavKey(e: KeyboardEvent) {
  if (renaming.value != null) return
  const last = props.deck.slides.length - 1
  let next = props.current
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowRight':
    case 'PageDown':
      next = Math.min(last, props.current + 1)
      break
    case 'ArrowUp':
    case 'ArrowLeft':
    case 'PageUp':
      next = Math.max(0, props.current - 1)
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = last
      break
    default:
      return
  }
  e.preventDefault()
  e.stopPropagation()
  // Shift extends the multi-selection (onSelect ranges anchor→index); a plain
  // arrow moves the single selection.
  if (next !== props.current || e.shiftKey) emit('select', { index: next, shift: e.shiftKey, meta: false })
}

// Expand / collapse every group at once (collapse state lives here in the nav).
const headerRunIds = computed(() =>
  entries.value.flatMap((e) => (e.kind === 'header' ? [e.runId] : [])),
)
const hasGroups = computed(() => headerRunIds.value.length > 0)
const allCollapsed = computed(
  () => hasGroups.value && headerRunIds.value.every((id) => collapsed.has(id)),
)
function toggleCollapseAll() {
  if (allCollapsed.value) collapsed.clear()
  else for (const id of headerRunIds.value) collapsed.add(id)
}
</script>

<template>
  <div class="sidebar">
    <SlideActions
      :selected-count="selected.length"
      :slide-count="deck.slides.length"
      :has-groups="hasGroups"
      :all-collapsed="allCollapsed"
      @add="emit('add', $event)"
      @duplicate="emit('duplicate')"
      @remove="emit('remove')"
      @group="emit('group')"
      @autogroup="emit('autogroup')"
      @toggle-collapse="toggleCollapseAll"
    />
    <div
      ref="nav"
      class="nav"
      tabindex="0"
      @scroll="syncViewport"
      @dragend="cleanupDrag"
      @drop="onDrop"
      @dragover.prevent
      @keydown="onNavKey"
    >
    <div class="virtual" :style="{ height: totalHeight + 'px' }">
    <template v-for="e in visibleEntries" :key="e.key">
      <!-- group header: draggable so a whole chapter can be reordered as a block -->
      <div
        v-if="e.kind === 'header'"
        class="grp"
        :class="{ 'drop-into': dropHeader === e.runId, dragging: draggingGroup && dragSet[0] === e.indices[0] }"
        :style="{ transform: `translateY(${e.top}px)`, height: e.height + 'px' }"
        draggable="true"
        title="Drag to reorder this chapter"
        @dragstart="onHeaderDragStart(e)"
        @dragover="onHeaderDragOver($event, e)"
      >
        <div v-if="dropBefore === e.indices[0]" class="drop-line top" />
        <button class="chev" @click="toggleCollapse(e.runId)">{{ collapsed.has(e.runId) ? '▸' : '▾' }}</button>
        <input
          v-if="renaming === e.runId"
          v-model="renameText"
          class="grp-rename"
          @keydown.enter="commitRename(e)"
          @blur="commitRename(e)"
          @vue:mounted="(vn: any) => vn.el?.select()"
        />
        <span v-else class="grp-name" @dblclick="startRename(e)">{{ e.name }}</span>
        <span class="grp-count">{{ e.indices.length }}</span>
        <button class="grp-x" title="ungroup" @click="emit('ungroup', e.name)">✕</button>
      </div>

      <!-- slide row -->
      <div
        v-else
        class="row"
        :class="{ active: e.index === current, sel: selSet.has(e.index), grouped: e.grouped, dragging: dragSet.includes(e.index) }"
        :style="{ transform: `translateY(${e.top}px)`, height: e.height + 'px' }"
        draggable="true"
        @dragstart="onDragStart(e.index)"
        @dragover="onSlideDragOver($event, e.index)"
        @click="onRowClick(e.index, $event)"
        @contextmenu.prevent="emit('contextmenu-slide', { x: $event.clientX, y: $event.clientY, index: e.index })"
      >
        <div v-if="dropBefore === e.index" class="drop-line top" />
        <span class="num">{{ e.index + 1 }}</span>
        <SlideThumb :slide="deck.slides[e.index]" :config="deck.config" :index="e.index" :total="total" :width="150" />
        <span
          v-if="severity?.get(e.index)"
          class="badge"
          :class="severity.get(e.index)"
          :title="severity.get(e.index) === 'error' ? 'Has an error' : 'Has a warning'"
        />
        <div v-if="dropBefore === e.index + 1" class="drop-line bottom" />
      </div>
    </template>
    </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 210px;
  flex: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #0c0d10;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
}
.nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 6px 40px;
  user-select: none;
}
/* The pane is focusable so it can own the arrow keys, but the active-slide
   outline is the real focus indicator — a box around the whole list would just
   be noise. */
.nav:focus,
.nav:focus-visible {
  outline: none;
}
.virtual {
  position: relative;
}
.grp {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 4px 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.7);
  cursor: grab;
}
.grp.drop-into {
  background: rgba(127, 199, 255, 0.12);
  border-radius: 6px;
}
.grp.dragging { opacity: 0.4; }
.chev {
  background: none;
  border: none;
  color: rgba(230, 236, 242, 0.6);
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
}
.grp-name {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: text;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.grp-rename {
  flex: 1;
  background: #1b1e24;
  border: 1px solid #7fc7ff;
  border-radius: 4px;
  color: #fff;
  font-family: inherit;
  font-size: 11px;
  padding: 2px 4px;
}
.grp-count {
  font-size: 10px;
  color: rgba(230, 236, 242, 0.35);
}
.grp-x {
  background: none;
  border: none;
  color: rgba(230, 236, 242, 0.3);
  cursor: pointer;
  font-size: 10px;
  opacity: 0;
}
.grp:hover .grp-x { opacity: 1; }
.grp-x:hover { color: #f87171; }

.row {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 4px;
  border-radius: 7px;
  cursor: pointer;
}
.row.grouped { padding-left: 16px; }
.row:hover { background: rgba(255, 255, 255, 0.04); }
.row.active { background: rgba(127, 199, 255, 0.12); }
.row.active :deep(.thumb) { outline: 2px solid #7fc7ff; }
.row.sel:not(.active) :deep(.thumb) { outline: 2px solid rgba(127, 199, 255, 0.45); }
.row.dragging { opacity: 0.4; }
.num {
  width: 18px;
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(230, 236, 242, 0.4);
  flex: none;
}
.drop-line {
  position: absolute;
  left: 26px;
  right: 6px;
  height: 2px;
  background: #7fc7ff;
  border-radius: 2px;
  z-index: 2;
}
.drop-line.top { top: 0; }
.drop-line.bottom { bottom: 0; }
.badge {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid #0c0d10;
  z-index: 2;
}
.badge.warning { background: #facc15; }
.badge.error { background: #f87171; }
</style>
