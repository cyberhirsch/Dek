<script setup lang="ts">
import { ref } from 'vue'

export type CanvasTool = 'select' | 'text' | 'rect' | 'arrow'

defineProps<{ tool: CanvasTool }>()
const emit = defineEmits<{
  'update:tool': [t: CanvasTool]
  insert: [what: 'video' | 'diagram' | 'table']
}>()

const shapesOpen = ref(false)
const insertOpen = ref(false)

function pick(t: CanvasTool) {
  emit('update:tool', t)
  shapesOpen.value = false
  insertOpen.value = false
}
function toggleShapes() {
  shapesOpen.value = !shapesOpen.value
  insertOpen.value = false
}
function toggleInsert() {
  insertOpen.value = !insertOpen.value
  shapesOpen.value = false
}
</script>

<template>
  <div class="ctb" @pointerleave="((shapesOpen = false), (insertOpen = false))">
    <button class="t" :class="{ on: tool === 'select' }" title="Select / move (V)" @click="pick('select')">
      <svg viewBox="0 0 24 24" width="17" height="17"><path d="M5 3l14 7-6 1.5L9.5 18z" fill="currentColor" /></svg>
    </button>

    <button class="t" :class="{ on: tool === 'text' }" title="Text box (T)" @click="pick('text')">
      <span class="tt">T</span>
    </button>

    <div class="grp">
      <button class="t" :class="{ on: tool === 'rect' || tool === 'arrow' }" title="Shapes" @click="toggleShapes">
        <svg viewBox="0 0 24 24" width="16" height="16"><rect x="3" y="6" width="13" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        <span class="caret">▾</span>
      </button>
      <div v-if="shapesOpen" class="menu">
        <button @click="pick('rect')"><svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2" /></svg> Rectangle</button>
        <button @click="pick('arrow')"><svg viewBox="0 0 24 24" width="15" height="15"><line x1="3" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" /><path d="M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" /></svg> Arrow</button>
      </div>
    </div>

    <span class="sep" />

    <div class="grp">
      <button class="t insert" title="Insert…" @click="toggleInsert">＋ Insert <span class="caret">▾</span></button>
      <div v-if="insertOpen" class="menu wide">
        <button @click="((insertOpen = false), emit('insert', 'video'))">▶ Video</button>
        <button @click="((insertOpen = false), emit('insert', 'diagram'))">◇ Diagram</button>
        <button @click="((insertOpen = false), emit('insert', 'table'))">▦ Table</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ctb {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: rgba(20, 22, 26, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  z-index: 20;
  font-family: 'JetBrains Mono', monospace;
}
.t {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 30px;
  min-width: 32px;
  justify-content: center;
  padding: 0 7px;
  border: none;
  background: transparent;
  color: rgba(230, 236, 242, 0.8);
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
}
.t:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}
.t.on {
  background: rgba(127, 199, 255, 0.22);
  color: #fff;
}
.tt {
  font-weight: 700;
  font-size: 16px;
}
.t.insert {
  font-size: 12px;
}
.caret {
  font-size: 9px;
  opacity: 0.7;
}
.sep {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.12);
  margin: 0 4px;
}
.grp {
  position: relative;
}
.menu {
  position: absolute;
  top: 36px;
  left: 0;
  display: flex;
  flex-direction: column;
  min-width: 130px;
  padding: 4px;
  background: rgba(24, 26, 31, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
}
.menu.wide {
  min-width: 140px;
}
.menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: none;
  background: transparent;
  color: rgba(230, 236, 242, 0.85);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  text-align: left;
  font-family: inherit;
}
.menu button:hover {
  background: rgba(127, 199, 255, 0.18);
  color: #fff;
}
</style>
