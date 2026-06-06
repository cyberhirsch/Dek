<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

type Mermaid = typeof import('mermaid')['default']
let mermaidPromise: Promise<Mermaid> | null = null
function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid').then((m) => m.default)
  return mermaidPromise
}

// Module-level so every render across all instances (main stage + each thumbnail)
// gets a unique id — otherwise concurrent renders collide and produce empty SVGs.
let GID = 0
// Mermaid keeps shared internal state (parse + a hidden measurement DOM), so
// concurrent parse/render calls from multiple instances corrupt each other and
// produce empty SVGs. Serialize ALL mermaid work through one global chain.
let chain: Promise<unknown> = Promise.resolve()
function renderMermaid(id: string, code: string): Promise<string> {
  const run = chain.then(async () => {
    const mermaid = await init()
    if (!(await mermaid.parse(code, { suppressErrors: true }))) {
      throw new Error('Diagram syntax error')
    }
    const { svg } = await mermaid.render(id, code)
    return svg
  })
  chain = run.catch(() => {})
  return run
}

const props = defineProps<{ code?: string }>()

// Initialize once per app load, themed to match the deck palette.
let inited = false
async function init(): Promise<Mermaid> {
  const mermaid = await loadMermaid()
  if (inited) return mermaid
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    htmlLabels: false,
    // SVG <text> labels (not HTML foreignObject) — foreignObject label
    // measurement returns 0 in our render context, clipping the labels. SVG text
    // is measured reliably so node boxes are sized correctly.
    flowchart: { htmlLabels: false, useMaxWidth: true, padding: 14 },
    themeVariables: {
      background: '#070809',
      primaryColor: '#10141b',
      primaryBorderColor: '#7fc7ff',
      primaryTextColor: '#e6ecf2',
      secondaryColor: '#171c25',
      tertiaryColor: '#12161d',
      lineColor: '#7fc7ff',
      textColor: '#e6ecf2',
      mainBkg: '#10141b',
      clusterBkg: '#0c0f15',
      edgeLabelBackground: '#0c0f15',
    },
  })
  inited = true
  return mermaid
}

const host = ref<HTMLElement | null>(null)
const error = ref('')

async function render() {
  const code = (props.code ?? '').trim()
  if (!host.value) return
  if (!code) {
    host.value.innerHTML = ''
    error.value = ''
    return
  }
  const id = `dek-mmd-${GID++}`
  try {
    const svg = await renderMermaid(id, code)
    if (host.value) host.value.innerHTML = svg
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message || 'Diagram error'
    document.getElementById(id)?.remove() // clean orphan node from a failed render
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
watch(
  () => props.code,
  () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(render, 250)
  },
)
onMounted(render)
</script>

<template>
  <div class="mmd-wrap">
    <div ref="host" class="mmd-host" />
    <div v-if="error" class="mmd-err">{{ error }}</div>
  </div>
</template>

<style scoped>
.mmd-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.mmd-host {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mmd-host :deep(svg) {
  max-width: 100%;
  max-height: 100%;
  height: auto;
}
.mmd-err {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #f87171;
  background: rgba(7, 8, 9, 0.7);
  padding: 4px 10px;
  border-radius: 6px;
}
</style>
