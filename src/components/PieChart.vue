<script setup lang="ts">
// A table's data drawn as a pie. All geometry comes from core/chart.ts — the
// same numbers the PPTX exporter uses — so this component only measures its
// box and paints. The viewBox is the box's own size in stage px, so type sizes
// are real stage sizes rather than scaling with the element.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { TableData } from '../core/types'
import { OTHER_OPACITY, PIE_LABEL_SIZE, chartData, pieLayout, sliceOpacity, slicePath } from '../core/chart'
import { resolveFont } from '../render/theme'

const props = defineProps<{ table: TableData | undefined }>()

const root = ref<HTMLElement | null>(null)
const size = ref({ w: 0, h: 0 })
let ro: ResizeObserver | null = null
function measure() {
  const el = root.value
  if (el) size.value = { w: el.clientWidth, h: el.clientHeight }
}
onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (root.value) ro.observe(root.value)
})
onUnmounted(() => ro?.disconnect())

const layout = computed(() => pieLayout(chartData(props.table), size.value.w, size.value.h))
const empty = computed(() => !layout.value.slices.length)
const font = computed(() => resolveFont(props.table?.font))
</script>

<template>
  <div ref="root" class="table-chart pie-chart">
    <svg v-if="size.w && !empty" :viewBox="`0 0 ${size.w} ${size.h}`" :width="size.w" :height="size.h" aria-hidden="true">
      <!-- Slices are separated by a stroke in the slide's own ground colour, so
           adjacent steps of the one accent colour still read as distinct. -->
      <path
        v-for="(s, i) in layout.slices"
        :key="'s' + i"
        :d="slicePath(layout.cx, layout.cy, layout.r, s)"
        :fill="s.other ? 'var(--dek-text)' : 'var(--dek-accent)'"
        :fill-opacity="s.other ? OTHER_OPACITY : sliceOpacity(i)"
        stroke="var(--dek-bg)"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <text
        v-for="(l, i) in layout.labels"
        :key="'l' + i"
        :x="l.x"
        :y="l.y"
        :text-anchor="l.anchor"
        dominant-baseline="middle"
        :font-family="font"
        :font-size="PIE_LABEL_SIZE"
        fill="var(--dek-text)"
      >
        {{ l.label }}<tspan fill="var(--dek-dim)" dx="8">{{ l.percent }}</tspan>
      </text>
    </svg>
    <!-- Say why nothing is drawn, rather than an empty box. -->
    <div v-else-if="empty" class="chart-empty">
      Nothing to chart — put labels in the first column and numbers in another.
    </div>
  </div>
</template>

<style scoped>
.pie-chart {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.pie-chart svg {
  display: block;
}
.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 24px;
  text-align: center;
  font-family: var(--dek-font-body);
  font-size: 18px;
  color: var(--dek-faint);
}
</style>
