<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Deck, DeckConfig, LayoutId, Slide, SlideElement } from './core/types'
import { effectiveFit, galleryItemsOf, replaceGalleryImage, setGalleryFit, setGalleryLink } from './core/gallery'
import { naturalSize } from './render/naturalSize'
import { blankSlide } from './core/deck'
import { convertLayout } from './core/convert'
import { newElementRect } from './core/bake'
import { analyzeDeck } from './core/analyze'
import { splitSlide, type SlideSplitTarget } from './core/split'
import { fileToOptimizedDataUrl } from './core/image'
import { DEFAULT_THEME, themePreset, type ThemeId } from './tokens'
import { DROP_FAILED_EVENT } from './render/dropImage'
import { moveSlides } from './core/grouping'
import { pictureLinkPatch, slidePictures, type PictureRef } from './core/pictureLinks'
import { readQrLink } from './render/qrRead'
import { safeLink } from './render/qr'
import { startRecording, saveVideo, type Recording } from './render/recorder'
import { cleanDeckName } from './storage/assets'
import { browserVoices, voiceSettings } from './render/voice'
import { useVoiceGeneration } from './composables/useVoiceGeneration'
import { slidesFromText, slidesToText } from './core/slideClipboard'
import { inlineSlidePictures, storeSlidePictures } from './storage/slideTransfer'
import {
  fetchDeck,
  saveSlide,
  saveDeck,
  uploadImage,
  openDeck,
  newDeck,
  listDeckAssets,
  deleteDeckAsset,
  externalChangePending,
  adoptDiskBaseline,
  DeckConflictError,
  restoreLocalDeck,
  pendingLocalGrant,
  reconnectLocalDeck,
  openWorkspaceFile,
  saveWorkspaceFile,
  importSlidesFromWorkspaceDeck,
  supportsDir,
  getCurrentFile,
} from './api'
import { deckKey, readSlidePos, writeSlidePos } from './storage/position'
import { dropRecent, pushRecent, readRecent, writeRecent, type RecentDeck } from './storage/recent'
import { useUndo } from './composables/useUndo'
import { useAudienceSync } from './composables/useAudienceSync'
import { stepMove } from './core/steps'
import { useImport } from './composables/useImport'
import { useCanvasSelection } from './composables/useCanvasSelection'
import DeckView from './components/Deck.vue'
import TopBar from './components/TopBar.vue'
import SlideNavigator from './components/SlideNavigator.vue'
import Overview from './components/Overview.vue'
import Presenter from './components/Presenter.vue'
import ExportView from './components/ExportView.vue'
import ImportReview from './components/ImportReview.vue'
import EditableText from './components/EditableText.vue'
import DeckMenu from './components/DeckMenu.vue'
import DeckBrowser from './components/DeckBrowser.vue'
import ReviewPanel from './components/ReviewPanel.vue'
import SourcePane from './components/SourcePane.vue'
import ContextMenu, { isDivider, type CtxEntry, type IdleText } from './components/ContextMenu.vue'
import type { ElementPatch, BoxElement, TableData } from './core/types'
import { setTableCell, tableShape, type GridCell } from './core/table'
import {
  canMerge,
  cellsHaveContent,
  cellsHaveStyle,
  clearCells,
  insertColumn,
  insertRow,
  isMerged,
  lineHasContent,
  mergeCells,
  mergeWouldDropContent,
  removeColumn,
  removeRow,
  toggleCellStyle,
  unmergeCell,
} from './core/tableEdit'
import { parseContent, rowsToContent } from './render/inline'

const deck = ref<Deck | null>(null)
const current = ref(0)
const error = ref<string | null>(null)

// Without the File System Access API, decks can only live in this browser's
// local storage — no real files on disk, no folder of decks, no Open/Save As.
// Safari and Firefox never support it; a Chromium browser (Chrome/Edge/Brave/
// Opera) usually does out of the box, so if it's missing there it's most often
// a disabled flag or an old version rather than a permanent limitation — hence
// the two different fixes below. Dismissal is remembered so this doesn't nag
// on every load once the user has seen and understood it.
const FS_WARNING_DISMISSED = 'dek:fs-warning-dismissed'
const isChromiumBased = /Chrome|Chromium|Edg\/|OPR\//.test(navigator.userAgent)
const fsWarningDismissed = ref(localStorage.getItem(FS_WARNING_DISMISSED) === '1')
const showFsWarning = computed(() => !supportsDir() && !fsWarningDismissed.value)
function dismissFsWarning() {
  fsWarningDismissed.value = true
  localStorage.setItem(FS_WARNING_DISMISSED, '1')
}

const editMode = ref(true) // start in the editor; "Present" switches to present mode
const showSource = ref(false) // raw Markdown source pane (right dock)
const autosave = ref(true)
const saveStatus = ref<'saved' | 'unsaved' | 'saving'>('saved')
const bulletFormatCommand = ref(0)

// ── canvas (free elements): selection & active tool (see useCanvasSelection) ──
const { activeTool, selectedEls, pendingImage, primaryEl, selectedElement } =
  useCanvasSelection(deck, current)

// Track whether the slide navigator was the last thing clicked. Delete then
// removes the selected slide(s) when focus is on the slide list — but on the
// stage/canvas, Delete keeps removing the selected canvas element instead.
const navFocused = ref(false)
function trackClick(e: PointerEvent) {
  navFocused.value = !!(e.target as HTMLElement | null)?.closest?.('.nav')
}

// present-mode views
const overviewOpen = ref(false)
const presenterOpen = ref(false) // this tab shows the presenter view; slides are in the audience window
// Build rows showing on the current slide, shared with the audience window.
const revealed = ref(0)
const exportOpen = ref(false)
const reviewOpen = ref(false)

// Presenter view in this tab, slides in a separate audience window — see useAudienceSync.
const { openPresenter: openPresenterWindow, sendKey: sendAudienceKey } = useAudienceSync({ deck, current, revealed, presenterOpen, error })
/** The presenter popup can knock the audience window out of fullscreen
 *  (Chrome leaves fullscreen when a window opens); that must not end the
 *  presentation the popup is there to run. */
/** → / ← in the presenter view: the next build row or slide, as on the audience screen. */
function onPresenterStep(dir: 1 | -1) {
  if (!deck.value) return
  const pos = stepMove(deck.value.slides, { index: current.value, revealed: revealed.value }, dir)
  current.value = pos.index
  revealed.value = pos.revealed
}
function openPresenter() {
  if (document.fullscreenElement) {
    keepPresenting = true
    setTimeout(() => (keepPresenting = false), 1500)
  }
  openPresenterWindow()
}

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
// naturalSize loads any picture it doesn't know yet and is reactive, so the
// gallery size/crop checks fill in on their own as pictures arrive.
const analysis = computed(() => (deck.value ? analyzeDeck(deck.value, diskAssets.value, { naturalSize }) : null))
const reviewCount = computed(() => {
  const c = analysis.value?.counts
  return c ? c.error + c.warning + c.info : 0
})
// Worst issue severity per slide (0-based), for the navigator's badge. Skips the
// info tier — only errors/warnings are worth flagging on a thumbnail; the full
// list (including info) lives in the Review panel.
const slideSeverity = computed(() => {
  const rank: Record<string, number> = { error: 2, warning: 1, info: 0 }
  const out = new Map<number, 'error' | 'warning'>()
  for (const i of analysis.value?.issues ?? []) {
    if (i.slide < 1 || i.severity === 'info') continue
    const idx = i.slide - 1
    const prev = out.get(idx)
    if (!prev || rank[i.severity] > rank[prev]) out.set(idx, i.severity)
  }
  return out
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
  else {
    keepPresenting = true // F leaves fullscreen but stays in the presentation
    document.exitFullscreen?.()
  }
}

// Presenting fills the screen. The browser grants fullscreen only during a
// user action, and it doesn't count Esc as one — so from Esc (or anywhere
// the request is refused) it waits for the next key or click while
// presenting, typically the first arrow press. Leaving fullscreen by any route
// other than F — Esc, which the browser keeps for itself — also leaves the
// presentation, so one Esc gets back to the editor.
let keepPresenting = false
let fullscreenPending = false
function requestPresentFullscreen() {
  if (document.fullscreenElement) return
  const req = document.documentElement.requestFullscreen?.()
  if (!req) return
  fullscreenPending = false
  req.catch(() => (fullscreenPending = true))
}
function startPresenting(e?: KeyboardEvent) {
  editMode.value = false
  if (e?.key === 'Escape') fullscreenPending = !document.fullscreenElement
  else requestPresentFullscreen()
}
/** Capture-phase: the next real key or click while presenting goes fullscreen. */
function onPendingFullscreen(e: Event) {
  if (!fullscreenPending || editMode.value) return
  if (e instanceof KeyboardEvent && (e.key === 'Escape' || e.key.toLowerCase() === 'f')) return
  requestPresentFullscreen()
}
function onFullscreenChange() {
  if (!document.fullscreenElement && !editMode.value && !keepPresenting) enterEdit()
  keepPresenting = false
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
    // Reopen the folder/file the user last had open, so a reload costs no
    // dialogs. If Chrome downgraded the grant, `onReconnectFolder` offers a
    // one-click re-grant instead of a picker.
    deck.value = (await restoreLocalDeck()) ?? (await fetchDeck())
    // Land back on the slide this deck was left on, rather than slide 1.
    // Only on the initial restore: opening a *different* deck later goes
    // through applyDeck(), which deliberately starts at the top.
    restoreSlidePos()
    reconnectName.value = await pendingLocalGrant()
    void refreshDiskAssets()
  } catch (e) {
    error.value = (e as Error).message
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('paste', onPasteEvent)
  window.addEventListener('keydown', onPendingFullscreen, true)
  window.addEventListener('pointerdown', onPendingFullscreen, true)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  window.addEventListener(DROP_FAILED_EVENT, onDropFailed)
  window.addEventListener('mousemove', resetIdle)
  window.addEventListener('pointerdown', trackClick, true)
  externalTimer = setInterval(() => void pollExternalChange(), 1500)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('paste', onPasteEvent)
  window.removeEventListener('keydown', onPendingFullscreen, true)
  window.removeEventListener('pointerdown', onPendingFullscreen, true)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  window.removeEventListener(DROP_FAILED_EVENT, onDropFailed)
  window.removeEventListener('mousemove', resetIdle)
  window.removeEventListener('pointerdown', trackClick, true)
  if (idleTimer) clearTimeout(idleTimer)
  if (externalTimer) clearInterval(externalTimer)
})
let externalTimer: ReturnType<typeof setInterval> | null = null

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

// ── remembered slide position (per deck, this browser only) ──
/** Identity of the open deck. The backend's file name alone collides — every
 *  `.dek` bundle's inner file is `deck.md` — so it's paired with the display
 *  name, which for a bundle is its folder. */
function currentDeckKey(): string {
  return deckKey(getCurrentFile(), deck.value?.config.deck)
}
function restoreSlidePos() {
  const count = deck.value?.slides.length ?? 0
  if (!count) return
  const at = readSlidePos(currentDeckKey(), count)
  current.value = at
  selected.value = [at]
  anchor = at
}
// Persist on every move. Cheap (one small string) and it means a crash or an
// F5 mid-edit both land back in the same place.
watch(current, (n) => {
  if (deck.value) writeSlidePos(currentDeckKey(), n)
})
function isAbort(e: unknown) {
  return (e as { name?: string })?.name === 'AbortError'
}
// ── Dek's own Open / Save / Import panel (over the granted workspace folder) ──
const deckBrowser = ref<'open' | 'save' | 'import' | null>(null)
// Set by openSlideImport(): which slide to insert the imported ones after.
const importAt = ref<number | null>(null)
async function onBrowserOpen(e: { file: string; path: string[] }) {
  error.value = ''
  try {
    const opened = await openWorkspaceFile(e.file, e.path)
    applyDeck(opened)
    rememberRecent({ file: e.file, path: e.path, name: opened.config.deck ?? e.file })
    reconnectName.value = null
    deckBrowser.value = null
  } catch (err) {
    if (!isAbort(err)) error.value = `Open failed: ${(err as Error).message}`
  }
}

// ── recent decks (the deck menu's Recent list) ──
const recentDecks = ref<RecentDeck[]>(readRecent())
function rememberRecent(r: RecentDeck) {
  recentDecks.value = pushRecent(recentDecks.value, r)
  writeRecent(recentDecks.value)
}
/**
 * Before swapping the open deck for another. Opening used to replace the deck
 * outright, so with autosave off any unsaved edits were silently lost — and a
 * one-click Recent list makes that much easier to do by accident. With
 * autosave on, pending edits are simply saved first; with it off, you're asked.
 */
async function readyToLeaveDeck(): Promise<boolean> {
  // Read through a function: the status changes across the await.
  const saved = () => saveStatus.value === 'saved'
  if (saved()) return true
  if (autosave.value) {
    await saveWholeDeck()
    if (saved()) return true
  }
  return window.confirm('This deck has unsaved changes. Open another deck and discard them?')
}
async function onOpenRecent(r: RecentDeck) {
  if (!(await readyToLeaveDeck())) return
  error.value = ''
  try {
    const opened = await openWorkspaceFile(r.file, r.path)
    applyDeck(opened)
    rememberRecent({ ...r, name: opened.config.deck ?? r.name })
    reconnectName.value = null
  } catch (err) {
    if (isAbort(err)) return
    // Moved, renamed or deleted since: drop it, so the list only offers decks
    // that exist. Any other failure (a lapsed folder grant, say) leaves the
    // entry alone — the deck is still there, it just can't be read right now.
    if ((err as { name?: string })?.name === 'NotFoundError') {
      recentDecks.value = dropRecent(recentDecks.value, r)
      writeRecent(recentDecks.value)
      error.value = `"${r.name}" is no longer in your decks folder — removed from Recent.`
    } else {
      error.value = `Open failed: ${(err as Error).message}`
    }
  }
}
async function onBrowserSave(e: { name: string; path: string[] }) {
  if (!deck.value) return
  error.value = ''
  try {
    const saved = await saveWorkspaceFile(e.name, deck.value.config, deck.value.slides, e.path)
    applyDeck(saved.deck)
    rememberRecent({ file: saved.file, path: e.path, name: saved.deck.config.deck ?? saved.file })
    saveStatus.value = 'saved'
    reconnectName.value = null
    deckBrowser.value = null
  } catch (err) {
    if (!isAbort(err)) error.value = (err as Error).message
  }
}
async function onBrowserImport(pick: { file: string; path: string[] }) {
  if (!deck.value) return
  error.value = ''
  try {
    const slides = await importSlidesFromWorkspaceDeck(pick.file, pick.path)
    if (slides.length) {
      snap('add')
      const at = (importAt.value ?? current.value) + 1
      deck.value.slides.splice(at, 0, ...slides)
      focusSlide(at)
      selected.value = slides.map((_, i) => at + i)
      void saveWholeDeck()
    }
    deckBrowser.value = null
    importAt.value = null
  } catch (e) {
    if (!isAbort(e)) error.value = `Import failed: ${(e as Error).message}`
  }
}
// The last-used folder/file, when its readwrite grant needs one click to restore.
const reconnectName = ref<string | null>(null)
async function onReconnectFolder() {
  error.value = ''
  try {
    const restored = await reconnectLocalDeck()
    if (restored) {
      applyDeck(restored)
      // Re-granting access to the deck you already had open is a resumption,
      // not opening a new deck — keep the slide you were on.
      restoreSlidePos()
    }
    reconnectName.value = await pendingLocalGrant()
  } catch (e) {
    if (!isAbort(e)) error.value = `Reconnect failed: ${(e as Error).message}`
  }
}
async function onOpenDeck(file: string) {
  try {
    applyDeck(await openDeck(file))
  } catch (e) {
    error.value = (e as Error).message
  }
}
function onSaveAs() {
  deckBrowser.value = 'save'
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

// ── presenter pen ──
// The four theme colours, as the pen's palette: they always sit well on the
// deck they were chosen for, and a theme swap recolours the palette with it.
const drawing = ref(false)
const inkPalette = computed(() => {
  const t = deck.value?.config.theme ?? {}
  const d = DEFAULT_THEME.color
  return [t.accent2 ?? d.accent2, t.accent ?? d.accent, t.text ?? d.text, t.bg ?? d.bg]
})
const inkChoice = ref(0)
const inkColor = computed(() => inkPalette.value[inkChoice.value] ?? inkPalette.value[0])
watch(editMode, (ed) => {
  if (ed) drawing.value = false
})

// ── speaker-notes strip (editor) ──
// Resizable by its top edge (height remembered per browser; double-click the
// edge for the default). The text takes the largest size, 11–28 px, at which
// the notes fit the strip; past the smallest size it scrolls.
const NOTES_DEFAULT = 92
const NOTES_MIN = 48
const NOTES_KEY = 'dek:notes-height'
const NOTES_FONT_MIN = 11
const NOTES_FONT_MAX = 28
function readNotesHeight(): number {
  try {
    const n = Number(localStorage.getItem(NOTES_KEY))
    return Number.isFinite(n) && n >= NOTES_MIN ? n : NOTES_DEFAULT
  } catch {
    return NOTES_DEFAULT
  }
}
const notesHeight = ref(readNotesHeight())
const notesFont = ref(13)
const notesScroll = ref<HTMLElement | null>(null)
function setNotesHeight(h: number) {
  const max = Math.max(NOTES_MIN, Math.round(window.innerHeight * 0.6))
  notesHeight.value = Math.round(Math.max(NOTES_MIN, Math.min(max, h)))
  try {
    localStorage.setItem(NOTES_KEY, String(notesHeight.value))
  } catch {
    /* private mode: the height just isn't remembered */
  }
}
// Keeps the Review panel clear of the strip whatever its height.
watch(notesHeight, (h) => document.documentElement.style.setProperty('--dek-notes-h', `${h}px`), { immediate: true })
function onNotesGripDown(e: PointerEvent) {
  e.preventDefault()
  const startY = e.clientY
  const startH = notesHeight.value
  const bar = (e.currentTarget as HTMLElement).parentElement
  bar?.classList.add('resizing')
  const move = (ev: PointerEvent) => setNotesHeight(startH + (startY - ev.clientY))
  const up = () => {
    bar?.classList.remove('resizing')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
/** Largest font size at which the notes fit the strip, by binary search on the
 *  live element (the same way slide text fits its box). */
function fitNotes() {
  const el = notesScroll.value
  if (!el || !el.clientHeight) return
  const fits = (px: number) => {
    el.style.fontSize = `${px}px`
    return el.scrollHeight <= el.clientHeight + 1
  }
  let lo = NOTES_FONT_MIN
  let hi = NOTES_FONT_MAX
  if (fits(hi)) lo = hi
  else if (!fits(lo)) hi = lo
  else {
    for (let i = 0; i < 8 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2
      if (fits(mid)) lo = mid
      else hi = mid
    }
  }
  const size = Math.floor(lo * 2) / 2
  el.style.fontSize = `${size}px`
  notesFont.value = size
}
let notesFrame = 0
const scheduleNotesFit = () => {
  cancelAnimationFrame(notesFrame)
  notesFrame = requestAnimationFrame(fitNotes)
}
let notesResize: ResizeObserver | null = null
let notesMutate: MutationObserver | null = null
watch(notesScroll, (el) => {
  notesResize?.disconnect()
  notesMutate?.disconnect()
  if (!el) return
  notesResize = new ResizeObserver(scheduleNotesFit)
  notesResize.observe(el)
  notesMutate = new MutationObserver(scheduleNotesFit)
  notesMutate.observe(el, { childList: true, characterData: true, subtree: true })
  scheduleNotesFit()
})
watch(current, scheduleNotesFit, { flush: 'post' })
onUnmounted(() => {
  notesResize?.disconnect()
  notesMutate?.disconnect()
})

// ── narrate mode + recording ──
// Narrate (Enter, or ▷) lets Dek present by itself, speaking the notes' `>`
// lines (Deck.vue runs it). Record (●) captures that as an MP4: pick the Dek
// tab and the video is just the slide; pick the entire screen with system
// audio to catch the browser's voice, which Windows plays outside the tab.
const narrating = ref(false)
const voicePanel = ref(false)
const recording = ref<Recording | null>(null)
const recorded = ref<{ blob: Blob; seconds: number } | null>(null)
watch(editMode, (ed) => {
  if (!ed) return
  narrating.value = false
  voicePanel.value = false
  void stopRecording()
})
async function toggleRecording() {
  if (recording.value) return void stopRecording()
  const frame = document.querySelector<HTMLElement>('.stage-wrap .dek-frame')
  if (!frame) return
  error.value = ''
  try {
    const rec = await startRecording(frame)
    recording.value = rec
    recorded.value = null
    rec.onEnded(() => void stopRecording())
    narrating.value = true // record = narrate from this slide on
  } catch (e) {
    // Cancelling the browser's picker is a choice, not an error.
    if ((e as Error).name !== 'NotAllowedError') error.value = (e as Error).message
  }
}
async function stopRecording() {
  const rec = recording.value
  if (!rec) return
  recording.value = null
  narrating.value = false
  const blob = await rec.stop()
  if (blob.size) recorded.value = { blob, seconds: Math.round((Date.now() - rec.started) / 1000) }
}
/** Narration ran off the last slide: the recording is complete. */
function onNarrationEnd() {
  void stopRecording()
}
async function onSaveRecording() {
  const r = recorded.value
  if (!r) return
  try {
    await saveVideo(r.blob, `${cleanDeckName(deck.value?.config.deck ?? 'deck')}.mp4`)
    recorded.value = null
  } catch (e) {
    if ((e as Error).name !== 'AbortError') error.value = (e as Error).message
  }
}
/** Local voice: coverage, and voicing the missing lines via the Dek Helper. */
const voiceGen = useVoiceGeneration(deck, () => !!recording.value)
watch(voicePanel, (open) => {
  if (open) void voiceGen.refresh()
})
const recordedLabel = computed(() => {
  const r = recorded.value
  if (!r) return ''
  const m = Math.floor(r.seconds / 60)
  const sec = String(r.seconds % 60).padStart(2, '0')
  return `${m}:${sec} · ${(r.blob.size / 1e6).toFixed(0)} MB`
})

/** A picture dropped from a site that blocks copying (render/dropImage.ts). */
function onDropFailed(e: Event) {
  error.value = (e as CustomEvent<string>).detail
}

function enterEdit() {
  editMode.value = true
  fullscreenPending = false
  if (document.fullscreenElement) {
    keepPresenting = true // already on the way out; don't re-enter onFullscreenChange's exit
    void document.exitFullscreen?.().catch(() => {})
  }
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
/** Ctrl+V on the slide list: slides from the system clipboard (another tab,
 *  another deck, a text editor) — unless it's the copy this tab just made of
 *  this deck, which pastes from memory instead of saving its pictures again. */
function onPasteEvent(e: ClipboardEvent) {
  if (!editMode.value || !navFocused.value || selectedEls.value.length) return
  if (isTyping(document.activeElement as HTMLElement | null)) return
  const text = e.clipboardData?.getData('text/plain') ?? ''
  const ours = !!text && text === slideClipboard.text && slideClipboard.deck === deck.value && slideClipboard.slides.length > 0
  const incoming = ours ? null : slidesFromText(text)
  if (incoming) {
    e.preventDefault()
    void pasteSlides(current.value, incoming)
  } else if (slideClipboard.slides.length) {
    e.preventDefault()
    void pasteSlides(current.value)
  }
}
/** The context menu's Paste has no paste event to read, so it asks for the
 *  clipboard (the browser may ask for permission the first time). */
async function pasteSlidesFromMenu(after: number) {
  let text = ''
  try {
    text = await navigator.clipboard.readText()
  } catch {
    /* denied or unavailable: fall back to this tab's copy */
  }
  const ours = !!text && text === slideClipboard.text && slideClipboard.deck === deck.value && slideClipboard.slides.length > 0
  const incoming = ours ? null : slidesFromText(text)
  if (incoming) await pasteSlides(after, incoming)
  else await pasteSlides(after)
}

function isTyping(el: HTMLElement | null): boolean {
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}
function onKey(e: KeyboardEvent) {
  // The deck browser is a modal: Escape closes it, everything else is ignored so
  // shortcuts don't act on the deck behind it.
  if (deckBrowser.value) {
    if (e.key === 'Escape') {
      deckBrowser.value = null
      importAt.value = null
    }
    return
  }
  const ae = document.activeElement as HTMLElement | null
  const typing = isTyping(ae)
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    editMode.value ? startPresenting() : enterEdit()
  } else if (mod && !e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault() // Ctrl/Cmd+S saves the deck, not the browser's "save page"
    void saveWholeDeck()
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
  } else if (editMode.value && mod && !typing && e.key.toLowerCase() === 'd' && selectedEls.value.length === 0) {
    e.preventDefault() // no element selected → Ctrl/Cmd+D duplicates the current slide
    duplicateSlide()
  } else if (
    editMode.value &&
    mod &&
    !typing &&
    e.key.toLowerCase() === 'a' &&
    (deck.value?.slides[current.value]?.elements?.length ?? 0) > 0
  ) {
    e.preventDefault() // Ctrl/Cmd+A selects every element on the current slide
    const els = deck.value!.slides[current.value].elements!
    selectedEls.value = els.map((_, i) => i)
    activeTool.value = 'select'
  } else if (editMode.value && mod && !typing && (e.key === ']' || e.key === '[') && selectedEls.value.length) {
    e.preventDefault()
    reorderSelectedElements(e.key === ']' ? 1 : -1)
  } else if (
    editMode.value && mod && !typing && navFocused.value && selectedEls.value.length === 0 && e.key.toLowerCase() === 'c'
  ) {
    e.preventDefault()
    copySlides()
  } else if (
    editMode.value && mod && !typing && navFocused.value && selectedEls.value.length === 0 && e.key.toLowerCase() === 'x'
  ) {
    e.preventDefault()
    cutSlides()
  } else if (
    editMode.value &&
    mod &&
    !typing &&
    navFocused.value &&
    selectedEls.value.length === 0 &&
    e.key.toLowerCase() === 'v'
  ) {
    // Nothing here: the browser's `paste` event follows (onPasteEvent), and
    // only it can read the system clipboard without a permission prompt.
  } else if (e.key === 'Escape' && editMode.value) {
    if (typing) ae!.blur()
    else if (selectedEls.value.length) {
      selectedEls.value = []
      activeTool.value = 'select'
    } else startPresenting(e)
  } else if (
    e.key === 'Escape' && !editMode.value && !overviewOpen.value && !presenterOpen.value && !exportOpen.value
  ) {
    // Present mode: Esc returns to editing. In fullscreen the browser keeps
    // Esc for itself; onFullscreenChange handles that case.
    if (!document.fullscreenElement) enterEdit()
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
  } catch (e) {
    if (e instanceof DeckConflictError) return void onSaveConflict(e.mtime, saveCurrentSlide)
    saveStatus.value = 'unsaved'
  }
}
async function saveWholeDeck() {
  if (!deck.value) return
  saveStatus.value = 'saving'
  try {
    await saveDeck(deck.value.config, deck.value.slides)
    saveStatus.value = 'saved'
  } catch (e) {
    if (e instanceof DeckConflictError) return void onSaveConflict(e.mtime, saveWholeDeck)
    saveStatus.value = 'unsaved'
  }
}

// ── external-edit reconciliation (dev server only) ──
// The deck file can be rewritten out from under an open browser — by an LLM
// handed the `.md`, or a text editor. Two paths keep the three editing surfaces
// from clobbering each other:
//   • an idle poll adopts a purely-external change (no local edits pending);
//   • a save rejected as a conflict (both sides changed) prompts the user.
let resolvingConflict = false
async function reloadDeckFromDisk() {
  const fresh = await fetchDeck()
  if (deck.value) snap('external-edit') // keep the pre-reload state undoable
  deck.value = fresh
  if (current.value > fresh.slides.length - 1) current.value = Math.max(0, fresh.slides.length - 1)
  selected.value = [current.value]
  saveStatus.value = 'saved'
  void refreshDiskAssets()
}
async function onSaveConflict(mtime: number, retry: () => Promise<void>) {
  if (resolvingConflict) return
  resolvingConflict = true
  saveStatus.value = 'unsaved'
  try {
    const keepMine = window.confirm(
      'This deck was changed on disk since you loaded it (an external edit).\n\n' +
        'OK — keep your version and overwrite the file.\n' +
        'Cancel — discard your unsaved change and load the version on disk.',
    )
    if (keepMine) {
      await adoptDiskBaseline(mtime)
      await retry()
    } else {
      await reloadDeckFromDisk()
    }
  } finally {
    resolvingConflict = false
  }
}
async function pollExternalChange() {
  // Only adopt automatically when there's nothing local to lose: no pending
  // save, not mid-conflict, not typing in a field, and the tab is visible.
  if (resolvingConflict || saveStatus.value !== 'saved') return
  if (document.hidden || isTyping(document.activeElement as HTMLElement | null)) return
  try {
    if (await externalChangePending()) await reloadDeckFromDisk()
  } catch {
    /* transient poll failure — try again next tick */
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
function setTheme(id: ThemeId) {
  patchConfig({ theme: themePreset(id) })
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
  deck.value.slides[current.value] = convertLayout(s, id, { naturalSize })
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
    const fresh = convertLayout(s, 'freeform', { naturalSize })
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
  const dataUrl = await fileToOptimizedDataUrl(file)
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
  void offerQrLink(current.value, { kind: 'box', el: index })
}
// ── image clipboard / download (shared by freeform boxes and layout images) ──
/** Copy a resolved image URL to the system clipboard as real image bytes. */
async function copyImageSrc(src: string) {
  try {
    const blob = await (await fetch(src)).blob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
  } catch {
    window.alert('Could not copy the image — your browser may not support copying images.')
  }
}
/** Save a resolved image URL to disk via the browser's normal download flow. */
async function downloadImageSrc(src: string) {
  try {
    const blob = await (await fetch(src)).blob()
    const ext = (blob.type.split('/')[1] || 'png').replace('+xml', '')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `image.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    window.alert('Could not download the image.')
  }
}
/** Read one image off the system clipboard as a File, or null with an alert. */
async function readClipboardImage(): Promise<File | null> {
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'))
      if (!type) continue
      const blob = await item.getType(type)
      const ext = (type.split('/')[1] || 'png').replace('+xml', '')
      return new File([blob], `pasted.${ext}`, { type })
    }
    window.alert('No image found on the clipboard.')
  } catch {
    window.alert('Could not read the clipboard — allow clipboard access and try again.')
  }
  return null
}
/** Read an http(s)/mailto URL off the clipboard, or null with an alert. */
async function readClipboardLink(): Promise<string | null> {
  try {
    const text = (await navigator.clipboard.readText()).trim()
    if (/^(https?:|mailto:)/i.test(text)) return text
    window.alert("The clipboard doesn't contain a link.")
  } catch {
    window.alert('Could not read the clipboard — allow clipboard access and try again.')
  }
  return null
}

// ── freeform box image actions ──
function copyImageAt(index: number) {
  const el = deck.value?.slides[current.value]?.elements?.[index]
  if (el?.type === 'box' && el.src) void copyImageSrc(el.src)
}
async function pasteImageAt(index: number) {
  const file = await readClipboardImage()
  if (file) await onElementImage(index, file)
}
async function addLinkFromClipboardAt(index: number) {
  const link = await readClipboardLink()
  if (link) patchElementAt(index, { link })
}
function downloadImageAt(index: number) {
  const el = deck.value?.slides[current.value]?.elements?.[index]
  if (el?.type === 'box' && el.src) void downloadImageSrc(el.src)
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
    void offerQrLink(current.value, { kind: 'box', el: target.index })
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
  const added = (deck.value.slides[current.value].elements?.length ?? 0) - 1
  void offerQrLink(current.value, { kind: 'box', el: added })
}

/**
 * A hyperlink was dropped on the canvas.
 *
 * Onto a box that already carries a picture, the link only makes that picture
 * clickable — a stray drop must never destroy an image. Onto anything else
 * (an empty box, or bare canvas) the URL becomes a QR code, which is what you
 * want when the audience is supposed to reach the link from their seats.
 *
 * Only the URL is stored, never a generated image: `deck.md` stays readable and
 * changing the link redraws the code.
 */
const QR_SIZE = 240
function onDropLink(
  url: string,
  target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number },
) {
  if (!deck.value) return
  if (target.kind === 'box') {
    const s = deck.value.slides[current.value]
    const el = s.elements?.[target.index]
    if (!el || el.type !== 'box') return
    const patch: Partial<BoxElement> = el.src ? { link: url } : { qr: url, link: url }
    const els = s.elements!.map((e, i) => (i === target.index ? ({ ...e, ...patch } as SlideElement) : e))
    patchSlide({ elements: els })
    return
  }
  const x = Math.max(0, Math.min(1280 - QR_SIZE, target.x - QR_SIZE / 2))
  const y = Math.max(0, Math.min(720 - QR_SIZE, target.y - QR_SIZE / 2))
  onCreateElement({
    type: 'box',
    x: Math.round(x),
    y: Math.round(y),
    w: QR_SIZE,
    h: QR_SIZE,
    rotation: 0,
    qr: url,
    link: url,
    fill: 'transparent',
    stroke: 'transparent',
  })
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
function onInsert(what: 'video' | 'diagram' | 'table' | 'timer') {
  if (!deck.value) return
  if (what === 'timer') return insertTimer()
  if (what === 'video') addSlide('video-embed')
  else if (what === 'diagram') addSlide('diagram')
  else addSlide('table')
}
/** A timer goes on top of the current slide as a canvas element. Unlike a new
 *  box it doesn't turn a layout slide into freeform: the slide keeps its
 *  layout and the timer sits over it, bottom right, ready to move. */
function insertTimer() {
  if (!deck.value) return
  const s = deck.value.slides[current.value]
  const timer: SlideElement = { type: 'widget', widget: 'timer', duration: 300, x: 930, y: 520, w: 280, h: 140, rotation: 0 }
  const elements = [...(s.elements ?? []), timer]
  patchSlide({ elements })
  selectedEls.value = [elements.length - 1]
  activeTool.value = 'select'
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
// its own input down in CanvasElements; the menu can't reach that one). The
// target is either a freeform box element or one of the slide's image fields
// (the single `image`, or a `portraits` / `gallery` slot by index).
type ImageField = { field: 'image' | 'portraits' | 'gallery' | 'table'; index?: number; el?: number }

/** Open a link from a context menu in a new tab (never this one: it holds the deck). */
function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

// ── QR codes in pictures → links ──
// A picture holding a QR code (a poster, a screenshot of a slide) gets the
// code's link attached, so it's clickable while presenting. The picture itself
// stays. Three ways in: offered when a picture is added, "Link from QR Code"
// on its right-click menu, and the Review panel's deck-wide scan.
const sameRef = (a: PictureRef, b: PictureRef) => JSON.stringify(a) === JSON.stringify(b)
function fieldRef(t: ImageField): PictureRef | null {
  if (t.field === 'image') return { kind: 'image' }
  if (t.field === 'gallery') return { kind: 'gallery', index: t.index ?? -1 }
  if (t.field === 'table') return { kind: 'table', cell: t.index ?? -1, ...(t.el != null ? { el: t.el } : {}) }
  return null // portraits: nowhere to keep a link
}
function pictureAt(slideIndex: number, ref: PictureRef) {
  const s = deck.value?.slides[slideIndex]
  return s ? slidePictures(s).find((p) => sameRef(p.ref, ref)) : undefined
}
/** Attach `link` to one picture, on any slide. */
function setPictureLink(slideIndex: number, ref: PictureRef, link: string) {
  const s = deck.value?.slides[slideIndex]
  const patch = s && pictureLinkPatch(s, ref, link)
  if (!patch || !deck.value) return
  if (slideIndex === current.value) return patchSlide(patch)
  snap('qr-link')
  deck.value.slides[slideIndex] = { ...s, ...patch }
  void saveWholeDeck()
}
/** After a picture is added: if it holds a QR code with a link and has no link
 *  yet, offer to attach it, never silently. */
const qrOffer = ref<{ slide: number; ref: PictureRef; url: string } | null>(null)
async function offerQrLink(slideIndex: number, ref: PictureRef | null) {
  if (!ref) return
  const pic = pictureAt(slideIndex, ref)
  if (!pic || pic.link) return
  const url = await readQrLink(pic.src)
  // Still the same picture, still unlinked?
  const now = pictureAt(slideIndex, ref)
  if (url && now?.src === pic.src && !now.link) qrOffer.value = { slide: slideIndex, ref, url }
}
function acceptQrOffer() {
  const o = qrOffer.value
  qrOffer.value = null
  if (o && pictureAt(o.slide, o.ref)) setPictureLink(o.slide, o.ref, o.url)
}
/** Right-click, "Link from QR Code": read it now and attach it. */
async function linkFromQr(ref: PictureRef | null) {
  if (!ref) return
  const slideIndex = current.value
  const pic = pictureAt(slideIndex, ref)
  if (!pic) return
  const url = await readQrLink(pic.src)
  if (url) setPictureLink(slideIndex, ref, url)
  else error.value = 'No QR code with a web link found in this picture.'
}
/** Review, Assets, "Find QR codes in pictures": every unlinked picture. */
type QrHit = { slide: number; ref: PictureRef; url: string }
const qrScan = ref<{ scanning: boolean; progress: string; found: QrHit[] } | null>(null)
async function scanDeckForQr() {
  if (!deck.value || qrScan.value?.scanning) return
  const target = deck.value
  const todo = target.slides.flatMap((s, i) => slidePictures(s).filter((p) => !p.link).map((p) => ({ slide: i, ...p })))
  const bySrc = new Map<string, string | undefined>()
  const found: QrHit[] = []
  qrScan.value = { scanning: true, progress: `Scanning 0 / ${todo.length} pictures…`, found }
  for (const [k, p] of todo.entries()) {
    if (deck.value !== target) {
      qrScan.value = null
      return
    }
    if (!bySrc.has(p.src)) bySrc.set(p.src, await readQrLink(p.src))
    const url = bySrc.get(p.src)
    if (url) found.push({ slide: p.slide, ref: p.ref, url })
    qrScan.value = { scanning: true, progress: `Scanning ${k + 1} / ${todo.length} pictures…`, found }
  }
  qrScan.value = { scanning: false, progress: '', found }
}
function linkAllQr() {
  const scan = qrScan.value
  if (!deck.value || !scan?.found.length) return
  snap('qr-links')
  for (const f of scan.found) {
    const s = deck.value.slides[f.slide]
    const pic = s && slidePictures(s).find((p) => sameRef(p.ref, f.ref))
    const patch = pic && !pic.link ? pictureLinkPatch(s, f.ref, f.url) : null
    if (patch) deck.value.slides[f.slide] = { ...s, ...patch }
  }
  qrScan.value = null
  void saveWholeDeck()
}
watch(deck, () => (qrScan.value = null))

// ── table cells: one accessor pair for both hosts ──
// A table lives either on the slide (`slide.table`, the Table layout) or on a
// canvas element (`elements[el].table`). Every cell action below goes through
// these two, so a canvas table gets images, links and the cell menu exactly
// as the layout does — they used to be layout-only.
function tableAt(s: Slide, el: number | undefined): TableData | undefined {
  if (el == null) return s.table
  const e = s.elements?.[el]
  return e?.type === 'table' ? e.table : undefined
}
function setTableAt(el: number | undefined, table: TableData) {
  if (el == null) patchSlide({ table })
  else patchElementAt(el, { table })
}
function tableCellAt(s: Slide, t: ImageField) {
  return tableShape(tableAt(s, t.el)).cells[t.index ?? -1]
}
function patchTableCell(t: ImageField, patch: Partial<GridCell>) {
  const s = deck.value?.slides[current.value]
  if (!s) return
  setTableAt(t.el, setTableCell(tableAt(s, t.el), t.index ?? -1, patch))
}
const ctxImgInput = ref<HTMLInputElement | null>(null)
const ctxImgTarget = ref<{ kind: 'element'; index: number } | ({ kind: 'field' } & ImageField) | null>(null)
function replaceImageAt(index: number) {
  ctxImgTarget.value = { kind: 'element', index }
  ctxImgInput.value?.click()
}
function replaceFieldImage(t: ImageField) {
  ctxImgTarget.value = { kind: 'field', ...t }
  ctxImgInput.value?.click()
}
function onCtxImgPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  const target = ctxImgTarget.value
  ctxImgTarget.value = null
  if (!f || !f.type.startsWith('image/') || !target) return
  if (target.kind === 'element') onElementImage(target.index, f)
  else void onUpload({ field: target.field, file: f, index: target.index, el: target.el })
}

function canvasItems(sx: number, sy: number): CtxEntry[] {
  return [
    { label: 'Paste', hint: 'Ctrl+V', disabled: !elementClipboard.els.length, action: () => pasteElements() },
    { divider: true },
    { label: 'Add Text Box', action: () => appendElements([newElementRect('text', sx, sy, 320, 80)]) },
    { label: 'Add Shape', action: () => appendElements([newElementRect('rect', sx, sy, 240, 160)]) },
  ]
}
/**
 * Right-click on table cells (#48) — the layout's or a canvas table's, one menu
 * for both. `cells` is the selected block, or just the clicked cell. Actions
 * read the table fresh when clicked, and anything that discards content asks
 * first, like shrinking the table does.
 */
function tableCellMenu(el: number | undefined, index: number, cells: number[]): CtxEntry[] {
  const s = deck.value?.slides[current.value]
  if (!s) return []
  const cur = () => tableAt(deck.value!.slides[current.value], el)
  const set = (next: TableData) => setTableAt(el, next)
  const t = cur()
  const { rows, cols, cells: all } = tableShape(t)
  const cell = all[index]
  const single = cells.length === 1
  const r = Math.floor(index / cols)
  const c = index % cols
  const rs = cell?.rowspan ?? 1
  const cs = cell?.colspan ?? 1
  const items: CtxEntry[] = []
  // A picture cell leads with its picture menu: copy, paste, replace, link, remove.
  if (single && cell?.image) items.push(...layoutImageItems({ field: 'table', index, el }), { divider: true })
  items.push(
    { label: 'Bold', check: cellsHaveStyle(t, cells, 'bold'), action: () => set(toggleCellStyle(cur(), cells, 'bold')) },
    { label: 'Italic', check: cellsHaveStyle(t, cells, 'italic'), action: () => set(toggleCellStyle(cur(), cells, 'italic')) },
    { divider: true },
    {
      label: single ? 'Clear Cell' : `Clear ${cells.length} Cells`,
      disabled: !cellsHaveContent(t, cells),
      action: () => {
        if (!single && !window.confirm(`Clear the text and pictures from ${cells.length} cells?`)) return
        set(clearCells(cur(), cells))
      },
    },
  )
  if (!single) {
    items.push({
      label: 'Merge Cells',
      disabled: !canMerge(t, cells),
      action: () => {
        if (mergeWouldDropContent(cur(), cells) && !window.confirm("Merging keeps only the top-left cell's content. Merge anyway?")) return
        set(mergeCells(cur(), cells))
      },
    })
  }
  if (single && isMerged(cell)) items.push({ label: 'Unmerge Cells', action: () => set(unmergeCell(cur(), index)) })
  if (single && !cell?.image) items.push({ label: 'Add Image…', action: () => replaceFieldImage({ field: 'table', index, el }) })
  // Rows and columns, relative to the clicked cell (and past its merge).
  const removeLine = (axis: 'row' | 'col') => () => {
    const at = axis === 'row' ? r : c
    if (lineHasContent(cur(), axis, at) && !window.confirm(`This ${axis === 'row' ? 'row' : 'column'} has content. Delete it?`)) return
    set(axis === 'row' ? removeRow(cur(), at) : removeColumn(cur(), at))
  }
  items.push(
    { divider: true },
    { label: 'Insert Row Above', action: () => set(insertRow(cur(), r)) },
    { label: 'Insert Row Below', action: () => set(insertRow(cur(), r + rs)) },
    { label: 'Insert Column Left', action: () => set(insertColumn(cur(), c)) },
    { label: 'Insert Column Right', action: () => set(insertColumn(cur(), c + cs)) },
    { divider: true },
    { label: 'Delete Row', disabled: rows <= 1, action: removeLine('row') },
    { label: 'Delete Column', disabled: cols <= 1, action: removeLine('col') },
  )
  return items
}

/** The slide's empty background — a regular layout's (#44) or a freeform
 *  canvas's: add or paste elements at the click, then the same slide
 *  operations as the sidebar thumbnail, so there's one menu to learn. */
function stageItems(sx: number, sy: number): CtxEntry[] {
  return [...canvasItems(sx, sy), { divider: true }, ...thumbItems(current.value)]
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
  // A box's link (or the address its QR code shows): open it to check it.
  const boxLink = el?.type === 'box' ? safeLink((el as BoxElement).link ?? (el as BoxElement).qr) : undefined
  if (boxLink) {
    items.push(
      { divider: true },
      { label: 'Open Link', action: () => openLink(boxLink) },
      { label: 'Copy Link', action: () => void navigator.clipboard.writeText(boxLink).catch(() => {}) },
    )
  }
  if (el?.type === 'box' && (el as BoxElement).src) {
    const b = el as BoxElement
    items.push(
      { divider: true },
      { label: 'Copy Image', action: () => copyImageAt(index) },
      { label: 'Paste Image', action: () => pasteImageAt(index) },
      { label: 'Add Link (from Clipboard)', action: () => addLinkFromClipboardAt(index) },
      { label: 'Link from QR Code', action: () => void linkFromQr({ kind: 'box', el: index }) },
      { label: 'Download Image', action: () => downloadImageAt(index) },
      { divider: true },
      { label: 'Fit: Cover', check: (b.fit ?? 'cover') === 'cover', action: () => patchElementAt(index, { fit: 'cover' }) },
      { label: 'Fit: Contain', check: b.fit === 'contain', action: () => patchElementAt(index, { fit: 'contain' }) },
      { divider: true },
      { label: 'Invert', check: !!b.invert, action: () => patchElementAt(index, { invert: !b.invert }) },
      { label: 'Desaturate', check: !!b.desaturate, action: () => patchElementAt(index, { desaturate: !b.desaturate }) },
      { label: 'Replace Image…', action: () => replaceImageAt(index) },
      { label: 'Remove Image', action: () => patchElementAt(index, { src: undefined, fit: undefined, focus: undefined, invert: undefined, desaturate: undefined }) },
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
/** The resolved (hydrated) src for an image field / slot on the current slide. */
function fieldImageSrc(s: Slide, t: ImageField): string | undefined {
  if (t.field === 'image') return s.image
  if (t.field === 'portraits') return s.portraits?.[t.index ?? -1]
  if (t.field === 'table') return tableCellAt(s, t)?.image
  const it = s.items?.[t.index ?? -1]
  if (typeof it === 'string') return it
  if (it && typeof it === 'object' && 'image' in it) return (it as { image?: string }).image
  return undefined
}
/** Right-click menu for a layout image, mirroring the freeform-box image menu but
 *  operating on the slide's own image fields — the single `image` (with a Fit
 *  toggle) or a `portraits` / `gallery` slot. `link` doesn't apply — layout images
 *  have no per-image link — so it's omitted. */
function layoutImageItems(t: ImageField): CtxEntry[] {
  const s = deck.value?.slides[current.value]
  if (!s) return []
  const src = fieldImageSrc(s, t)
  // An empty table cell still gets a menu — just the one action to fill it —
  // unlike other image fields, which have no "field with no image yet" state.
  if (!src) return t.field === 'table' ? [{ label: 'Add Image…', action: () => replaceFieldImage(t) }] : []
  const items: CtxEntry[] = [
    { label: 'Copy Image', action: () => void copyImageSrc(src) },
    { label: 'Paste Image', action: () => pasteFieldImage(t) },
    { label: 'Download Image', action: () => void downloadImageSrc(src) },
  ]
  // Links apply to the single image, gallery cells, and table cells (all have
  // a link field); portraits are a plain string array with nowhere to store one.
  if (t.field === 'image' || t.field === 'gallery' || t.field === 'table') {
    items.push(
      { divider: true },
      { label: 'Add Link (from Clipboard)', action: () => addFieldLink(t) },
      { label: 'Link from QR Code', action: () => void linkFromQr(fieldRef(t)) },
    )
    const link = safeLink(fieldImageLink(s, t))
    if (link) items.push({ label: 'Open Link', action: () => openLink(link) })
    if (fieldImageLink(s, t)) items.push({ label: 'Remove Link', action: () => setFieldLink(t, undefined) })
  }
  // A gallery picture's fit overrides the gallery's own; choosing the value the
  // gallery already uses clears the override rather than restating it.
  if (t.field === 'gallery') {
    const item = galleryItemsOf(s.items)[t.index ?? -1]
    if (item) {
      const fit = effectiveFit(item, s.imageFit)
      const choose = (f: 'cover' | 'contain') =>
        patchSlide({ items: setGalleryFit(s.items, t.index ?? -1, f === (s.imageFit ?? 'cover') ? undefined : f) })
      items.push(
        { divider: true },
        { label: 'Fit: Cover', check: fit === 'cover', action: () => choose('cover') },
        { label: 'Fit: Contain', check: fit === 'contain', action: () => choose('contain') },
      )
    }
  }
  // Fit/Invert/Desaturate only make sense for the single framed image; portraits/gallery are grids.
  if (t.field === 'image') {
    const fit = s.imageFit ?? (s.layout === 'image-caption' ? 'contain' : 'cover')
    items.push(
      { divider: true },
      { label: 'Fit: Cover', check: fit === 'cover', action: () => patchSlide({ imageFit: 'cover' }) },
      { label: 'Fit: Contain', check: fit === 'contain', action: () => patchSlide({ imageFit: 'contain' }) },
      { divider: true },
      { label: 'Invert', check: !!s.imageInvert, action: () => patchSlide({ imageInvert: !s.imageInvert }) },
      { label: 'Desaturate', check: !!s.imageDesaturate, action: () => patchSlide({ imageDesaturate: !s.imageDesaturate }) },
    )
  }
  items.push(
    { divider: true },
    { label: 'Replace Image…', action: () => replaceFieldImage(t) },
    { label: 'Remove Image', action: () => removeFieldImage(t) },
  )
  return items
}
/** The link currently on an image field / gallery slot, if any. */
function fieldImageLink(s: Slide, t: ImageField): string | undefined {
  if (t.field === 'image') return s.imageLink
  if (t.field === 'gallery') {
    const it = s.items?.[t.index ?? -1]
    return it && typeof it === 'object' && 'link' in it ? (it as { link?: string }).link : undefined
  }
  if (t.field === 'table') return tableCellAt(s, t)?.link
  return undefined
}
async function addFieldLink(t: ImageField) {
  const link = await readClipboardLink()
  if (link) setFieldLink(t, link)
}
/** Set (or clear, when `link` is undefined) the link on the single image or a
 *  gallery cell. Gallery normalises the slot to an object so it can hold a link. */
function setFieldLink(t: ImageField, link: string | undefined) {
  const s = deck.value?.slides[current.value]
  if (!s) return
  if (t.field === 'image') {
    patchSlide({ imageLink: link })
  } else if (t.field === 'gallery') {
    patchSlide({ items: setGalleryLink(s.items, t.index ?? -1, link) })
  } else if (t.field === 'table') {
    patchTableCell(t, { link })
  }
}
async function pasteFieldImage(t: ImageField) {
  const file = await readClipboardImage()
  if (file) await onUpload({ field: t.field, file, index: t.index, el: t.el })
}
/** Clear an image field / slot. The single image resets its focus/fit too; a
 *  portrait or gallery slot is removed from its array (matching the in-frame ✕). */
function removeFieldImage(t: ImageField) {
  const s = deck.value?.slides[current.value]
  if (!s) return
  if (t.field === 'image') {
    patchSlide({ image: undefined, focus: undefined, imageFit: undefined, imageInvert: undefined, imageDesaturate: undefined })
  } else if (t.field === 'portraits') {
    const portraits = [...(s.portraits ?? [])]
    portraits.splice(t.index ?? -1, 1)
    patchSlide({ portraits })
  } else if (t.field === 'table') {
    // Cells are positional in a fixed grid — clear in place rather than
    // splicing, which would shift every later cell into the wrong slot.
    patchTableCell(t, { image: undefined, link: undefined })
  } else {
    const items = [...(s.items ?? [])]
    items.splice(t.index ?? -1, 1)
    patchSlide({ items })
  }
}
function thumbItems(index: number): CtxEntry[] {
  const last = (deck.value?.slides.length ?? 1) - 1
  const multi = selected.value.length > 1
  const items: CtxEntry[] = [
    { label: 'Duplicate Slide', action: () => { focusSlide(index); duplicateSlide() } },
    { label: 'Insert Slide Before', action: () => insertSlideAt(index) },
    { label: 'Insert Slide After', action: () => insertSlideAt(index + 1) },
    { divider: true },
    { label: multi ? 'Cut Slides' : 'Cut Slide', hint: 'Ctrl+X', action: cutSlides },
    { label: multi ? 'Copy Slides' : 'Copy Slide', hint: 'Ctrl+C', action: copySlides },
    {
      label: 'Paste Slides',
      hint: 'Ctrl+V',
      action: () => void pasteSlidesFromMenu(index),
    },
  ]
  if (supportsDir()) {
    items.push({ divider: true }, { label: 'Import Slides…', action: () => openSlideImport(index) })
  }
  items.push(
    { divider: true },
    { label: 'Delete Slide', disabled: last < 1, action: () => { focusSlide(index); removeSlide() } },
    { divider: true },
    { label: 'Move to Top', disabled: index === 0, action: () => moveSlideTo(index, 0) },
    { label: 'Move to Bottom', disabled: index === last, action: () => moveSlideTo(index, last) },
  )
  return items
}
function onCanvasContextMenu(p: { x: number; y: number; sx: number; sy: number; index: number; kind?: 'text' | 'link' | 'image' | 'cells'; url?: string; imageField?: 'image' | 'portraits' | 'gallery' | 'table'; imageIndex?: number; imageEl?: number; cells?: number[]; idle?: IdleText }) {
  if (!editMode.value) return
  if (p.kind === 'cells') {
    const index = p.imageIndex ?? -1
    ctxMenu.value = { x: p.x, y: p.y, items: tableCellMenu(p.imageEl, index, p.cells?.length ? p.cells : [index]) }
    return
  }
  if (p.kind === 'image') {
    const items = layoutImageItems({ field: p.imageField ?? 'image', index: p.imageIndex, el: p.imageEl })
    if (items.length) ctxMenu.value = { x: p.x, y: p.y, items }
    return
  }
  if (p.kind === 'link') {
    ctxMenu.value = { x: p.x, y: p.y, items: linkItems(p.url ?? '') }
    return
  }
  if (p.kind === 'text') {
    ctxMenu.value = { x: p.x, y: p.y, items: p.idle ? idleTextItems(p.idle) : textItems() }
    return
  }
  if (p.index < 0) {
    ctxMenu.value = { x: p.x, y: p.y, items: stageItems(p.sx, p.sy) }
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
// ── present mode: Dek's own right-click menu (#43) ──
// Presenting used to show Chrome's menu — Back, Forward, Print, Cast — none of
// which means anything in a running deck. Links keep the browser's menu, so
// "open in new tab" still works on them.
function onPresentContextMenu(e: MouseEvent) {
  if (editMode.value || !deck.value) return
  if ((e.target as HTMLElement | null)?.closest('a[href]')) return
  e.preventDefault()
  const last = deck.value.slides.length - 1
  ctxMenu.value = {
    x: e.clientX,
    y: e.clientY,
    items: [
      { label: 'Next Slide', hint: '→', disabled: current.value >= last, action: () => (current.value = Math.min(last, current.value + 1)) },
      { label: 'Previous Slide', hint: '←', disabled: current.value <= 0, action: () => (current.value = Math.max(0, current.value - 1)) },
      { divider: true },
      { label: 'Overview', hint: 'O', action: () => (overviewOpen.value = true) },
      { label: 'Presenter View', hint: 'P', action: () => openPresenter() },
      { label: 'Fullscreen', hint: 'F', check: !!document.fullscreenElement, action: toggleFullscreen },
      { divider: true },
      { label: 'Exit Presentation', hint: 'Esc', action: enterEdit },
    ],
  }
}

/** Text not being edited (#46): Edit Text first, then the usual formatting —
 *  applied to the whole text, since there's no selection to apply it to. */
function idleTextItems(idle: IdleText): CtxEntry[] {
  return [
    { label: 'Edit Text', action: idle.edit },
    { divider: true },
    ...textItems().map((it): CtxEntry =>
      isDivider(it) ? it : { ...it, action: () => { idle.selectAll(); it.action?.() } },
    ),
  ]
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
  // Right-clicking outside the current multi-selection selects just that slide
  // (matches the element context menu's behavior).
  if (!selected.value.includes(p.index)) focusSlide(p.index)
  ctxMenu.value = { x: p.x, y: p.y, items: thumbItems(p.index) }
}
/** Open the deck browser in "import" mode to merge another workspace deck's
 *  slides in right after `index`. */
function openSlideImport(index: number) {
  importAt.value = index
  deckBrowser.value = 'import'
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
function splitOverflow(e: { index: number; target: SlideSplitTarget }) {
  if (!deck.value) return
  const result = splitSlide(deck.value.slides[e.index], e.target)
  if (!result) return
  snap('split')
  deck.value.slides.splice(e.index, 1, ...result)
  focusSlide(e.index + 1)
  selectedEls.value = []
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
/** Move to Top / Bottom: same group rule as dragging (core/grouping.ts). */
function moveSlideTo(from: number, to: number) {
  if (!deck.value || from === to) return
  snap('reorder')
  const { slides, at } = moveSlides(deck.value.slides, [from], to === 0 ? 0 : deck.value.slides.length)
  deck.value.slides = slides
  focusSlide(at)
  void saveWholeDeck()
}

// ── slide clipboard (Cut/Copy/Paste in the navigator's context menu) ──
// Two copies of what was copied. In memory, for pasting back into the same
// deck: exact, and no picture gets saved a second time. And on the system
// clipboard as Dek text (core/slideClipboard.ts) with the pictures inside,
// which is what crosses to another tab, window or deck — and to a text editor.
const slideClipboard: { slides: Slide[]; deck: Deck | null; text: string } = { slides: [], deck: null, text: '' }
async function putSlidesOnClipboard(clones: Slide[]) {
  slideClipboard.text = ''
  try {
    const text = slidesToText(await inlineSlidePictures(clones))
    slideClipboard.text = text
    await navigator.clipboard.writeText(text)
  } catch {
    /* no clipboard access: the in-memory copy still pastes within this tab */
  }
}
function cloneSlides(indices: number[]): Slide[] {
  if (!deck.value) return []
  return [...new Set(indices)].sort((a, b) => a - b).map((i) => JSON.parse(JSON.stringify(deck.value!.slides[i])) as Slide)
}
function copySlides() {
  const idx = selected.value.length ? selected.value : [current.value]
  const clones = cloneSlides(idx)
  if (!clones.length) return
  slideClipboard.slides = clones
  slideClipboard.deck = deck.value
  void putSlidesOnClipboard(clones)
}
function cutSlides() {
  const idx = selected.value.length ? selected.value : [current.value]
  const clones = cloneSlides(idx)
  if (!clones.length) return
  slideClipboard.slides = clones
  slideClipboard.deck = deck.value
  void putSlidesOnClipboard(clones)
  selected.value = idx
  removeSlide()
}
/** Paste slides right after `after` and select the pasted run: the in-memory
 *  copy, or `incoming` from the system clipboard (another tab or deck). */
async function pasteSlides(after: number, incoming?: Slide[]) {
  if (!deck.value) return
  let copies: Slide[]
  if (incoming) {
    const target = deck.value
    try {
      // Pictures arrive inside the text; save them into THIS deck's Assets.
      copies = await storeSlidePictures(incoming, uploadImage)
    } catch (e) {
      error.value = `Paste failed: ${(e as Error).message}`
      return
    }
    void refreshDiskAssets()
    if (deck.value !== target) return // another deck was opened meanwhile
  } else {
    if (!slideClipboard.slides.length) return
    copies = slideClipboard.slides.map((s) => JSON.parse(JSON.stringify(s)) as Slide)
  }
  snap('add')
  deck.value.slides.splice(after + 1, 0, ...copies)
  focusSlide(after + 1)
  selected.value = copies.map((_, i) => after + 1 + i)
  void saveWholeDeck()
}

/** Block move: relocate one or more slides (preserving their order) before `before`. */
/** Block move from the slide list. Loose slides take the group of where they
 *  land; a chapter dragged by its heading keeps its own (core/grouping.ts). */
function reorder(e: { indices: number[]; before: number; chapter?: boolean }) {
  if (!deck.value) return
  snap('reorder')
  const count = new Set(e.indices).size
  const { slides, at } = moveSlides(deck.value.slides, e.indices, e.before, e.chapter)
  deck.value.slides = slides
  current.value = at
  selected.value = Array.from({ length: count }, (_, k) => at + k)
  anchor = at
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
async function onUpload(e: { field: 'image' | 'poster' | 'portraits' | 'gallery' | 'table'; file: File; index?: number; el?: number }) {
  if (!deck.value) return
  const dataUrl = await fileToOptimizedDataUrl(e.file)
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
    if (e.index != null) patchSlide({ items: replaceGalleryImage(slide.items, e.index, url) })
  } else if (e.field === 'table') {
    patchTableCell({ field: 'table', index: e.index, el: e.el }, { image: url, text: undefined })
  }
  if (e.field === 'image' || e.field === 'gallery' || e.field === 'table') void offerQrLink(current.value, fieldRef({ ...e, field: e.field }))
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
      @close="startPresenting()"
      @export="exportOpen = true"
      @review="toggleReview"
      @browse="deckBrowser = 'open'"
      @save-as="onSaveAs"
      @new-deck="onNewDeck"
      @open-deck="onOpenDeck"
      :recent-decks="recentDecks"
      @open-recent="onOpenRecent"
      @import="onImportFile"
      @theme="setTheme"
    />

    <div class="body">
      <SlideNavigator
        v-if="deck && editMode"
        :deck="deck"
        :current="current"
        :selected="selected"
        :severity="slideSeverity"
        @update:current="current = $event"
        @select="onSelect"
        @reorder="reorder"
        @ungroup="ungroup"
        @rename="renameGroup"
        @add="addSlide"
        @duplicate="duplicateSlide"
        @remove="removeSlide"
        @group="groupSelected"
        @autogroup="autoGroup"
        @contextmenu-slide="onSlideContextMenu"
      />

      <div v-if="deck" class="stage-wrap" @contextmenu="onPresentContextMenu">
        <DeckView
          v-model="current"
          :deck="deck"
          :editable="editMode"
          :bullet-format-command="bulletFormatCommand"
          :nav-enabled="!overviewOpen && !presenterOpen && !exportOpen && !deckBrowser"
          :tool="activeTool"
          :selected-el="selectedEls"
          :pending-image="pendingImage"
          v-model:drawing="drawing"
          v-model:revealed="revealed"
          v-model:narrating="narrating"
          @narration-end="onNarrationEnd"
          :ink-color="inkColor"
          @patch="patchSlide"
          @config-patch="patchConfig"
          @upload="onUpload"
          @update:elements="onUpdateElements"
          @update:selected-el="selectedEls = $event"
          @create-element="onCreateElement"
          @tool-reset="((activeTool = 'select'), (pendingImage = ''))"
          @element-image="onElementImage"
          @split="splitOverflow"
          @drop-image="onDropImage"
          @drop-link="onDropLink"
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
      :qr-scan="qrScan"
      @scan-qr="scanDeckForQr"
      @link-qr="linkAllQr"
    />

    <!-- edit-mode speaker-notes strip -->
    <div v-if="deck && editMode" class="notes-bar" :style="{ height: notesHeight + 'px' }">
      <!-- Drag the top edge to make the notes taller or shorter. -->
      <div class="notes-grip" title="Drag to resize the notes" @pointerdown="onNotesGripDown" @dblclick="setNotesHeight(NOTES_DEFAULT)" />
      <span class="notes-label">Notes</span>
      <div ref="notesScroll" class="notes-scroll" :style="{ fontSize: notesFont + 'px' }">
        <EditableText
          class="notes-input"
          multiline
          :model-value="deck.slides[current]?.notes"
          placeholder="Speaker notes for this slide (shown in Presenter view)…"
          @update:model-value="patchSlide({ notes: $event })"
        />
      </div>
    </div>

    <!-- present-mode chrome (fades out when idle) -->
    <div v-if="deck && !editMode" class="deck-menu-present present-chrome" :class="{ 'ui-hidden': uiHidden }">
      <DeckMenu
        :current-name="deck.config.deck ?? 'deck'"
        :theme-id="(deck.config.theme?.preset as ThemeId | undefined) ?? 'default'"
        @browse="deckBrowser = 'open'"
        @save-as="onSaveAs"
        @new="onNewDeck"
        @open="onOpenDeck"
        @import="onImportFile"
        @export="exportOpen = true"
        @theme="setTheme"
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
      <button :class="{ on: drawing }" :title="drawing ? 'Stop drawing and clear (D)' : 'Draw on the slide (D)'" @click="drawing = !drawing">✎</button>
      <template v-if="drawing">
        <button
          v-for="(c, k) in inkPalette"
          :key="k"
          class="ink-swatch"
          :class="{ on: inkChoice === k }"
          :style="{ background: c }"
          :title="'Pen colour ' + (k + 1)"
          @click="inkChoice = k"
        />
      </template>
      <span class="hud-sep" />
      <button :class="{ on: narrating }" :title="narrating ? 'Stop narrating (Enter)' : 'Narrate: Dek presents and speaks the notes from each > on (Enter)'" @click="narrating = !narrating">▷</button>
      <button :class="{ on: voicePanel }" title="Narration voice" @click="voicePanel = !voicePanel">⚙</button>
      <button class="rec" :class="{ on: !!recording }" :title="recording ? 'Stop recording' : 'Record an MP4 (starts narrating)'" @click="toggleRecording">●</button>
      <span class="hud-sep" />
      <button title="Exit to the editor (Esc)" @click="enterEdit">✕</button>
      <div v-if="voicePanel" class="voice-panel" @click.stop>
        <label>
          Source
          <select v-model="voiceSettings.source">
            <option value="browser">Browser voice</option>
            <option value="local">Local voice (generated audio)</option>
          </select>
        </label>
        <template v-if="voiceSettings.source === 'local'">
          <p>
            <template v-if="voiceGen.coverage.value">{{ voiceGen.coverage.value.have }} of {{ voiceGen.coverage.value.total }} spoken lines have audio.</template>
            Lines without it use the browser voice below.
          </p>
          <!-- Voicing the missing lines runs in the Dek Helper on this machine. -->
          <div class="helper-row">
            <template v-if="!voiceGen.status.value?.running">
              <p>Dek Helper isn't running. Start it with <code>npm run helper</code> in the Dek folder.</p>
              <button class="panel-btn" @click="voiceGen.refresh()">Check again</button>
            </template>
            <p v-else-if="!voiceGen.status.value.paired">This Dek Helper is an older version. Close its window and start it again.</p>
            <p v-else-if="!voiceGen.status.value.voiceTool">Dek Helper can't find the voice tool on this machine.</p>
            <template v-else-if="voiceGen.job.value">
              <p>
                {{ voiceGen.job.value.state === 'loading' ? 'Loading the voice model (about a minute)…' : `Voicing ${voiceGen.written.value} of ${voiceGen.job.value.total}…` }}
              </p>
              <button class="panel-btn" @click="voiceGen.stop()">Stop</button>
            </template>
            <button v-else-if="voiceGen.missing.value.length" class="panel-btn" @click="voiceGen.generate()">
              Voice {{ voiceGen.missing.value.length }} missing {{ voiceGen.missing.value.length === 1 ? 'line' : 'lines' }}
            </button>
          </div>
          <label class="check">
            <input v-model="voiceSettings.autoVoice" type="checkbox" />
            Voice new lines automatically
          </label>
          <p v-if="voiceGen.unknownTags.value.length" class="panel-err">
            The voice ignores {{ voiceGen.unknownTags.value.map((t) => `[${t}]`).join(' ') }} — it knows [calm] [happy] [breath].
          </p>
          <p v-if="voiceSettings.autoVoice && voiceGen.autoState.value">{{ voiceGen.autoState.value }}</p>
          <p v-if="voiceGen.error.value" class="panel-err">
            {{ voiceGen.error.value }}
            <button v-if="/GPU/.test(voiceGen.error.value)" class="panel-btn" @click="voiceGen.generate(true)">Try with CPU offload</button>
          </p>
        </template>
        <label>
          {{ voiceSettings.source === 'local' ? 'Browser voice (for lines without audio)' : 'Voice' }}
          <select v-model="voiceSettings.voice">
            <option value="">Browser default</option>
            <option v-for="v in browserVoices" :key="v.voiceURI" :value="v.voiceURI">{{ v.name }} · {{ v.lang }}</option>
          </select>
        </label>
        <label>
          Speed {{ voiceSettings.rate.toFixed(2) }}×
          <input v-model.number="voiceSettings.rate" type="range" min="0.6" max="1.6" step="0.05" />
        </label>
        <p>Spoken: the notes from each <code>&gt;</code> to the next (one per bullet on build slides); notes before the first <code>&gt;</code> stay private. Generated audio plays inside the tab, so recording the Dek tab captures it. The browser voice doesn't: for that, record the entire screen with “Also share system audio”.</p>
      </div>
    </div>

    <!-- overlays -->
    <DeckBrowser
      v-if="deckBrowser"
      :mode="deckBrowser"
      :current-name="deck?.config.deck ?? ''"
      @open-deck="onBrowserOpen"
      @save-deck="onBrowserSave"
      @import-deck="onBrowserImport"
      @close="((deckBrowser = null), (importAt = null))"
    />
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
      :revealed="revealed"
      relay-media
      @step="onPresenterStep"
      @media="sendAudienceKey"
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

    <!-- Chrome downgrades a remembered handle's readwrite grant to "prompt" on a
         new session. Re-granting needs a user gesture, but only shows a small
         allow bubble — never a file/folder picker. -->
    <div v-if="qrOffer" class="toast reconnect">
      <span>This picture's QR code links to {{ qrOffer.url.length > 60 ? qrOffer.url.slice(0, 57) + '…' : qrOffer.url }}</span>
      <button class="toast-btn" @click="acceptQrOffer">Add link</button>
      <button class="toast-x" title="Keep the picture without a link" @click="qrOffer = null">✕</button>
    </div>
    <div v-if="recorded" class="toast reconnect">
      <span>Recording ready — {{ recordedLabel }}</span>
      <button class="toast-btn" @click="onSaveRecording">Save MP4</button>
      <button class="toast-x" title="Discard" @click="recorded = null">✕</button>
    </div>
    <div v-if="reconnectName" class="toast reconnect">
      <span>Reopen “{{ reconnectName }}” — your last deck.</span>
      <button class="toast-btn" @click="onReconnectFolder">Reopen</button>
      <button class="toast-x" title="Dismiss" @click="reconnectName = null">✕</button>
    </div>

    <!-- No File System Access API: decks aren't saved as real files, only to
         this browser's local storage. Explains why, and how to fix it. -->
    <div v-if="showFsWarning" class="toast warn">
      <span v-if="isChromiumBased">
        Decks aren't saving to real files — the File System Access API looks disabled in this browser.
        Check <code>chrome://flags</code> (or your browser's equivalent flags page) for
        <strong>"File System Access API"</strong> or <strong>"Experimental Web Platform features"</strong>,
        enable it, and relaunch. Until then, decks only persist in this browser's local storage.
      </span>
      <span v-else>
        Decks aren't saving to real files — Safari and Firefox don't support the File System Access API.
        Use a Chromium-based browser (Chrome, Edge, Brave, Opera) to open/save decks as files on disk.
        Until then, decks only persist in this browser's local storage.
      </span>
      <button class="toast-btn" @click="dismissFsWarning">Got it</button>
      <button class="toast-x" title="Dismiss" @click="dismissFsWarning">✕</button>
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
.toast.reconnect {
  background: rgba(16, 24, 34, 0.97);
  border: 1px solid rgba(127, 199, 255, 0.45);
  color: #cfe6ff;
  cursor: default;
}
.toast.warn {
  background: rgba(46, 38, 14, 0.97);
  border: 1px solid rgba(255, 180, 116, 0.5);
  color: #ffe6c2;
  cursor: default;
  max-width: 640px;
  line-height: 1.5;
}
.toast.warn code {
  background: rgba(255, 255, 255, 0.12);
  padding: 0 5px;
  border-radius: 4px;
}
.toast-btn {
  background: rgba(127, 199, 255, 0.16);
  border: 1px solid rgba(127, 199, 255, 0.55);
  color: #cfe6ff;
  border-radius: 7px;
  padding: 4px 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.toast-btn:hover {
  background: rgba(127, 199, 255, 0.28);
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
  position: relative;
  flex: none;
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 8px 16px;
  box-sizing: border-box;
  background: #101216;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-family: 'JetBrains Mono', monospace;
}
/* The resize handle: a strip along the top edge, highlighted on hover. */
.notes-grip {
  position: absolute;
  top: -4px;
  left: 0;
  right: 0;
  height: 8px;
  cursor: row-resize;
  z-index: 2;
}
.notes-grip:hover,
.notes-bar.resizing .notes-grip {
  background: linear-gradient(transparent 3px, rgba(127, 199, 255, 0.55) 3px, rgba(127, 199, 255, 0.55) 5px, transparent 5px);
}
.notes-scroll {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
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
  font-size: inherit;
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
.hud button.on { color: var(--dek-accent, #7fc7ff); }
.hud button.rec.on { color: #f87171; }
.voice-panel {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(18, 20, 24, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.8);
}
.voice-panel label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.voice-panel select {
  background: #0c0e12;
  color: #e6ecf2;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 4px 6px;
  font: inherit;
}
.voice-panel .helper-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
.voice-panel input {
  width: 110px;
  background: #0c0e12;
  color: #e6ecf2;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 4px 6px;
  font: inherit;
}
.hud .voice-panel .panel-btn {
  font-size: 11px;
  padding: 4px 10px;
  border: 1px solid rgba(127, 199, 255, 0.45);
  border-radius: 6px;
  color: #cfe6ff;
}
.voice-panel label.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.voice-panel .panel-err {
  color: #fecaca;
}
.voice-panel p {
  margin: 0;
  line-height: 1.5;
  color: rgba(230, 236, 242, 0.55);
}
/* Pen colours: small filled circles; the chosen one gets a ring. The ring is
   light on a dark HUD whatever the colour, so a bg-coloured swatch still shows. */
.hud button.ink-swatch {
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
}
.hud button.ink-swatch.on {
  box-shadow: 0 0 0 2px rgba(18, 20, 24, 0.9), 0 0 0 3.5px #fff;
}
</style>
