<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Deck, DeckConfig, LayoutId, Slide, SlideElement } from './core/types'
import { blankSlide } from './core/deck'
import { convertLayout } from './core/convert'
import { newElementRect } from './core/bake'
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
  listDeckAssets,
  deleteDeckAsset,
} from './api'
import { useUndo } from './composables/useUndo'
import { usePresenterSync } from './composables/usePresenterSync'
import { useImport } from './composables/useImport'
import DeckView from './components/Deck.vue'
import TopBar from './components/TopBar.vue'
import SlideNavigator from './components/SlideNavigator.vue'
import Overview from './components/Overview.vue'
import Presenter from './components/Presenter.vue'
import ExportView from './components/ExportView.vue'
import ImportReview from './components/ImportReview.vue'
import EditableText from './components/EditableText.vue'
import DeckMenu from './components/DeckMenu.vue'
import ReviewPanel from './components/ReviewPanel.vue'
import SourcePane from './components/SourcePane.vue'
import ContextMenu, { type CtxEntry } from './components/ContextMenu.vue'
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
// Selected element indices in selection order; the last one is the "primary"
// element whose styles the top bar displays (patches apply to the whole set).
const selectedEls = ref<number[]>([])
// URL of an image waiting to be placed by the image tool (set by Insert image).
const pendingImage = ref('')
watch(current, () => {
  selectedEls.value = []
  activeTool.value = 'select'
})
const primaryEl = computed(() =>
  selectedEls.value.length ? selectedEls.value[selectedEls.value.length - 1] : null,
)
const selectedElement = computed(() => {
  if (!deck.value || primaryEl.value == null) return null
  return deck.value.slides[current.value]?.elements?.[primaryEl.value] ?? null
})

// Track whether the slide navigator was the last thing clicked. Delete then
// removes the selected slide(s) when focus is on the slide list — but on the
// stage/canvas, Delete keeps removing the selected canvas element instead.
const navFocused = ref(false)
function trackClick(e: PointerEvent) {
  navFocused.value = !!(e.target as HTMLElement | null)?.closest?.('.nav')
}

// present-mode views
const overviewOpen = ref(false)
const presenterOpen = ref(false) // in-app overlay fallback when a popup is blocked
const exportOpen = ref(false)
const reviewOpen = ref(false)

// Presenter popup (a separate window for a second monitor) — see usePresenterSync.
const { openPresenter } = usePresenterSync({ deck, current, editMode, presenterOpen })

// Files in the deck's on-disk assets folder (folder backends only). Fed into the
// analysis so the Review panel can surface — and delete — orphaned images.
const diskAssets = ref<string[]>([])
async function refreshDiskAssets() {
  try {
    diskAssets.value = await listDeckAssets()
  } catch {
    diskAssets.value = []
  }
}
const analysis = computed(() => (deck.value ? analyzeDeck(deck.value, diskAssets.value) : null))
const reviewCount = computed(() => {
  const c = analysis.value?.counts
  return c ? c.error + c.warning + c.info : 0
})
function toggleReview() {
  reviewOpen.value = !reviewOpen.value
  if (reviewOpen.value) void refreshDiskAssets() // freshen the orphan list on open
}
async function onDeleteAsset(filename: string) {
  try {
    await deleteDeckAsset(filename)
    await refreshDiskAssets()
  } catch (e) {
    error.value = `Delete failed: ${(e as Error).message}`
  }
}
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

// ── undo / redo history (see useUndo) ──
const { canUndo, canRedo, snap, undo, redo, reset: resetUndo } = useUndo({
  deck,
  current,
  selected,
  setAnchor: (n) => (anchor = n),
  save: () => void saveWholeDeck(),
})

onMounted(async () => {
  try {
    deck.value = await fetchDeck()
    void refreshDiskAssets()
  } catch (e) {
    error.value = (e as Error).message
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('mousemove', resetIdle)
  window.addEventListener('pointerdown', trackClick, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('mousemove', resetIdle)
  window.removeEventListener('pointerdown', trackClick, true)
  if (idleTimer) clearTimeout(idleTimer)
})

// ── deck files: open / save-as / new / switch ──
function applyDeck(d: Deck) {
  deck.value = d
  current.value = 0
  selected.value = [0]
  anchor = 0
  resetUndo()
  saveStatus.value = 'saved'
  void refreshDiskAssets()
}
function isAbort(e: unknown) {
  return (e as { name?: string })?.name === 'AbortError'
}
async function onOpenFile() {
  error.value = ''
  try {
    applyDeck(await openLocalFile())
  } catch (e) {
    if (!isAbort(e)) error.value = `Open file failed: ${(e as Error).message}`
  }
}
async function onOpenFolder() {
  error.value = ''
  try {
    applyDeck(await openLocalFolder())
  } catch (e) {
    if (!isAbort(e)) error.value = `Open folder failed: ${(e as Error).message}`
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
  const currentName = deck.value.config.deck ?? 'deck'
  const name = window.prompt('Save deck as:', currentName)?.trim()
  if (!name) return
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
const { importing, pending: pendingImport, onImportFile, commitImport, cancelImport } = useImport({
  applyDeck,
  save: saveWholeDeck,
  setError: (m) => (error.value = m),
  onImported: () => (editMode.value = true),
})

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
  } else if (editMode.value && mod && !typing && e.key.toLowerCase() === 'c' && selectedEls.value.length) {
    e.preventDefault()
    copySelectedElements()
  } else if (editMode.value && mod && !typing && e.key.toLowerCase() === 'v' && elementClipboard.els.length) {
    e.preventDefault()
    pasteElements()
  } else if (editMode.value && mod && !typing && e.key.toLowerCase() === 'd' && selectedEls.value.length) {
    e.preventDefault()
    duplicateSelectedElements()
  } else if (editMode.value && mod && !typing && (e.key === ']' || e.key === '[') && selectedEls.value.length) {
    e.preventDefault()
    reorderSelectedElements(e.key === ']' ? 1 : -1)
  } else if (e.key === 'Escape' && editMode.value) {
    if (typing) ae!.blur()
    else if (selectedEls.value.length) {
      selectedEls.value = []
      activeTool.value = 'select'
    } else editMode.value = false
  } else if (
    editMode.value &&
    selectedEls.value.length > 0 &&
    !typing &&
    (e.key === 'Delete' || e.key === 'Backspace')
  ) {
    e.preventDefault()
    deleteSelectedElement()
  } else if (
    editMode.value &&
    selectedEls.value.length === 0 &&
    navFocused.value &&
    !typing &&
    e.key === 'Delete'
  ) {
    e.preventDefault()
    removeSlide()
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
  selectedEls.value = []
  scheduleSlideSave()
}

// ── canvas element ops ──
/** Append elements to the current slide, selecting them. A semantic layout is
 *  first converted to a freeform canvas (its content baked into movable
 *  elements) unless it already carries overlay elements — then we just add. */
function appendElements(els: SlideElement[]) {
  if (!deck.value || !els.length) return
  const s = deck.value.slides[current.value]
  if (s.layout === 'freeform' || (s.elements && s.elements.length)) {
    const next = [...(s.elements ?? []), ...els]
    patchSlide({ elements: next })
    selectedEls.value = els.map((_, k) => next.length - els.length + k)
  } else {
    const fresh = convertLayout(s, 'freeform')
    fresh.elements = [...(fresh.elements ?? []), ...els]
    snap('bake-freeform')
    deck.value.slides[current.value] = fresh
    selectedEls.value = els.map((_, k) => fresh.elements!.length - els.length + k)
    scheduleSlideSave()
  }
}
function onCreateElement(el: SlideElement) {
  appendElements([el])
  activeTool.value = 'select'
  pendingImage.value = ''
}

// ── element clipboard / duplicate / z-order ──
const cloneEls = (els: SlideElement[]): SlideElement[] => JSON.parse(JSON.stringify(els))
function currentSelectedElements(): SlideElement[] {
  const els = deck.value?.slides[current.value]?.elements ?? []
  return selectedEls.value.flatMap((i) => (els[i] ? [els[i]] : []))
}
// Module-level so the clipboard survives slide switches (paste across slides).
const elementClipboard: { els: SlideElement[]; slide: number; pastes: number } = { els: [], slide: -1, pastes: 0 }
function copySelectedElements() {
  const els = currentSelectedElements()
  if (!els.length) return
  elementClipboard.els = cloneEls(els)
  elementClipboard.slide = current.value
  elementClipboard.pastes = 0
}
function pasteElements(inPlace = false) {
  if (!elementClipboard.els.length) return
  // Pasting onto the source slide cascades each paste; another slide (or an
  // explicit "Paste In Place") pastes at the original coordinates.
  const sameSlide = current.value === elementClipboard.slide
  const off = inPlace ? 0 : sameSlide ? 24 * ++elementClipboard.pastes : 0
  appendElements(cloneEls(elementClipboard.els).map((el) => ({ ...el, x: el.x + off, y: el.y + off })))
}
function cutSelectedElements() {
  copySelectedElements()
  deleteSelectedElement()
}
/** Move the selected elements to the very front or back of the paint order,
 *  preserving their relative order. */
function reorderSelectedTo(where: 'front' | 'back') {
  if (!deck.value || !selectedEls.value.length) return
  const s = deck.value.slides[current.value]
  if (!s.elements) return
  const sel = new Set(selectedEls.value)
  const picked = s.elements.filter((_, i) => sel.has(i))
  const rest = s.elements.filter((_, i) => !sel.has(i))
  const next = where === 'front' ? [...rest, ...picked] : [...picked, ...rest]
  patchSlide({ elements: next })
  const start = where === 'front' ? rest.length : 0
  selectedEls.value = picked.map((_, k) => start + k)
}
function duplicateSelectedElements() {
  const els = currentSelectedElements()
  if (!els.length) return
  appendElements(cloneEls(els).map((el) => ({ ...el, x: el.x + 24, y: el.y + 24 })))
}
/** Move the selected elements one step forward (+1) or back (−1) in paint order,
 *  preserving their relative order; a block at the edge stays put. */
function reorderSelectedElements(dir: 1 | -1) {
  if (!deck.value || !selectedEls.value.length) return
  const s = deck.value.slides[current.value]
  if (!s.elements) return
  const els = [...s.elements]
  const isSel = els.map((_, i) => selectedEls.value.includes(i))
  if (dir === 1) {
    for (let i = els.length - 2; i >= 0; i--) {
      if (isSel[i] && !isSel[i + 1]) {
        ;[els[i], els[i + 1]] = [els[i + 1], els[i]]
        ;[isSel[i], isSel[i + 1]] = [isSel[i + 1], isSel[i]]
      }
    }
  } else {
    for (let i = 1; i < els.length; i++) {
      if (isSel[i] && !isSel[i - 1]) {
        ;[els[i], els[i - 1]] = [els[i - 1], els[i]]
        ;[isSel[i], isSel[i - 1]] = [isSel[i - 1], isSel[i]]
      }
    }
  }
  patchSlide({ elements: els })
  selectedEls.value = isSel.flatMap((v, i) => (v ? [i] : []))
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
  const url = await uploadImage(file.name, dataUrl)
  void refreshDiskAssets() // a new file landed in the assets folder
  return url
}
/** Replace the image on a specific canvas box element (via the in-frame replace button). */
async function onElementImage(index: number, file: File) {
  if (!deck.value) return
  const url = await fileToUrl(file)
  const s = deck.value.slides[current.value]
  if (!s.elements) return
  const els = s.elements.map((el, i) =>
    i === index ? ({ ...el, src: url, fit: 'cover' } as SlideElement) : el,
  )
  patchSlide({ elements: els })
}
/** A file was dropped on the canvas (from Explorer / desktop / another window):
 *  onto a box → set that box's image; onto empty canvas → new image box, sized
 *  proportionally to the image and centred on the drop point. */
async function onDropImage(
  file: File,
  target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number },
) {
  if (!deck.value) return
  const url = await fileToUrl(file)
  if (target.kind === 'box') {
    const s = deck.value.slides[current.value]
    if (!s.elements) return
    const els = s.elements.map((el, i) =>
      i === target.index ? ({ ...el, src: url, fit: 'cover' } as SlideElement) : el,
    )
    patchSlide({ elements: els })
    return
  }
  // Read natural dimensions so the new box keeps the image's aspect ratio.
  const dims = await new Promise<{ w: number; h: number }>((res) => {
    const img = new Image()
    img.onload = () => res({ w: img.naturalWidth || 400, h: img.naturalHeight || 300 })
    img.onerror = () => res({ w: 400, h: 300 })
    img.src = url
  })
  const scale = Math.min(1, 480 / dims.w)
  const w = Math.round(dims.w * scale)
  const h = Math.round(dims.h * scale)
  // Centre on the drop point, clamped inside the 1280×720 stage.
  const x = Math.max(0, Math.min(1280 - w, target.x - w / 2))
  const y = Math.max(0, Math.min(720 - h, target.y - h / 2))
  onCreateElement(newElementRect('image', x, y, w, h, url))
}
/** Insert an image: upload it, then arm the image tool so the next click-drag on
 *  the canvas places it at the dragged position and size. */
async function onInsertImage(file: File) {
  const url = await fileToUrl(file)
  pendingImage.value = url
  activeTool.value = 'image'
}
/** Patch every selected element (top-bar style controls apply to the whole selection). */
function onUpdateElement(p: ElementPatch) {
  if (!deck.value || !selectedEls.value.length) return
  const s = deck.value.slides[current.value]
  if (!s.elements) return
  const sel = new Set(selectedEls.value)
  const els = s.elements.map((el, i) => (sel.has(i) ? ({ ...el, ...p } as SlideElement) : el))
  patchSlide({ elements: els })
}
/** Patch one element by index (for ops that only make sense on a single target). */
function patchElementAt(index: number, p: ElementPatch) {
  if (!deck.value) return
  const s = deck.value.slides[current.value]
  if (!s.elements?.[index]) return
  const els = s.elements.map((el, i) => (i === index ? ({ ...el, ...p } as SlideElement) : el))
  patchSlide({ elements: els })
}
function deleteSelectedElement() {
  if (!deck.value || !selectedEls.value.length) return
  const s = deck.value.slides[current.value]
  if (!s.elements) return
  const sel = new Set(selectedEls.value)
  patchSlide({ elements: s.elements.filter((_, i) => !sel.has(i)) })
  selectedEls.value = []
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

// ── context menu ──────────────────────────────────────────────────────────────
// A single floating menu whose contents depend on what was right-clicked: empty
// canvas, one element, an image box, a multi-selection, or a navigator thumbnail.
// Every entry reuses an action already wired for the keyboard/top-bar paths.
const ctxMenu = ref<{ x: number; y: number; items: CtxEntry[] } | null>(null)
function closeCtx() {
  ctxMenu.value = null
}
// A hidden input drives "Replace Image…" from the menu (the in-frame button has
// its own input down in CanvasElements; the menu can't reach that one).
const ctxImgInput = ref<HTMLInputElement | null>(null)
const ctxImgIdx = ref<number | null>(null)
function replaceImageAt(index: number) {
  ctxImgIdx.value = index
  ctxImgInput.value?.click()
}
function onCtxImgPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (f && f.type.startsWith('image/') && ctxImgIdx.value != null) onElementImage(ctxImgIdx.value, f)
  ctxImgIdx.value = null
}

function canvasItems(sx: number, sy: number): CtxEntry[] {
  return [
    { label: 'Paste', hint: 'Ctrl+V', disabled: !elementClipboard.els.length, action: () => pasteElements() },
    { divider: true },
    { label: 'Add Text Box', action: () => appendElements([newElementRect('text', sx, sy, 320, 80)]) },
    { label: 'Add Shape', action: () => appendElements([newElementRect('rect', sx, sy, 240, 160)]) },
  ]
}
function elementItems(index: number): CtxEntry[] {
  const el = deck.value?.slides[current.value]?.elements?.[index]
  const items: CtxEntry[] = [
    { label: 'Cut', hint: 'Ctrl+X', action: cutSelectedElements },
    { label: 'Copy', hint: 'Ctrl+C', action: copySelectedElements },
    { label: 'Paste In Place', disabled: !elementClipboard.els.length, action: () => pasteElements(true) },
    { label: 'Duplicate', hint: 'Ctrl+D', action: duplicateSelectedElements },
    { label: 'Delete', hint: 'Del', action: deleteSelectedElement },
    { divider: true },
    { label: 'Bring Forward', hint: 'Ctrl+]', action: () => reorderSelectedElements(1) },
    { label: 'Bring to Front', action: () => reorderSelectedTo('front') },
    { label: 'Send Backward', hint: 'Ctrl+[', action: () => reorderSelectedElements(-1) },
    { label: 'Send to Back', action: () => reorderSelectedTo('back') },
  ]
  if (el?.type === 'box' && (el as BoxElement).src) {
    const b = el as BoxElement
    items.push(
      { divider: true },
      { label: 'Fit: Cover', check: (b.fit ?? 'cover') === 'cover', action: () => patchElementAt(index, { fit: 'cover' }) },
      { label: 'Fit: Contain', check: b.fit === 'contain', action: () => patchElementAt(index, { fit: 'contain' }) },
      { label: 'Replace Image…', action: () => replaceImageAt(index) },
      { label: 'Remove Image', action: () => patchElementAt(index, { src: undefined, fit: undefined, focus: undefined }) },
    )
  }
  return items
}
function multiItems(): CtxEntry[] {
  return [
    { label: 'Cut', hint: 'Ctrl+X', action: cutSelectedElements },
    { label: 'Copy', hint: 'Ctrl+C', action: copySelectedElements },
    { label: 'Duplicate', hint: 'Ctrl+D', action: duplicateSelectedElements },
    { label: 'Delete', hint: 'Del', action: deleteSelectedElement },
    { divider: true },
    { label: 'Bring Forward', hint: 'Ctrl+]', action: () => reorderSelectedElements(1) },
    { label: 'Send Backward', hint: 'Ctrl+[', action: () => reorderSelectedElements(-1) },
  ]
}
function thumbItems(index: number): CtxEntry[] {
  const last = (deck.value?.slides.length ?? 1) - 1
  return [
    { label: 'Duplicate Slide', action: () => { focusSlide(index); duplicateSlide() } },
    { label: 'Insert Slide Before', action: () => insertSlideAt(index) },
    { label: 'Insert Slide After', action: () => insertSlideAt(index + 1) },
    { divider: true },
    { label: 'Delete Slide', disabled: last < 1, action: () => { focusSlide(index); removeSlide() } },
    { divider: true },
    { label: 'Move to Top', disabled: index === 0, action: () => moveSlideTo(index, 0) },
    { label: 'Move to Bottom', disabled: index === last, action: () => moveSlideTo(index, last) },
  ]
}
function onCanvasContextMenu(p: { x: number; y: number; sx: number; sy: number; index: number; kind?: 'text' | 'link'; url?: string }) {
  if (!editMode.value) return
  if (p.kind === 'link') {
    ctxMenu.value = { x: p.x, y: p.y, items: linkItems(p.url ?? '') }
    return
  }
  if (p.kind === 'text') {
    ctxMenu.value = { x: p.x, y: p.y, items: textItems() }
    return
  }
  if (p.index < 0) {
    ctxMenu.value = { x: p.x, y: p.y, items: canvasItems(p.sx, p.sy) }
    return
  }
  // Right-clicking an element outside the current selection selects just it.
  if (!selectedEls.value.includes(p.index)) selectedEls.value = [p.index]
  const items = selectedEls.value.length > 1 ? multiItems() : elementItems(p.index)
  ctxMenu.value = { x: p.x, y: p.y, items }
}

// ── text / link menu actions (operate on the box being text-edited) ──
// The menu keeps the contenteditable's focus + selection (its items use
// mousedown.prevent), so these run against the live DOM selection. The box
// re-serialises to Markdown — links included — when editing commits on blur.
function currentLinkEl(): HTMLAnchorElement | null {
  const n = window.getSelection()?.anchorNode
  const host = n?.nodeType === 1 ? (n as HTMLElement) : n?.parentElement
  return host?.closest('a') ?? null
}
function addLinkToSelection() {
  const sel = window.getSelection()
  const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
  const url = window.prompt('Link URL:', 'https://')
  if (!url) return
  if (sel && range) {
    sel.removeAllRanges() // prompt() can drop the selection; put it back first
    sel.addRange(range)
  }
  document.execCommand('createLink', false, url)
}
function textItems(): CtxEntry[] {
  return [
    { label: 'Bold', hint: 'Ctrl+B', action: () => onFormat('bold') },
    { label: 'Italic', hint: 'Ctrl+I', action: () => onFormat('italic') },
    { label: 'Underline', action: () => onFormat('underline') },
    { label: 'Strikethrough', action: () => onFormat('strike') },
    { divider: true },
    { label: 'Add Link…', action: addLinkToSelection },
  ]
}
function linkItems(url: string): CtxEntry[] {
  return [
    { label: 'Open Link', disabled: !url || url === '#', action: () => window.open(url, '_blank', 'noopener') },
    {
      label: 'Edit Link…',
      action: () => {
        const a = currentLinkEl()
        const next = window.prompt('Link URL:', url || 'https://')
        if (next != null && a) a.setAttribute('href', next)
      },
    },
    {
      label: 'Remove Link',
      action: () => {
        const a = currentLinkEl()
        const parent = a?.parentNode
        if (!a || !parent) return
        while (a.firstChild) parent.insertBefore(a.firstChild, a)
        parent.removeChild(a)
      },
    },
  ]
}
function onSlideContextMenu(p: { x: number; y: number; index: number }) {
  if (!editMode.value) return
  ctxMenu.value = { x: p.x, y: p.y, items: thumbItems(p.index) }
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
/** Toggle `- ` bullets across all lines of the primary selected box's content. */
function toggleBoxBullets() {
  const b = selectedElement.value
  if (primaryEl.value == null || b?.type !== 'box') return
  const rows = parseContent((b as BoxElement).content)
  if (!rows.length) return
  const allBullets = rows.every((r) => r.bullet)
  // Content is per-box: patch only the primary, not the whole selection.
  patchElementAt(primaryEl.value, { content: rowsToContent(rows.map((r) => ({ ...r, bullet: !allBullets }))) })
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
/** Make `index` the sole current/selected slide (used before single-slide ops). */
function focusSlide(index: number) {
  current.value = index
  selected.value = [index]
  anchor = index
}
/** Insert a fresh blank slide at `index` and focus it. */
function insertSlideAt(index: number) {
  if (!deck.value) return
  snap('add')
  deck.value.slides.splice(index, 0, blankSlide('text'))
  focusSlide(index)
  void saveWholeDeck()
}
/** Move a single slide from `from` to `to`, keeping the rest in order. */
function moveSlideTo(from: number, to: number) {
  if (!deck.value || from === to) return
  snap('reorder')
  const [s] = deck.value.slides.splice(from, 1)
  deck.value.slides.splice(to, 0, s)
  focusSlide(to)
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
/** Group every section slide together with the slides that follow it (up to the
 *  next section), naming each group after that section's title. Slides before the
 *  first section are left untouched. Order is preserved, so the contiguous runs
 *  form groups naturally. */
function autoGroup() {
  if (!deck.value) return
  snap('autogroup')
  let name: string | null = null
  for (const s of deck.value.slides) {
    if (s.layout === 'section') name = ((s.title ?? '') as string).trim() || 'Section'
    // Slides under a section take its name; slides before the first section are
    // ungrouped — clear any stale group so removing/moving a leading section
    // also removes the group it used to define.
    if (name) s.group = name
    else delete s.group
  }
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
      @insert-image="onInsertImage"
      @z-order="reorderSelectedElements"
      @undo="undo"
      @redo="redo"
      @toggle-autosave="autosave = !autosave"
      @save="saveCurrentSlide"
      @close="editMode = false"
      @export="exportOpen = true"
      @review="toggleReview"
      @open-file="onOpenFile"
      @open-folder="onOpenFolder"
      @save-as="onSaveAs"
      @new-deck="onNewDeck"
      @open-deck="onOpenDeck"
      @import="onImportFile"
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
        @add="addSlide"
        @duplicate="duplicateSlide"
        @remove="removeSlide"
        @group="groupSelected"
        @autogroup="autoGroup"
        @contextmenu-slide="onSlideContextMenu"
      />

      <div v-if="deck" class="stage-wrap">
        <DeckView
          v-model="current"
          :deck="deck"
          :editable="editMode"
          :bullet-format-command="bulletFormatCommand"
          :nav-enabled="!overviewOpen && !presenterOpen && !exportOpen"
          :tool="activeTool"
          :selected-el="selectedEls"
          :pending-image="pendingImage"
          @patch="patchSlide"
          @config-patch="patchConfig"
          @upload="onUpload"
          @update:elements="onUpdateElements"
          @update:selected-el="selectedEls = $event"
          @create-element="onCreateElement"
          @tool-reset="((activeTool = 'select'), (pendingImage = ''))"
          @element-image="onElementImage"
          @drop-image="onDropImage"
          @ctxmenu="onCanvasContextMenu"
        />
      </div>
      <div v-else-if="error" class="msg err">{{ error }}</div>
      <div v-else class="msg">loading…</div>

      <SourcePane
        v-if="deck && editMode && showSource"
        :deck="deck"
        :index="current"
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
      @delete-asset="onDeleteAsset"
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
        @import="onImportFile"
        @export="exportOpen = true"
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

    <!-- right-click menu (contents depend on what was clicked) -->
    <ContextMenu v-if="ctxMenu" :x="ctxMenu.x" :y="ctxMenu.y" :items="ctxMenu.items" @close="closeCtx" />
    <input ref="ctxImgInput" type="file" accept="image/*" style="display: none" @change="onCtxImgPick" />

    <!-- Surface errors even when a deck is loaded (open/save failures used to be
         silent because the error message only rendered on the no-deck screen). -->
    <div v-if="deck && error" class="toast err" @click="error = ''">
      <span>{{ error }}</span>
      <button class="toast-x" title="Dismiss">✕</button>
    </div>

    <!-- import review: correct detected layouts before the deck is saved -->
    <ImportReview
      v-if="pendingImport"
      :deck="pendingImport.deck"
      :name="pendingImport.name"
      @commit="commitImport"
      @cancel="cancelImport"
    />

    <!-- import progress (blocks while a large deck is parsed/rehomed) -->
    <div v-if="importing" class="import-overlay">
      <div class="import-card">
        <div class="import-spinner" />
        <div>{{ importing }}</div>
        <div class="import-sub">Large decks can take a moment.</div>
      </div>
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
.stage-wrap {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
  /* allow the stage to shrink below the 1280px frame so a docked side pane
     (the Markdown source) fits instead of pushing the stage off-screen */
  min-width: 0;
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
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2000;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 80vw;
  padding: 10px 14px;
  border-radius: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
}
.toast.err {
  background: rgba(60, 18, 18, 0.97);
  border: 1px solid rgba(248, 113, 113, 0.5);
  color: #fecaca;
}
.toast-x {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.7;
}
.import-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 6, 8, 0.8);
  backdrop-filter: blur(4px);
}
.import-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 36px;
  border-radius: 14px;
  background: rgba(18, 20, 24, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}
.import-sub {
  font-size: 11px;
  color: rgba(230, 236, 242, 0.45);
}
.import-spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid rgba(127, 199, 255, 0.25);
  border-top-color: #7fc7ff;
  animation: dek-spin 0.8s linear infinite;
}
@keyframes dek-spin {
  to {
    transform: rotate(360deg);
  }
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
