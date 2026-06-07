<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Deck, DeckConfig, LayoutId, Slide, SlideElement } from './core/types'
import { blankSlide } from './core/deck'
import { convertLayout } from './core/convert'
import { analyzeDeck } from './core/analyze'
import {
  fetchDeck,
  saveSlide,
  saveDeck,
  uploadImage,
  openDeck,
  newDeck,
  openLocalFile,
  openLocalFolder,
  saveLocalFolderAs,
} from './api'
import DeckView from './components/Deck.vue'
import TopBar from './components/TopBar.vue'
import SlideNavigator from './components/SlideNavigator.vue'
import Overview from './components/Overview.vue'
import Presenter from './components/Presenter.vue'
import ExportView from './components/ExportView.vue'
import EditableText from './components/EditableText.vue'
import DeckMenu from './components/DeckMenu.vue'
import ReviewPanel from './components/ReviewPanel.vue'
import SourcePane from './components/SourcePane.vue'
import type { CanvasTool, ElementPatch, BoxElement } from './core/types'
import { parseContent, rowsToContent } from './render/inline'

const deck = ref<Deck | null>(null)
const current = ref(0)
const error = ref<string | null>(null)

const editMode = ref(true) // start in the editor; "Present" switches to present mode
const showSource = ref(false) // raw Markdown source pane (right dock)
const autosave = ref(true)
const saveStatus = ref<'saved' | 'unsaved' | 'saving'>('saved')
const bulletFormatCommand = ref(0)

// ── canvas (free elements) ──
const activeTool = ref<CanvasTool>('select')
const selectedEl = ref<number | null>(null)
watch(current, () => {
  selectedEl.value = null
  activeTool.value = 'select'
})
const selectedElement = computed(() => {
  if (!deck.value || selectedEl.value == null) return null
  return deck.value.slides[current.value]?.elements?.[selectedEl.value] ?? null
})

// present-mode views
const overviewOpen = ref(false)
const presenterOpen = ref(false) // in-app overlay fallback when a popup is blocked
const exportOpen = ref(false)
const reviewOpen = ref(false)

// ── presenter popup (a separate window for a second monitor) ──
// Opens the app with ?view=presenter and keeps it in sync over a BroadcastChannel:
// it sends the current index on change, answers the popup's hello, and accepts
// navigation back so advancing in either window moves both.
const presenterWin = ref<Window | null>(null)
const presenterBC = new BroadcastChannel('dek-presenter')
presenterBC.onmessage = (e: MessageEvent) => {
  const m = e.data as { type?: string; index?: number }
  if (!m) return
  if (m.type === 'nav' && typeof m.index === 'number') current.value = m.index
  else if (m.type === 'hello') presenterBC.postMessage({ type: 'state', index: current.value })
  else if (m.type === 'bye') presenterWin.value = null
}
watch(current, (i) => presenterBC.postMessage({ type: 'state', index: i }))
function openPresenter() {
  if (presenterWin.value && !presenterWin.value.closed) {
    presenterWin.value.focus()
    return
  }
  const url = new URL(location.href)
  url.searchParams.set('view', 'presenter')
  const w = window.open(url.toString(), 'dek-presenter', 'popup,width=1100,height=700')
  if (!w) {
    presenterOpen.value = true // popup blocked → fall back to the in-app overlay
    return
  }
  presenterWin.value = w
  if (editMode.value) editMode.value = false // the main window becomes the audience view
}
const analysis = computed(() => (deck.value ? analyzeDeck(deck.value) : null))
const reviewCount = computed(() => {
  const c = analysis.value?.counts
  return c ? c.error + c.warning + c.info : 0
})
function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
  else document.exitFullscreen?.()
}

// auto-hide present-mode chrome after a few seconds of no mouse movement
const uiHidden = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | null = null
function resetIdle() {
  if (uiHidden.value) uiHidden.value = false
  if (idleTimer) clearTimeout(idleTimer)
  if (!editMode.value) idleTimer = setTimeout(() => (uiHidden.value = true), 3000)
}
watch(editMode, (on) => {
  if (on) {
    uiHidden.value = false
    if (idleTimer) clearTimeout(idleTimer)
  } else {
    resetIdle()
  }
})

const selected = ref<number[]>([0])
let anchor = 0

// ── undo / redo history ──
interface Snap {
  config: DeckConfig
  slides: Slide[]
  index: number
}
const past = ref<Snap[]>([])
const future = ref<Snap[]>([])
let lastSnapKey = ''
let lastSnapTime = 0
const canUndo = computed(() => past.value.length > 0)
const canRedo = computed(() => future.value.length > 0)

function cloneState(): Snap {
  return {
    config: JSON.parse(JSON.stringify(deck.value!.config)),
    slides: JSON.parse(JSON.stringify(deck.value!.slides)),
    index: current.value,
  }
}
/** Record a checkpoint before a mutation. `coalesce` merges rapid same-key edits
 *  (e.g. typing) into a single undo step. */
function snap(key: string, coalesce = false) {
  if (!deck.value) return
  const now = Date.now()
  if (coalesce && key === lastSnapKey && now - lastSnapTime < 800) {
    lastSnapTime = now
    return
  }
  past.value.push(cloneState())
  if (past.value.length > 80) past.value.shift()
  future.value = []
  lastSnapKey = key
  lastSnapTime = now
}
function applySnap(s: Snap) {
  deck.value!.config = s.config
  deck.value!.slides = s.slides
  current.value = Math.min(s.index, s.slides.length - 1)
  selected.value = [current.value]
  anchor = current.value
  lastSnapKey = ''
  void saveWholeDeck()
}
function undo() {
  if (!past.value.length) return
  future.value.push(cloneState())
  applySnap(past.value.pop()!)
}
function redo() {
  if (!future.value.length) return
  past.value.push(cloneState())
  applySnap(future.value.pop()!)
}

onMounted(async () => {
  try {
    deck.value = await fetchDeck()
  } catch (e) {
    error.value = (e as Error).message
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousemove', resetIdle)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousemove', resetIdle)
  if (idleTimer) clearTimeout(idleTimer)
  presenterBC.close()
})

// ── deck files: open / save-as / new / switch ──
function applyDeck(d: Deck) {
  deck.value = d
  current.value = 0
  selected.value = [0]
  anchor = 0
  past.value = []
  future.value = []
  saveStatus.value = 'saved'
}
function isAbort(e: unknown) {
  return (e as { name?: string })?.name === 'AbortError'
}
async function onOpenFile() {
  try {
    applyDeck(await openLocalFile())
  } catch (e) {
    if (!isAbort(e)) error.value = (e as Error).message
  }
}
async function onOpenFolder() {
  try {
    applyDeck(await openLocalFolder())
  } catch (e) {
    if (!isAbort(e)) error.value = (e as Error).message
  }
}
async function onOpenDeck(file: string) {
  try {
    applyDeck(await openDeck(file))
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function onSaveAs() {
  if (!deck.value) return
  const name = deck.value.config.deck ?? 'deck'
  try {
    applyDeck(await saveLocalFolderAs(name, deck.value.config, deck.value.slides))
    saveStatus.value = 'saved'
  } catch (e) {
    if (!isAbort(e)) error.value = (e as Error).message
  }
}
async function onNewDeck() {
  const n = window.prompt('New deck name:', 'Untitled')
  if (!n) return
  try {
    await newDeck(n)
    applyDeck(await fetchDeck())
  } catch (e) {
    error.value = (e as Error).message
  }
}

function enterEdit() {
  editMode.value = true
  selected.value = [current.value]
  anchor = current.value
}

function jumpToSlide(index: number) {
  current.value = Math.max(0, Math.min(deck.value ? deck.value.slides.length - 1 : 0, index))
  selected.value = [current.value]
  anchor = current.value
}

// A field is "typing" if it's contenteditable OR a native form control — in any
// of these the global shortcuts must yield to the field (arrows, letters, undo).
function isTyping(el: HTMLElement | null): boolean {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}
function onKey(e: KeyboardEvent) {
  const ae = document.activeElement as HTMLElement | null
  const typing = isTyping(ae)
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    editMode.value ? (editMode.value = false) : enterEdit()
  } else if (mod && e.shiftKey && e.code === 'Digit8') {
    e.preventDefault()
    onFormat('bullet')
  } else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    if (typing) return // let the field's native undo win
    e.preventDefault()
    undo()
  } else if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
    if (typing) return
    e.preventDefault()
    redo()
  } else if (e.key === 'Escape' && editMode.value) {
    if (typing) ae!.blur()
    else if (selectedEl.value != null) {
      selectedEl.value = null
      activeTool.value = 'select'
    } else editMode.value = false
  } else if (
    editMode.value &&
    selectedEl.value != null &&
    !typing &&
    (e.key === 'Delete' || e.key === 'Backspace')
  ) {
    e.preventDefault()
    deleteSelectedElement()
  } else if (editMode.value && !mod && !typing) {
    // canvas tool shortcuts
    const k = e.key.toLowerCase()
    if (k === 'v') activeTool.value = 'select'
    else if (k === 't') activeTool.value = 'text'
  } else if (!mod && !editMode.value && !typing && !overviewOpen.value && !presenterOpen.value) {
    // present-mode single-key shortcuts
    const k = e.key.toLowerCase()
    if (k === 'f') {
      e.preventDefault()
      toggleFullscreen()
    } else if (k === 'o') {
      e.preventDefault()
      overviewOpen.value = true
    } else if (k === 'p' || k === 's') {
      e.preventDefault()
      openPresenter()
    }
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
function scheduleWholeDeckSave() {
  saveStatus.value = 'unsaved'
  if (!autosave.value) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void saveWholeDeck(), 700)
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
  snap(`patch:${current.value}:${Object.keys(p).join(',')}`, true)
  deck.value.slides[current.value] = { ...deck.value.slides[current.value], ...p }
  scheduleSlideSave()
}
function patchConfig(p: Partial<DeckConfig>) {
  if (!deck.value) return
  snap(`config:${Object.keys(p).join(',')}`, true)
  deck.value.config = { ...deck.value.config, ...p }
  scheduleWholeDeckSave()
}
/** Apply an edit made in the raw Markdown source pane: replace the whole deck
 *  with the re-parsed result. Coalesced into one undo step per typing burst. */
function applySource(d: Deck) {
  if (!deck.value) return
  snap('source-edit', true)
  deck.value.config = d.config
  deck.value.slides = d.slides
  if (current.value > d.slides.length - 1) current.value = Math.max(0, d.slides.length - 1)
  selected.value = [Math.min(current.value, Math.max(0, d.slides.length - 1))]
  scheduleWholeDeckSave()
}
function changeLayout(id: LayoutId) {
  if (!deck.value) return
  const s = deck.value.slides[current.value]
  if (s.layout === id) return
  // convertLayout maps shared content across the two layouts and parks the rest
  // in `stash` (reversible), so nothing is lost and nothing renders twice.
  snap('layout')
  deck.value.slides[current.value] = convertLayout(s, id)
  selectedEl.value = null
  scheduleSlideSave()
}

// ── canvas element ops ──
/** Convert the current slide into a freeform canvas, baking its layout fields
 *  into elements (and optionally appending a freshly-created one). */
function bakeCurrentToFreeform(extra?: SlideElement) {
  if (!deck.value) return
  const s = deck.value.slides[current.value]
  const fresh = convertLayout(s, 'freeform')
  if (!fresh.elements) fresh.elements = []
  if (extra) fresh.elements.push(extra)
  snap('bake-freeform')
  deck.value.slides[current.value] = fresh
  selectedEl.value = extra ? fresh.elements.length - 1 : null
  scheduleSlideSave()
}
function onCreateElement(el: SlideElement) {
  if (!deck.value) return
  const s = deck.value.slides[current.value]
  if (s.layout === 'freeform') {
    const els = [...(s.elements ?? []), el]
    patchSlide({ elements: els })
    selectedEl.value = els.length - 1
  } else {
    // Any semantic layout converts to a freeform canvas, baking its content
    // (text, images, video, diagram) into movable elements first.
    bakeCurrentToFreeform(el)
  }
  activeTool.value = 'select'
}
function onUpdateElements(els: SlideElement[]) {
  patchSlide({ elements: els })
}
/** Upload a picked file and return its served URL. */
async function fileToUrl(file: File): Promise<string> {
  const dataUrl: string = await new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.readAsDataURL(file)
  })
  return uploadImage(file.name, dataUrl)
}
/** Add / replace the selected box's image (it becomes an image-carrying box). */
async function onSetElementImage(file: File) {
  const url = await fileToUrl(file)
  onUpdateElement({ src: url, fit: 'cover' })
}
/** Insert a new image as a box on the canvas (bakes to freeform if needed). */
async function onInsertImage(file: File) {
  const url = await fileToUrl(file)
  const el: SlideElement = {
    type: 'box',
    x: 480, y: 230, w: 320, h: 220, rotation: 0,
    src: url, fit: 'cover', fill: 'transparent', stroke: 'transparent',
  }
  onCreateElement(el)
}
/** Patch the currently-selected element (from the top bar's style controls). */
function onUpdateElement(p: ElementPatch) {
  if (!deck.value || selectedEl.value == null) return
  const s = deck.value.slides[current.value]
  if (!s.elements) return
  const els = s.elements.map((el, i) => (i === selectedEl.value ? ({ ...el, ...p } as SlideElement) : el))
  patchSlide({ elements: els })
}
function deleteSelectedElement() {
  if (!deck.value || selectedEl.value == null) return
  const s = deck.value.slides[current.value]
  if (!s.elements) return
  patchSlide({ elements: s.elements.filter((_, i) => i !== selectedEl.value) })
  selectedEl.value = null
}
function onInsert(what: 'video' | 'diagram' | 'table') {
  if (!deck.value) return
  if (what === 'video') addSlide('video-embed')
  else if (what === 'diagram') addSlide('diagram')
  else {
    // table: a freeform slide seeded with an editable HTML table
    snap('add')
    const body =
      '<table style="width:100%; border-collapse:collapse; font-size:1.2rem;">\n' +
      '  <tr><th>Column A</th><th>Column B</th></tr>\n' +
      '  <tr><td>—</td><td>—</td></tr>\n' +
      '  <tr><td>—</td><td>—</td></tr>\n' +
      '</table>'
    deck.value.slides.splice(current.value + 1, 0, { layout: 'freeform', body })
    current.value += 1
    selected.value = [current.value]
    void saveWholeDeck()
  }
}
function toggleSelectedBullets() {
  bulletFormatCommand.value += 1
}

// ── text formatting (works on whatever text is being edited) ──
// Every editable surface here is contenteditable — the semantic title/list AND
// canvas text boxes — so one DOM-level helper formats the active selection with
// Markdown markers, no per-component wiring and no forced freeform conversion.
const INLINE_MARKS: Record<string, [string, string]> = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  underline: ['<u>', '</u>'],
  strike: ['~~', '~~'],
}
// Native execCommand names for the WYSIWYG (rich) surfaces.
const EXEC_CMD: Record<string, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikeThrough',
}
function onFormat(kind: 'bold' | 'italic' | 'underline' | 'strike' | 'bullet') {
  const ae = document.activeElement as HTMLElement | null
  const editing = !!ae && ae.isContentEditable
  if (kind === 'bullet') {
    if (editing) toggleSelectedBullets()
    else if (selectedElement.value?.type === 'box') toggleBoxBullets()
    return
  }
  if (editing) {
    // Rich surfaces (the text list, canvas text boxes) render Markdown as live
    // HTML, so toggle real formatting and let them serialize back to Markdown.
    // Plain fields (title, statement, caption…) get literal markers as before.
    const rich = ae!.closest('.editable-list, [data-rich]')
    if (rich) {
      document.execCommand('styleWithCSS', false, 'false')
      document.execCommand(EXEC_CMD[kind])
      return
    }
    const [open, close] = INLINE_MARKS[kind]
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const text = sel.toString()
    // insertText replaces the selection, fires `input`, and is natively undoable.
    document.execCommand('insertText', false, open + text + close)
  } else if (selectedElement.value?.type === 'box') {
    const b = selectedElement.value as BoxElement
    onUpdateElement({ [kind]: !b[kind] } as ElementPatch)
  }
}
/** Toggle `- ` bullets across all lines of the selected box's content. */
function toggleBoxBullets() {
  const b = selectedElement.value
  if (selectedEl.value == null || b?.type !== 'box') return
  const rows = parseContent((b as BoxElement).content)
  if (!rows.length) return
  const allBullets = rows.every((r) => r.bullet)
  onUpdateElement({ content: rowsToContent(rows.map((r) => ({ ...r, bullet: !allBullets }))) })
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
  snap('add')
  deck.value.slides.splice(current.value + 1, 0, blankSlide(id))
  current.value += 1
  selected.value = [current.value]
  void saveWholeDeck()
}
function duplicateSlide() {
  if (!deck.value) return
  snap('duplicate')
  // JSON-clone (not structuredClone): the slide is a Vue reactive proxy, which
  // structuredClone rejects with DataCloneError.
  const copy = JSON.parse(JSON.stringify(deck.value.slides[current.value])) as Slide
  deck.value.slides.splice(current.value + 1, 0, copy)
  current.value += 1
  selected.value = [current.value]
  void saveWholeDeck()
}
function removeSlide() {
  if (!deck.value || deck.value.slides.length <= 1) return
  snap('remove')
  // delete all selected (descending so indices stay valid)
  const kill = [...new Set(selected.value.length ? selected.value : [current.value])].sort((a, b) => b - a)
  for (const i of kill) deck.value.slides.splice(i, 1)
  current.value = Math.min(Math.min(...kill), deck.value.slides.length - 1)
  selected.value = [current.value]
  anchor = current.value
  void saveWholeDeck()
}

/** Block move: relocate one or more slides (preserving their order) before `before`. */
function reorder(e: { indices: number[]; before: number }) {
  if (!deck.value) return
  snap('reorder')
  const arr = deck.value.slides
  const sorted = [...new Set(e.indices)].sort((a, b) => a - b)
  const block = sorted.map((i) => arr[i])
  const remaining = arr.filter((_, i) => !sorted.includes(i))
  const insertAt = Math.max(0, Math.min(remaining.length, e.before - sorted.filter((i) => i < e.before).length))
  remaining.splice(insertAt, 0, ...block)
  deck.value.slides = remaining
  current.value = insertAt
  selected.value = block.map((_, k) => insertAt + k)
  anchor = insertAt
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
  snap('group')
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
  snap('join-group')
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
  snap('ungroup')
  for (const s of deck.value.slides) if (s.group === name) delete s.group
  void saveWholeDeck()
}
function renameGroup(e: { indices: number[]; name: string }) {
  if (!deck.value) return
  snap('rename-group')
  for (const i of e.indices) deck.value.slides[i].group = e.name
  void saveWholeDeck()
}

// ── image upload ──
async function onUpload(e: { field: 'image' | 'poster' | 'portraits' | 'gallery'; file: File; index?: number }) {
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
  } else if (e.field === 'poster') {
    patchSlide({ poster: url })
  } else if (e.field === 'portraits') {
    const portraits = [...(slide.portraits ?? [])]
    portraits[e.index ?? portraits.length] = url
    patchSlide({ portraits })
  } else if (e.field === 'gallery') {
    const items = (slide.items ?? []).flatMap((it): Array<{ image: string; label?: string }> => {
      if (typeof it === 'string') return [{ image: it }]
      if (it && typeof it === 'object' && 'image' in it && typeof it.image === 'string') {
        const item: { image: string; label?: string } = { image: it.image }
        if (typeof it.label === 'string') item.label = it.label
        return [item]
      }
      return []
    })
    if (e.index != null && items[e.index]) items[e.index].image = url
    patchSlide({ items })
  }
}
</script>

<template>
  <div class="app-root" :class="{ editing: editMode, 'cursor-hidden': uiHidden && !editMode }">
    <TopBar
      v-if="deck && editMode"
      :deck="deck"
      :index="current"
      :selected-count="selected.length"
      :save-status="saveStatus"
      :autosave="autosave"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :review-count="reviewCount"
      :tool="activeTool"
      :selected-element="selectedElement"
      :show-source="showSource"
      @change-layout="changeLayout"
      @toggle-source="showSource = !showSource"
      @patch="patchSlide"
      @format="onFormat"
      @update:tool="activeTool = $event"
      @insert="onInsert"
      @update-element="onUpdateElement"
      @set-image="onSetElementImage"
      @insert-image="onInsertImage"
      @add="addSlide"
      @duplicate="duplicateSlide"
      @remove="removeSlide"
      @group="groupSelected"
      @undo="undo"
      @redo="redo"
      @toggle-autosave="autosave = !autosave"
      @save="saveCurrentSlide"
      @close="editMode = false"
      @export="exportOpen = true"
      @review="reviewOpen = !reviewOpen"
      @open-file="onOpenFile"
      @open-folder="onOpenFolder"
      @save-as="onSaveAs"
      @new-deck="onNewDeck"
      @open-deck="onOpenDeck"
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

      <div v-if="deck" class="stage-wrap">
        <DeckView
          v-model="current"
          :deck="deck"
          :editable="editMode"
          :bullet-format-command="bulletFormatCommand"
          :nav-enabled="!overviewOpen && !presenterOpen && !exportOpen"
          :tool="activeTool"
          :selected-el="selectedEl"
          @patch="patchSlide"
          @config-patch="patchConfig"
          @upload="onUpload"
          @update:elements="onUpdateElements"
          @update:selected-el="selectedEl = $event"
          @create-element="onCreateElement"
          @tool-reset="activeTool = 'select'"
        />
      </div>
      <div v-else-if="error" class="msg err">{{ error }}</div>
      <div v-else class="msg">loading…</div>

      <SourcePane
        v-if="deck && editMode && showSource"
        :deck="deck"
        @apply="applySource"
        @close="showSource = false"
      />
    </div>

    <ReviewPanel
      v-if="deck && editMode && reviewOpen && analysis"
      :analysis="analysis"
      :current="current"
      @jump="jumpToSlide"
      @close="reviewOpen = false"
    />

    <!-- edit-mode speaker-notes strip -->
    <div v-if="deck && editMode" class="notes-bar">
      <span class="notes-label">Notes</span>
      <EditableText
        class="notes-input"
        multiline
        :model-value="deck.slides[current]?.notes"
        placeholder="Speaker notes for this slide (shown in Presenter view)…"
        @update:model-value="patchSlide({ notes: $event })"
      />
    </div>

    <!-- present-mode chrome (fades out when idle) -->
    <div v-if="deck && !editMode" class="deck-menu-present present-chrome" :class="{ 'ui-hidden': uiHidden }">
      <DeckMenu
        :current-name="deck.config.deck ?? 'deck'"
        @open-file="onOpenFile"
        @open-folder="onOpenFolder"
        @save-as="onSaveAs"
        @new="onNewDeck"
        @open="onOpenDeck"
      />
    </div>
    <div v-if="deck && !editMode" class="hud present-chrome" :class="{ 'ui-hidden': uiHidden }">
      <button @click="current = Math.max(0, current - 1)" title="Previous">←</button>
      <span>{{ current + 1 }} / {{ deck.slides.length }}</span>
      <button @click="current = Math.min(deck.slides.length - 1, current + 1)" title="Next">→</button>
      <span class="hud-sep" />
      <button title="Overview (O)" @click="overviewOpen = true">▦</button>
      <button title="Presenter view (P) — opens a separate window" @click="openPresenter">◉</button>
      <button title="Fullscreen (F)" @click="toggleFullscreen">⛶</button>
      <button title="Edit (Ctrl+E)" @click="enterEdit">✎</button>
    </div>

    <!-- overlays -->
    <Overview
      v-if="deck && overviewOpen"
      :deck="deck"
      :current="current"
      @jump="current = $event"
      @close="overviewOpen = false"
    />
    <Presenter
      v-if="deck && presenterOpen"
      :deck="deck"
      :current="current"
      @update:current="current = $event"
      @close="presenterOpen = false"
    />
    <ExportView v-if="deck && exportOpen" :deck="deck" @close="exportOpen = false" />
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
.stage-wrap {
  position: relative;
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
.notes-bar {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 16px;
  max-height: 92px;
  overflow-y: auto;
  background: #101216;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'JetBrains Mono', monospace;
}
.notes-label {
  flex: none;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 10px;
  color: rgba(230, 236, 242, 0.4);
  padding-top: 4px;
}
.notes-input {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
  color: #e6ecf2;
  min-height: 20px;
}
.hud-sep {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.15);
}
.deck-menu-present {
  position: fixed;
  top: 14px;
  left: 14px;
  z-index: 50;
}
.present-chrome {
  transition: opacity 0.5s ease;
}
.present-chrome.ui-hidden {
  opacity: 0;
  pointer-events: none;
}
.app-root.cursor-hidden {
  cursor: none;
}
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
