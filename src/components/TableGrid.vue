<script setup lang="ts">
// The one table renderer, used by BOTH the `table` layout (SlideView) and the
// `table` canvas element (CanvasElements). Both hand it the same `TableData`
// object and receive the same events back — a table looks and behaves
// identically wherever it lives, and bakes to freeform and back unchanged.
//
// Editing (#48) happens here too, so both hosts get all of it: dragging the
// dividers between rows and columns, selecting a block of cells, and adding a
// row or column from the edges. Structural logic is pure, in core/tableEdit.ts.
import { computed, onUnmounted, ref, watch } from 'vue'
import type { TableData } from '../core/types'
import { TABLE_CELL_MIN_SIZE, TABLE_CELL_SIZE, setTableCell, tableShape, tableTracks } from '../core/table'
import { cellRange, insertColumn, insertRow, resizeTracks } from '../core/tableEdit'
import { resolveFont } from '../render/theme'
import FittedText from './FittedText.vue'
import FramedImage from './FramedImage.vue'
import PieChart from './PieChart.vue'
import WordCloud from './WordCloud.vue'

const props = defineProps<{
  table: TableData | undefined
  editable?: boolean
  safeLink?: (u?: string) => string | undefined
}>()

const emit = defineEmits<{
  /** The table changed — the whole updated table, ready to store. */
  'update:table': [table: TableData]
  /** A file was dropped/picked onto an image cell — the host routes the upload. */
  'cell-file': [index: number, file: File]
  /** Right-click on a cell: the cell, and the cells the menu should act on —
   *  the selected block when the cell is part of one, else just that cell. */
  'cell-ctx': [e: MouseEvent, index: number, cells: number[]]
}>()

const shape = computed(() => tableShape(props.table))
const baseSize = computed(() => props.table?.size ?? TABLE_CELL_SIZE)

// ── divider drag: draft while dragging, one commit on release ──
// Committing on every pointermove would flood undo with one step per pixel and
// hammer autosave; the draft keeps the grid live and the table untouched until
// the drag ends.
const draft = ref<{ axis: 'col' | 'row'; fracs: number[] } | null>(null)
const colTracks = computed(() =>
  draft.value?.axis === 'col' ? draft.value.fracs : tableTracks(props.table?.colWidths, shape.value.cols),
)
const rowTracks = computed(() =>
  draft.value?.axis === 'row' ? draft.value.fracs : tableTracks(props.table?.rowHeights, shape.value.rows),
)
/** Cumulative positions of the inner boundaries, as percentages. */
const edges = (tracks: number[]) => tracks.slice(0, -1).reduce<number[]>((acc, f) => [...acc, (acc.at(-1) ?? 0) + f * 100], [])

const root = ref<HTMLElement | null>(null)
let drag: { axis: 'col' | 'row'; k: number; start: number; size: number; base: number[] } | null = null
function onDividerDown(e: PointerEvent, axis: 'col' | 'row', k: number) {
  if (!props.editable || !root.value) return
  e.preventDefault()
  e.stopPropagation()
  const r = root.value.getBoundingClientRect()
  const base = axis === 'col' ? colTracks.value : rowTracks.value
  // Screen px on both sides of the ratio, so it's right at any stage scale.
  drag = { axis, k, start: axis === 'col' ? e.clientX : e.clientY, size: axis === 'col' ? r.width : r.height, base }
  draft.value = { axis, fracs: base }
  window.addEventListener('pointermove', onDividerMove)
  window.addEventListener('pointerup', onDividerUp)
}
function onDividerMove(e: PointerEvent) {
  if (!drag || !drag.size) return
  const delta = ((drag.axis === 'col' ? e.clientX : e.clientY) - drag.start) / drag.size
  draft.value = { axis: drag.axis, fracs: resizeTracks(drag.base, drag.base.length, drag.k, delta) }
}
function onDividerUp() {
  window.removeEventListener('pointermove', onDividerMove)
  window.removeEventListener('pointerup', onDividerUp)
  const d = draft.value
  const moved = d && drag && d.fracs.some((f, i) => Math.abs(f - drag!.base[i]) > 1e-4)
  if (d && moved && props.table) {
    emit('update:table', { ...props.table, ...(d.axis === 'col' ? { colWidths: d.fracs } : { rowHeights: d.fracs }) })
  }
  drag = null
  draft.value = null
}

// Percentages (not fr) so the tracks stay proportional at any rendered size —
// the same fractions bake.ts and the PPTX exporter multiply by their own pixel
// extents, which is what keeps screen and export geometry identical.
const gridStyle = computed(() => ({
  gridTemplateColumns: colTracks.value.map((w) => w * 100 + '%').join(' '),
  gridTemplateRows: rowTracks.value.map((h) => h * 100 + '%').join(' '),
  fontFamily: resolveFont(props.table?.font),
}))

const view = computed(() => props.table?.view ?? 'table')
// A chart view is edited through its grid: the toggle shows the rows in place
// without changing `view`, so you can fix a number and flip straight back.
// Local and unsaved — it's how you're looking at the slide, not slide content.
const showData = ref(false)
const showGrid = computed(() => view.value === 'table' || (props.editable && showData.value))

/** Header row: the first `cols` cells, when the table declares one. */
const isHeader = (i: number) => !!props.table?.header && i < shape.value.cols

function onText(i: number, text: string) {
  emit('update:table', setTableCell(props.table, i, { text }))
}

// ── selecting cells: drag across them, or Shift-click ──
// A plain click still goes into the cell's text; a drag that leaves the cell
// it started in becomes a block selection instead.
const selected = ref<number[]>([])
const selecting = ref(false)
let anchor = -1
function onCellDown(e: PointerEvent, i: number) {
  if (!props.editable || e.button !== 0) return
  if (e.shiftKey) {
    e.preventDefault()
    const at = selected.value.indexOf(i)
    selected.value = at >= 0 ? selected.value.filter((x) => x !== i) : [...selected.value, i]
    return
  }
  selected.value = []
  anchor = i
  selecting.value = true
  window.addEventListener('pointerup', onSelectUp)
}
function onCellEnter(i: number) {
  if (!selecting.value || anchor < 0 || i === anchor) return
  // Now a block selection, not a text edit: drop the caret and text highlight.
  window.getSelection()?.removeAllRanges()
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  selected.value = cellRange(props.table, anchor, i)
}
function onSelectUp() {
  selecting.value = false
  window.removeEventListener('pointerup', onSelectUp)
}
// A selection is about this table as it is; any structural change ends it.
watch(() => [shape.value.rows, shape.value.cols], () => (selected.value = []))
function onOutsideDown(e: PointerEvent) {
  if (selected.value.length && root.value && !root.value.contains(e.target as Node)) selected.value = []
}
window.addEventListener('pointerdown', onOutsideDown, true)
onUnmounted(() => {
  window.removeEventListener('pointerdown', onOutsideDown, true)
  window.removeEventListener('pointerup', onSelectUp)
  window.removeEventListener('pointermove', onDividerMove)
  window.removeEventListener('pointerup', onDividerUp)
})

// One right-click policy for both hosts. A text selection or a caret inside a
// link belongs to the slide's own text menu (Bold/Italic/Link), so those are
// left to bubble — unless a block of cells is selected, which is what the
// click is about. When this does open a menu it stops propagation: on the
// canvas the element's own menu would otherwise fire next and replace it.
function onCtx(e: MouseEvent, i: number) {
  if (!props.editable) return
  const inBlock = selected.value.length > 1 && selected.value.includes(i)
  if (!inBlock && !shape.value.cells[i]?.image) {
    const sel = window.getSelection()
    if (sel && sel.rangeCount) {
      if (!sel.isCollapsed) return
      const n = sel.anchorNode
      const host = n?.nodeType === 1 ? (n as HTMLElement) : n?.parentElement
      if (host?.closest('a') && (e.currentTarget as HTMLElement).contains(host)) return
    }
  }
  e.preventDefault()
  e.stopPropagation()
  emit('cell-ctx', e, i, inBlock ? [...selected.value] : [i])
}

function addRow() {
  emit('update:table', insertRow(props.table, shape.value.rows))
}
function addColumn() {
  emit('update:table', insertColumn(props.table, shape.value.cols))
}
</script>

<template>
  <div ref="root" class="table-view" :class="{ selecting }">
    <div v-if="showGrid" class="table-grid" :style="gridStyle">
      <template v-for="(cell, i) in shape.cells" :key="i">
        <div
          v-if="!cell.covered"
          class="table-cell"
          :class="{ 'has-image': !!cell.image, th: isHeader(i), b: cell.bold, i: cell.italic, sel: selected.includes(i) }"
          :style="{ gridColumn: 'span ' + (cell.colspan ?? 1), gridRow: 'span ' + (cell.rowspan ?? 1) }"
          @pointerdown="onCellDown($event, i)"
          @pointerenter="onCellEnter(i)"
          @contextmenu="onCtx($event, i)"
        >
          <template v-if="cell.image">
            <FramedImage :src="cell.image" :editable="editable" @file="emit('cell-file', i, $event)" />
            <a
              v-if="!editable && safeLink?.(cell.link)"
              class="img-link"
              :href="safeLink(cell.link)"
              target="_blank"
              rel="noopener noreferrer"
            />
          </template>
          <!-- Text autoshrinks from `size` down to the floor, so a long entry
               stays inside its cell instead of overflowing a fixed grid track. -->
          <FittedText
            v-else
            class="table-cell-fit"
            content-class="table-cell-text"
            :model-value="cell.text"
            :editable="editable"
            multiline
            placeholder=""
            :base-size="baseSize"
            :min-size="TABLE_CELL_MIN_SIZE"
            @update:model-value="onText(i, $event)"
          />
        </div>
      </template>
    </div>
    <PieChart v-else-if="view === 'pie'" :table="table" />
    <WordCloud v-else-if="view === 'cloud'" :table="table" />

    <!-- Editing the grid: divider handles on every inner boundary, and + on
         the bottom and right edges to add a row or column. -->
    <template v-if="editable && showGrid">
      <div
        v-for="(x, k) in edges(colTracks)"
        :key="'dc' + k"
        class="table-divider col"
        :style="{ left: x + '%' }"
        title="Drag to resize the columns"
        @pointerdown="onDividerDown($event, 'col', k)"
      />
      <div
        v-for="(y, k) in edges(rowTracks)"
        :key="'dr' + k"
        class="table-divider row"
        :style="{ top: y + '%' }"
        title="Drag to resize the rows"
        @pointerdown="onDividerDown($event, 'row', k)"
      />
      <button class="table-add row" title="Add a row" @pointerdown.stop @click.stop="addRow">+</button>
      <button class="table-add col" title="Add a column" @pointerdown.stop @click.stop="addColumn">+</button>
    </template>

    <!-- Editor-only: flip a chart to its data and back. Never rendered while
         presenting or in export. -->
    <button
      v-if="editable && view !== 'table'"
      class="table-view-toggle"
      :title="showData ? 'Back to the chart' : 'Edit the rows behind this chart'"
      @pointerdown.stop
      @click.stop="showData = !showData"
    >
      {{ showData ? 'Show chart' : 'Edit data' }}
    </button>
  </div>
</template>
