<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Deck } from '../core/types'
import { themeVars } from '../render/theme'
import SlideView from './SlideView.vue'

const props = defineProps<{ deck: Deck }>()
const emit = defineEmits<{ close: [] }>()

const vars = computed(() => themeVars(props.deck.config))
const stack = ref<HTMLElement | null>(null)
const rendered = ref(0)
const visibleSlides = computed(() => props.deck.slides.slice(0, rendered.value))
const progress = computed(() => {
  if (!props.deck.slides.length) return 100
  return Math.round((rendered.value / props.deck.slides.length) * 100)
})

let cancelled = false
let timer: number | null = null
const FIRST_CHUNK = 12
const CHUNK = 24

function queueRender() {
  if (cancelled || rendered.value >= props.deck.slides.length) return
  timer = window.setTimeout(() => {
    rendered.value = Math.min(props.deck.slides.length, rendered.value + CHUNK)
    queueRender()
  }, 16)
}

function startRender() {
  cancelled = false
  rendered.value = Math.min(props.deck.slides.length, FIRST_CHUNK)
  queueRender()
}

async function renderAll() {
  rendered.value = props.deck.slides.length
  await nextTick()
}

async function printPdf() {
  await renderAll()
  window.print()
}

/** Collect every CSS rule the page has loaded into one string. */
function collectCss(): string {
  let out = ''
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) out += rule.cssText + '\n'
    } catch {
      /* cross-origin sheet (e.g. Google Fonts) — skip; we re-link it below */
    }
  }
  return out
}

async function downloadHtml() {
  await renderAll()
  const css = collectCss()
  const slidesHtml = stack.value?.innerHTML ?? ''
  const fontLink =
    '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">'
  const styleVars = Object.entries(vars.value)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(props.deck.config.deck ?? 'Deck')}</title>
${fontLink}
<style>
${css}
html,body{margin:0;background:#050506;}
.dek-export{display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px;}
.print-page{position:relative;width:1280px;height:720px;flex:none;box-shadow:0 20px 60px rgba(0,0,0,.5);}
@media print{
  body{background:#fff;}
  .dek-export{gap:0;padding:0;}
  .print-page{box-shadow:none;page-break-after:always;}
  @page{size:1280px 720px;margin:0;}
}
</style></head>
<body><div class="dek-export" style="${styleVars}">${slidesHtml}</div></body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(props.deck.config.deck ?? 'deck').replace(/[^a-z0-9]+/gi, '_')}.html`
  a.click()
  URL.revokeObjectURL(a.href)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

onMounted(startRender)
watch(() => props.deck.slides.length, startRender)
onUnmounted(() => {
  cancelled = true
  if (timer) window.clearTimeout(timer)
})
</script>

<template>
  <div class="export-root" :style="vars">
    <div class="export-bar no-print">
      <div class="export-status">
        <span>Export — {{ rendered }} / {{ deck.slides.length }} slides</span>
        <span class="meter"><span :style="{ width: progress + '%' }" /></span>
      </div>
      <div class="actions">
        <button @click="printPdf">⎙ Print / Save as PDF</button>
        <button @click="downloadHtml">⤓ Download HTML</button>
        <button class="close" @click="emit('close')">Close</button>
      </div>
    </div>

    <div ref="stack" class="dek-export">
      <div v-for="(s, i) in visibleSlides" :key="i" class="print-page">
        <SlideView :slide="s" :config="deck.config" :index="i" :total="deck.slides.length" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-root {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: #050506;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
}
.export-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  background: rgba(16, 18, 22, 0.95);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #e6ecf2;
  font-size: 13px;
}
.export-status {
  display: flex;
  align-items: center;
  gap: 12px;
}
.meter {
  width: 150px;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}
.meter span {
  display: block;
  height: 100%;
  background: #7fc7ff;
}
.actions {
  display: flex;
  gap: 8px;
}
.actions button {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 8px;
  padding: 6px 14px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.actions button:hover { background: rgba(255, 255, 255, 0.12); }
.dek-export {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 24px;
}
.print-page {
  position: relative;
  width: 1280px;
  height: 720px;
  flex: none;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
</style>

<style>
/* Global print rules (un-scoped) so only the slide pages print. */
@media print {
  body {
    background: #fff !important;
  }
  .no-print {
    display: none !important;
  }
  /* hide all app chrome — print only the export stack */
  .app-root > :not(.export-root) {
    display: none !important;
  }
  .export-root {
    position: static !important;
    overflow: visible !important;
  }
  .dek-export {
    gap: 0 !important;
    padding: 0 !important;
  }
  .print-page {
    box-shadow: none !important;
    page-break-after: always;
    break-after: page;
  }
  @page {
    size: 1280px 720px;
    margin: 0;
  }
}
</style>
