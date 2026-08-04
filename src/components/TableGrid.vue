<script setup lang="ts">
// The one table renderer, used by BOTH the `table` layout (SlideView) and the
// `table` canvas element (CanvasElements). Keeping a single component is what
// lets a table bake to freeform and back without changing appearance — two
// renderers over the same data would drift on the first CSS tweak.
import { computed } from 'vue'
import type { TableCell } from '../core/types'
import { TABLE_CELL_MIN_SIZE, TABLE_CELL_SIZE, tableTracks } from '../core/table'
import { resolveFont } from '../render/theme'
import FittedText from './FittedText.vue'
import FramedImage from './FramedImage.vue'

const props = defineProps<{
  cells: TableCell[]
  rows: number
  cols: number
  colWidths?: number[]
  rowHeights?: number[]
  font?: string
  size?: number
  editable?: boolean
  /** Rendered scale, so cell text on a shrunk canvas element still autofits
   *  against the size it will actually occupy. */
  safeLink?: (u?: string) => string | undefined
}>()

const emit = defineEmits<{
  'cell-text': [index: number, text: string]
  'cell-file': [index: number, file: File]
  'cell-ctx': [e: MouseEvent, index: number]
}>()

const cols = computed(() => Math.max(1, props.cols))
const rows = computed(() => Math.max(1, props.rows))
const baseSize = computed(() => props.size ?? TABLE_CELL_SIZE)

// Percentages (not fr) so the tracks stay proportional at any rendered size —
// the same fractions bake.ts and the PPTX exporter multiply by their own pixel
// extents, which is what keeps screen and export geometry identical.
const gridStyle = computed(() => ({
  gridTemplateColumns: tableTracks(props.colWidths, cols.value).map((w) => w * 100 + '%').join(' '),
  gridTemplateRows: tableTracks(props.rowHeights, rows.value).map((h) => h * 100 + '%').join(' '),
  fontFamily: resolveFont(props.font),
}))
</script>

<template>
  <div class="table-grid" :style="gridStyle">
    <template v-for="(cell, i) in cells" :key="i">
      <div
        v-if="!cell?.covered"
        class="table-cell"
        :class="{ 'has-image': !!cell?.image }"
        :style="{ gridColumn: 'span ' + (cell?.colspan ?? 1), gridRow: 'span ' + (cell?.rowspan ?? 1) }"
        @contextmenu="emit('cell-ctx', $event, i)"
      >
        <template v-if="cell?.image">
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
          :model-value="cell?.text"
          :editable="editable"
          multiline
          placeholder=""
          :base-size="baseSize"
          :min-size="TABLE_CELL_MIN_SIZE"
          @update:model-value="emit('cell-text', i, $event)"
        />
      </div>
    </template>
  </div>
</template>
