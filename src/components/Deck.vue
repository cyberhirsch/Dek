<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Deck, DeckConfig, Slide } from '../core/types'
import { themeVars as buildThemeVars } from '../render/theme'
import SlideView from './SlideView.vue'

const props = defineProps<{
  deck: Deck
  modelValue: number
  editable?: boolean
  bulletFormatCommand?: number
  navEnabled?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [n: number]
  patch: [p: Partial<Slide>]
  'config-patch': [p: Partial<DeckConfig>]
  upload: [e: { field: 'image' | 'poster' | 'portraits' | 'gallery'; file: File; index?: number }]
}>()

const stage = ref<HTMLElement | null>(null)
const scale = ref(1)
const STAGE_W = 1280
const STAGE_H = 720

const themeVars = computed(() => buildThemeVars(props.deck.config))

function fit() {
  const el = stage.value
  if (!el) return
  const { width, height } = el.getBoundingClientRect()
  scale.value = Math.min(width / STAGE_W, height / STAGE_H)
}

function go(n: number) {
  const max = props.deck.slides.length - 1
  emit('update:modelValue', Math.max(0, Math.min(max, n)))
}

function onKey(e: KeyboardEvent) {
  // Suspended while an overlay (overview / presenter / export) owns the keyboard.
  if (props.navEnabled === false) return
  // Don't hijack arrows/space while typing in a contenteditable field.
  const ae = document.activeElement as HTMLElement | null
  if (ae && ae.isContentEditable) {
    if (e.key === 'PageDown') go(props.modelValue + 1)
    if (e.key === 'PageUp') go(props.modelValue - 1)
    return
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault()
    go(props.modelValue + 1)
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault()
    go(props.modelValue - 1)
  } else if (e.key === 'Home') {
    go(0)
  } else if (e.key === 'End') {
    go(props.deck.slides.length - 1)
  }
}

let ro: ResizeObserver
onMounted(() => {
  fit()
  ro = new ResizeObserver(fit)
  if (stage.value) ro.observe(stage.value)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  ro?.disconnect()
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="stage" class="dek-stage" :style="themeVars">
    <div
      class="dek-frame"
      :style="{
        width: STAGE_W + 'px',
        height: STAGE_H + 'px',
        transform: `scale(${scale})`,
      }"
    >
      <SlideView
        v-if="deck.slides[modelValue]"
        :key="modelValue"
        :slide="deck.slides[modelValue]"
        :config="deck.config"
        :index="modelValue"
        :total="deck.slides.length"
        :editable="editable"
        :bullet-format-command="bulletFormatCommand"
        @patch="emit('patch', $event)"
        @config-patch="emit('config-patch', $event)"
        @upload="emit('upload', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.dek-stage {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #050506;
}
.dek-frame {
  position: relative;
  flex: none;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
}
</style>
