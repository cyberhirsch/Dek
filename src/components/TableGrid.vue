<script setup lang="ts">
// The one table renderer, used by BOTH the `table` layout (SlideView) and the
// `table` canvas element (CanvasElements). Both hand it the same `TableData`
// object and receive the same events back — a table looks and behaves
// identically wherever it lives, and bakes to freeform and back unchanged.
import { computed, ref } from 'vue'
import type { TableData } from '../core/types'
import { TABLE_CELL_MIN_SIZE, TABLE_CELL_SIZE, setTableCell, tableShape, tableTracks } from '../core/table'
import { resolveFont } from '../render/theme'
import FittedText from './FittedText.vue'
import FramedImage from './FramedImage.vue'
import PieChart from './PieChart.vue'

const props = defineProps<{
  table: TableData | undefined
  editable?: boolean
  safeLink?: (u?: string) => string | undefined
}>()

const emit = defineEmits<{
  /** A cell's text changed — the whole updated table, ready to store. */
  'update:table': [table: TableData]
  /** A file was dropped/picked onto an image cell — the host routes the upload. */
  'cell-file': [index: number, file: File]
  'cell-ctx': [e: MouseEvent, index: number]
}>()

const shape = computed(() => tableShape(props.table))
const baseSize = computed(() => props.table?.size ?? TABLE_CELL_SIZE)

// Percentages (not fr) so the tracks stay proportional at any rendered size —
// the same fractions bake.ts and the PPTX exporter multiply by their own pixel
// extents, which is what keeps screen and export geometry identical.
const gridStyle = computed(() => ({
  gridTemplateColumns: tableTracks(props.table?.colWidths, shape.value.cols).map((w) => w * 100 + '%').join(' '),
  gridTemplateRows: tableTracks(props.table?.rowHeights, shape.value.rows).map((h) => h * 100 + '%').join(' '),
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

// One right-click policy for both hosts. An image cell gets the image menu; an
// empty text cell gets "Add Image". But a text selection or a caret inside a
// link belongs to the slide's own text menu (Bold/Italic/Link), so those are
// left to bubble. When this does open a menu it stops propagation — on the
// canvas the element's own menu would otherwise fire next and replace it.
function onCtx(e: MouseEvent, i: number) {
  if (!props.editable) return
  if (!shape.value.cells[i]?.image) {
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
  emit('cell-ctx', e, i)
}
</script>

<template>
  <div class="table-view">
    <div v-if="showGrid" class="table-grid" :style="gridStyle">
      <template v-for="(cell, i) in shape.cells" :key="i">
        <div
          v-if="!cell.covered"
          class="table-cell"
          :class="{ 'has-image': !!cell.image, th: isHeader(i) }"
          :style="{ gridColumn: 'span ' + (cell.colspan ?? 1), gridRow: 'span ' + (cell.rowspan ?? 1) }"
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
