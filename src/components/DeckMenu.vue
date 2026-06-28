<script setup lang="ts">
import { ref } from 'vue'
import { listDecks, supportsFS, supportsDir } from '../api'
import type { DeckRef } from '../storage/types'

defineProps<{ currentName: string }>()
const emit = defineEmits<{
  'open-file': []
  'open-folder': []
  'save-as': []
  new: []
  open: [file: string]
  export: []
  import: [file: File]
}>()

const open = ref(false)
const importInput = ref<HTMLInputElement | null>(null)
function pickImport() {
  open.value = false
  importInput.value?.click()
}
function onImportPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) emit('import', f)
  input.value = ''
}
const decks = ref<DeckRef[]>([])
const fs = supportsFS()
const dir = supportsDir()

async function toggle() {
  open.value = !open.value
  if (open.value) {
    try {
      decks.value = await listDecks()
    } catch {
      decks.value = []
    }
  }
}
function openFile() {
  open.value = false
  emit('open-file')
}
function openFolder() {
  open.value = false
  emit('open-folder')
}
function saveAs() {
  open.value = false
  emit('save-as')
}
function newDeck() {
  open.value = false
  emit('new')
}
function pick(file: string) {
  open.value = false
  emit('open', file)
}
function exportDeck() {
  open.value = false
  emit('export')
}
</script>

<template>
  <div class="dm">
    <button class="dm-trigger" title="Decks" @click="toggle">
      <span class="nm">{{ currentName || 'deck' }}</span>
      <span class="caret">▾</span>
    </button>

    <input ref="importInput" type="file" accept=".pptx,.pdf" style="display: none" @change="onImportPick" />

    <template v-if="open">
      <div class="dm-backdrop" @click="open = false" />
      <div class="dm-menu">
        <div class="dm-grp">
          <button @click="newDeck">＋ New deck…</button>
          <button @click="pickImport">⬇ Import (PowerPoint / PDF)…</button>
          <button v-if="dir" @click="openFolder">📁 Open folder…</button>
          <button v-if="fs" title="Opens the deck and its matching Assets folder" @click="openFile">
            📄 Open file…
          </button>
          <button v-if="dir" @click="saveAs">⤓ Save As… (folder + images)</button>
          <button @click="exportDeck">⇪ Export (PDF / HTML)…</button>
        </div>
        <div v-if="decks.length" class="dm-grp">
          <div class="dm-lbl">Decks</div>
          <button v-for="d in decks" :key="d.file" class="dm-deck" @click="pick(d.file)">{{ d.name }}</button>
        </div>
        <div v-if="!fs" class="dm-note">
          Open / Save As need the File System Access API (a Chromium browser with it enabled).
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dm {
  position: relative;
}
.dm-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e6ecf2;
  border-radius: 8px;
  padding: 5px 10px;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}
.dm-trigger:hover {
  background: rgba(255, 255, 255, 0.1);
}
.dm-trigger .nm {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dm-trigger .caret {
  color: rgba(230, 236, 242, 0.5);
}
.dm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
}
.dm-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 91;
  min-width: 240px;
  max-height: 70vh;
  overflow-y: auto;
  background: rgba(18, 20, 24, 0.98);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 6px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  font-family: 'JetBrains Mono', monospace;
}
.dm-grp {
  padding: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.dm-grp:last-child {
  border-bottom: none;
}
.dm-lbl {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
  color: rgba(230, 236, 242, 0.4);
  padding: 4px 8px;
}
.dm-menu button {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: #e6ecf2;
  border-radius: 7px;
  padding: 7px 9px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dm-menu button:hover {
  background: rgba(127, 199, 255, 0.12);
}
.dm-note {
  padding: 8px;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.4);
}
</style>
