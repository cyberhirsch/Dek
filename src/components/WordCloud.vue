<script setup lang="ts">
// A table's words drawn as a cloud. Placement is core/cloud.ts's — the same
// deterministic layout the PPTX exporter uses — so this component only
// measures its box and paints.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { TableData } from '../core/types'
import { cloudLayout } from '../core/cloud'
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

const words = computed(() => cloudLayout(props.table, size.value.w, size.value.h))
const bodyFont = computed(() => resolveFont(props.table?.font))
const headingFont = resolveFont('heading')
</script>

<template>
  <div ref="root" class="table-chart word-cloud">
    <svg v-if="size.w && words.length" :viewBox="`0 0 ${size.w} ${size.h}`" :width="size.w" :height="size.h" aria-hidden="true">
      <!-- Heading-face words carry the light italic the whole system uses for
           display type; the rest stay upright in the table's face. -->
      <text
        v-for="(wd, i) in words"
        :key="i"
        :x="wd.x"
        :y="wd.y"
        text-anchor="middle"
        dominant-baseline="central"
        :font-family="wd.heading ? headingFont : bodyFont"
        :font-style="wd.heading ? 'italic' : 'normal'"
        :font-weight="wd.heading ? 300 : 400"
        :font-size="wd.size"
        :fill="wd.accent ? 'var(--dek-accent)' : 'var(--dek-dim)'"
      >{{ wd.text }}</text>
    </svg>
    <div v-else-if="size.w && !words.length" class="chart-empty">
      Nothing to show — put words in the first column, and optional weights in another.
    </div>
  </div>
</template>

<style scoped>
.word-cloud {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.word-cloud svg {
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
