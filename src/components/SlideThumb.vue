<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
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

// Only mount SlideView when the thumbnail is within 200px of the viewport.
// Once mounted it stays mounted (no thrash on scroll-in/out).
const root = ref<HTMLElement | null>(null)
const visible = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        visible.value = true
        observer?.disconnect()
        observer = null
      }
    },
    { rootMargin: '200px' },
  )
  if (root.value) observer.observe(root.value)
})
onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div
    ref="root"
    class="thumb"
    :style="{ width: w + 'px', height: w * (H / W) + 'px', ...vars }"
  >
    <div v-if="visible" class="scaler" :style="{ width: W + 'px', height: H + 'px', transform: `scale(${scale})` }">
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
