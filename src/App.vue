<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { Deck, LayoutId, Slide } from './core/types'
import { blankSlide } from './core/deck'
import { fetchDeck, saveSlide, saveDeck, uploadImage } from './api'
import DeckView from './components/Deck.vue'
import TopBar from './components/TopBar.vue'
import SlideNavigator from './components/SlideNavigator.vue'

const deck = ref<Deck | null>(null)
const current = ref(0)
const error = ref<string | null>(null)

const editMode = ref(false)
const autosave = ref(true)
const saveStatus = ref<'saved' | 'unsaved' | 'saving'>('saved')

const selected = ref<number[]>([])
let anchor = 0

onMounted(async () => {
  try {
    deck.value = await fetchDeck()
  } catch (e) {
    error.value = (e as Error).message
  }
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => window.removeEventListener('keydown', onKey))

function enterEdit() {
  editMode.value = true
  selected.value = [current.value]
  anchor = current.value
}

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    editMode.value ? (editMode.value = false) : enterEdit()
  } else if (e.key === 'Escape' && editMode.value) {
    const ae = document.activeElement as HTMLElement | null
    if (ae?.isContentEditable) ae.blur()
    else editMode.value = false
  }
}

// ── saving ──
let timer: ReturnType<typeof setTimeout> | null = null
function scheduleSlideSave() {
  saveStatus.value = 'unsaved'
  if (!autosave.value) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void saveCurrentSlide(), 700)
}
async function saveCurrentSlide() {
  if (!deck.value) return
  saveStatus.value = 'saving'
  try {
    await saveSlide(current.value, deck.value.slides[current.value])
    saveStatus.value = 'saved'
  } catch {
    saveStatus.value = 'unsaved'
  }
}
async function saveWholeDeck() {
  if (!deck.value) return
  saveStatus.value = 'saving'
  try {
    await saveDeck(deck.value.config, deck.value.slides)
    saveStatus.value = 'saved'
  } catch {
    saveStatus.value = 'unsaved'
  }
}

// ── field edits ──
function patchSlide(p: Partial<Slide>) {
  if (!deck.value) return
  deck.value.slides[current.value] = { ...deck.value.slides[current.value], ...p }
  scheduleSlideSave()
}
function changeLayout(id: LayoutId) {
  patchSlide({ layout: id })
}

// ── selection ──
function onSelect(e: { index: number; shift: boolean; meta: boolean }) {
  current.value = e.index
  if (e.shift) {
    const [a, b] = [anchor, e.index].sort((x, y) => x - y)
    selected.value = Array.from({ length: b - a + 1 }, (_, k) => a + k)
  } else if (e.meta) {
    const set = new Set(selected.value)
    set.has(e.index) ? set.delete(e.index) : set.add(e.index)
    selected.value = [...set]
    anchor = e.index
  } else {
    selected.value = [e.index]
    anchor = e.index
  }
}

// ── slide array ops ──
function addSlide(id: LayoutId) {
  if (!deck.value) return
  deck.value.slides.splice(current.value + 1, 0, blankSlide(id))
  current.value += 1
  selected.value = [current.value]
  void saveWholeDeck()
}
function duplicateSlide() {
  if (!deck.value) return
  deck.value.slides.splice(current.value + 1, 0, structuredClone(deck.value.slides[current.value]))
  current.value += 1
  selected.value = [current.value]
  void saveWholeDeck()
}
function removeSlide() {
  if (!deck.value || deck.value.slides.length <= 1) return
  deck.value.slides.splice(current.value, 1)
  current.value = Math.min(current.value, deck.value.slides.length - 1)
  selected.value = [current.value]
  void saveWholeDeck()
}

function reorder(e: { from: number; before: number }) {
  if (!deck.value) return
  const arr = deck.value.slides
  const [item] = arr.splice(e.from, 1)
  const to = e.before > e.from ? e.before - 1 : e.before
  arr.splice(to, 0, item)
  current.value = to
  selected.value = [to]
  anchor = to
  void saveWholeDeck()
}

// ── grouping ──
function uniqueGroupName(): string {
  const used = new Set(deck.value!.slides.map((s) => s.group).filter(Boolean))
  let n = 1
  while (used.has(`Group ${n}`)) n++
  return `Group ${n}`
}
function groupSelected() {
  if (!deck.value || selected.value.length < 1) return
  const sorted = [...new Set(selected.value)].sort((a, b) => a - b)
  const name = uniqueGroupName()
  const block = sorted.map((i) => ({ ...deck.value!.slides[i], group: name }))
  const remaining = deck.value.slides.filter((_, i) => !sorted.includes(i))
  const insertAt = sorted[0]
  remaining.splice(insertAt, 0, ...block)
  deck.value.slides = remaining
  current.value = insertAt
  selected.value = block.map((_, k) => insertAt + k)
  anchor = insertAt
  void saveWholeDeck()
}
function joinGroup(e: { from: number; name: string }) {
  if (!deck.value) return
  const arr = deck.value.slides
  let runStart = arr.findIndex((s) => s.group === e.name)
  if (runStart < 0) return
  let runEnd = runStart
  while (runEnd + 1 < arr.length && arr[runEnd + 1].group === e.name) runEnd++
  const [item] = arr.splice(e.from, 1)
  item.group = e.name
  let insertAt = runEnd + 1
  if (e.from <= runEnd) insertAt--
  arr.splice(insertAt, 0, item)
  current.value = insertAt
  selected.value = [insertAt]
  anchor = insertAt
  void saveWholeDeck()
}
function ungroup(name: string) {
  if (!deck.value) return
  for (const s of deck.value.slides) if (s.group === name) delete s.group
  void saveWholeDeck()
}
function renameGroup(e: { indices: number[]; name: string }) {
  if (!deck.value) return
  for (const i of e.indices) deck.value.slides[i].group = e.name
  void saveWholeDeck()
}

// ── image upload ──
async function onUpload(e: { field: 'image' | 'portraits' | 'gallery'; file: File; index?: number }) {
  if (!deck.value) return
  const dataUrl: string = await new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(e.file)
  })
  const url = await uploadImage(e.file.name, dataUrl)
  const slide = deck.value.slides[current.value]
  if (e.field === 'image') {
    patchSlide({ image: url, focus: { x: 0, y: 0, scale: 1 } })
  } else if (e.field === 'portraits') {
    const portraits = [...(slide.portraits ?? [])]
    portraits[e.index ?? portraits.length] = url
    patchSlide({ portraits })
  } else if (e.field === 'gallery') {
    const items = (slide.items ?? []).map((it) => (typeof it === 'string' ? { image: it } : { ...it }))
    if (e.index != null && items[e.index]) items[e.index].image = url
    patchSlide({ items })
  }
}
</script>

<template>
  <div class="app-root" :class="{ editing: editMode }">
    <TopBar
      v-if="deck && editMode"
      :deck="deck"
      :index="current"
      :selected-count="selected.length"
      :save-status="saveStatus"
      :autosave="autosave"
      @change-layout="changeLayout"
      @patch="patchSlide"
      @add="addSlide"
      @duplicate="duplicateSlide"
      @remove="removeSlide"
      @group="groupSelected"
      @toggle-autosave="autosave = !autosave"
      @save="saveCurrentSlide"
      @close="editMode = false"
    />

    <div class="body">
      <SlideNavigator
        v-if="deck && editMode"
        :deck="deck"
        :current="current"
        :selected="selected"
        @update:current="current = $event"
        @select="onSelect"
        @reorder="reorder"
        @join-group="joinGroup"
        @ungroup="ungroup"
        @rename="renameGroup"
      />

      <DeckView
        v-if="deck"
        v-model="current"
        :deck="deck"
        :editable="editMode"
        @patch="patchSlide"
        @upload="onUpload"
      />
      <div v-else-if="error" class="msg err">{{ error }}</div>
      <div v-else class="msg">loading…</div>
    </div>

    <!-- present-mode chrome -->
    <button v-if="deck && !editMode" class="edit-fab" title="Edit (Ctrl+E)" @click="enterEdit">✎</button>
    <div v-if="deck && !editMode" class="hud">
      <button @click="current = Math.max(0, current - 1)">←</button>
      <span>{{ current + 1 }} / {{ deck.slides.length }}</span>
      <button @click="current = Math.min(deck.slides.length - 1, current + 1)">→</button>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-height: 0;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.msg {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-family: 'JetBrains Mono', monospace;
}
.msg.err {
  color: #f87171;
}
.edit-fab {
  position: fixed;
  bottom: 18px;
  right: 18px;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(37, 99, 235, 0.9);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  z-index: 70;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s;
}
.edit-fab:hover { transform: scale(1.08); }
.hud {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: rgba(18, 20, 24, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  color: rgba(230, 236, 242, 0.7);
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  z-index: 50;
}
.hud button {
  background: transparent;
  border: none;
  color: rgba(230, 236, 242, 0.7);
  cursor: pointer;
  font-size: 16px;
  padding: 2px 8px;
}
.hud button:hover { color: #fff; }
</style>
