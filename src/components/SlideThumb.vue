<script setup lang="ts">
import { computed } from 'vue'
import type { Slide, DeckConfig } from '../core/types'
import { themeVars } from '../render/theme'
import SlideView from './SlideView.vue'

const props = defineProps<{
  slide: Slide
  config: DeckConfig
  index: number
  total: number
  width?: number
}>()

const W = 1280
const H = 720
const w = computed(() => props.width ?? 176)
const scale = computed(() => w.value / W)
const vars = computed(() => themeVars(props.config))
</script>

<template>
  <div
    class="thumb"
    :style="{ width: w + 'px', height: w * (H / W) + 'px', ...vars }"
  >
    <div class="scaler" :style="{ width: W + 'px', height: H + 'px', transform: `scale(${scale})` }">
      <SlideView :slide="slide" :config="config" :index="index" :total="total" />
    </div>
  </div>
</template>

<style scoped>
.thumb {
  position: relative;
  overflow: hidden;
  border-radius: 5px;
  flex: none;
  pointer-events: none;
  background: var(--dek-bg);
}
.scaler {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}
</style>
