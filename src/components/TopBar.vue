<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { Deck, LayoutId, Slide, SlideElement, BoxElement, ArrowElement, TableElement, TableData, TableView, CanvasTool, ElementPatch } from '../core/types'
import { LAYOUT_IDS } from '../core/types'
import { TYPE_SCALE } from '../core/defaults'
import { TABLE_CELL_SIZE, emptyTable, resizeTable, resizeWouldDropContent, tableShape } from '../core/table'
import { DEFAULT_THEME, type ThemeId } from '../tokens'
import DeckMenu from './DeckMenu.vue'
import type { RecentDeck } from '../storage/recent'
import ColorPicker from './ColorPicker.vue'

const props = defineProps<{
  deck: Deck
  index: number
  saveStatus: 'saved' | 'unsaved' | 'saving'
  autosave: boolean
  canUndo: boolean
  canRedo: boolean
  reviewCount: number
  tool: CanvasTool
  selectedElement: SlideElement | null
  recentDecks?: RecentDeck[]
  showSource: boolean
}>()
const emit = defineEmits<{
  'change-layout': [id: LayoutId]
  patch: [p: Partial<Slide>]
  format: [kind: 'bold' | 'italic' | 'underline' | 'strike' | 'bullet']
  undo: []
  redo: []
  'toggle-autosave': []
  save: []
  close: []
  export: []
  review: []
  browse: []
  'save-as': []
  'new-deck': []
  'open-deck': [file: string]
  'open-recent': [deck: RecentDeck]
  import: [file: File]
  theme: [id: ThemeId]
  'update:tool': [t: CanvasTool]
  insert: [what: 'video' | 'diagram' | 'table']
  'update-element': [p: ElementPatch]
  'toggle-source': []
  /** Insert a new image as a box on the canvas. */
  'insert-image': [f: File]
  /** Move the selected element(s) forward (+1) or back (−1) in paint order. */
  'z-order': [dir: 1 | -1]
}>()

const imgInput = ref<HTMLInputElement | null>(null)
function pickImage() {
  imgInput.value?.click()
}
function onImgPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f && f.type.startsWith('image/')) emit('insert-image', f)
  input.value = ''
}

const slide = computed(() => props.deck.slides[props.index])

// The icon replaces a label, so the tooltip has to carry what the label used to
// say: both states, and the fact that clicking toggles rather than saves.
const saveTitle = computed(() => {
  const state =
    props.saveStatus === 'saving' ? 'saving…' : props.saveStatus === 'unsaved' ? 'unsaved changes' : 'all changes saved'
  const mode = props.autosave ? 'Autosave on' : 'Autosave off'
  return `${mode} — ${state}. Click to turn autosave ${props.autosave ? 'off' : 'on'}. Save now with Ctrl+S (⌘S).`
})

// The image layouts that carry a single framed image and support a fill/fit
// toggle. image-caption defaults to `contain` (show the whole photo); the others
// default to `cover` (fill the frame), matching SlideView's per-layout defaults.
const IMAGE_FIT_LAYOUTS: LayoutId[] = ['text-image', 'image-full', 'image-caption', 'gallery']
const showImageFit = computed(() => !!slide.value && IMAGE_FIT_LAYOUTS.includes(slide.value.layout))
const imageFit = computed(() => slide.value?.imageFit ?? (slide.value?.layout === 'image-caption' ? 'contain' : 'cover'))

const LAYOUT_LABELS: Record<LayoutId, string> = {
  cover: 'Cover',
  section: 'Section',
  statement: 'Statement',
  speaker: 'Speaker',
  text: 'Text',
  'text-image': 'Text + Image',
  'image-full': 'Image – Full',
  'image-caption': 'Image + Caption',
  'video-embed': 'Video',
  gallery: 'Gallery',
  diagram: 'Diagram',
  table: 'Table',
  poll: 'Poll',
  freeform: 'Freeform',
}

// ── canvas tools ──
const insertOpen = ref(false)
const insertBtn = ref<HTMLButtonElement | null>(null)
// The Insert menu is teleported to <body> so it isn't clipped by .center's
// overflow: hidden. We anchor it under the button via its bounding rect.
const menuPos = ref({ top: 0, left: 0 })
const insertMenu = ref<HTMLElement | null>(null)
function toggleInsert() {
  insertOpen.value = !insertOpen.value
  if (insertOpen.value) {
    layoutOpen.value = false
    const r = insertBtn.value?.getBoundingClientRect()
    if (r) menuPos.value = { top: r.bottom + 4, left: r.left }
  }
}

// ── layout picker (same menu as Insert, so the two read as one system) ──
const layoutOpen = ref(false)
const layoutBtn = ref<HTMLButtonElement | null>(null)
const layoutMenu = ref<HTMLElement | null>(null)
const layoutMenuPos = ref({ top: 0, left: 0 })
/** Width of the longest label, in `ch` of the bar's monospace font — exact,
 *  so the button never resizes when the current layout changes. */
const LAYOUT_LABEL_CH = Math.max(...Object.values(LAYOUT_LABELS).map((s) => s.length))
function toggleLayout() {
  layoutOpen.value = !layoutOpen.value
  if (layoutOpen.value) {
    insertOpen.value = false
    const r = layoutBtn.value?.getBoundingClientRect()
    if (r) layoutMenuPos.value = { top: r.bottom + 4, left: r.left }
  }
}
function pickLayout(id: LayoutId) {
  layoutOpen.value = false
  if (id !== slide.value?.layout) emit('change-layout', id)
}

// Both menus close on a click anywhere else or on Escape — the Insert menu used
// to close on pointer-leave, which with a 13-item layout list meant a slightly
// wide mouse path shut it mid-reach.
function onDocPointerDown(e: PointerEvent) {
  const t = e.target as Node
  if (insertOpen.value && !insertMenu.value?.contains(t) && !insertBtn.value?.contains(t)) insertOpen.value = false
  if (layoutOpen.value && !layoutMenu.value?.contains(t) && !layoutBtn.value?.contains(t)) layoutOpen.value = false
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && (insertOpen.value || layoutOpen.value)) {
    insertOpen.value = false
    layoutOpen.value = false
  }
}
onMounted(() => {
  window.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('keydown', onDocKey)
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('keydown', onDocKey)
})
function pickTool(t: CanvasTool) {
  emit('update:tool', t)
  insertOpen.value = false
}

// ── selected-element controls ──
// Only the fonts the theme actually loads — 'heading'/'body' tokens resolve to
// the deck's --dek-font-* CSS vars, so labels show the real family names.
const FONTS = computed(() => [
  { v: 'heading', label: `Heading · ${props.deck.config.theme?.fontHeading ?? 'Cormorant Garamond'}` },
  { v: 'body', label: `Body · ${props.deck.config.theme?.fontBody ?? 'JetBrains Mono'}` },
])
const box = computed(() => (props.selectedElement?.type === 'box' ? (props.selectedElement as BoxElement) : null))
const arrow = computed(() => (props.selectedElement?.type === 'arrow' ? (props.selectedElement as ArrowElement) : null))
const tableEl = computed(() => (props.selectedElement?.type === 'table' ? (props.selectedElement as TableElement) : null))

// ── table controls: ONE set, for the Table layout or a selected canvas table ──
/** The table the controls act on — a selected canvas table wins, else the
 *  slide's own. Both are the same `TableData`, so the canvas gets the full
 *  control set (it used to get font and size only). */
const activeTable = computed<TableData | null>(() => {
  if (tableEl.value) return tableEl.value.table
  return slide.value?.layout === 'table' ? (slide.value.table ?? emptyTable(1, 1)) : null
})
const tableDims = computed(() => {
  const { rows, cols } = tableShape(activeTable.value)
  return { rows, cols }
})
function setTable(t: TableData) {
  if (tableEl.value) upd({ table: t })
  else emit('patch', { table: t })
}
function patchTable(p: Partial<TableData>) {
  if (activeTable.value) setTable({ ...activeTable.value, ...p })
}
/** `table` is the default, so it's stored as absent — deck.md only says
 *  `view:` when a table is actually shown as something else. */
function setTableView(view: TableView) {
  patchTable({ view: view === 'table' ? undefined : view })
}
const TABLE_VIEWS: Array<{ id: TableView; title: string }> = [
  { id: 'table', title: 'Show the rows as a table' },
  { id: 'pie', title: 'Pie chart — labels from the first column, values from the first numeric one' },
  { id: 'cloud', title: 'Word cloud — words from the first column, optional weights from a numeric one' },
]
function resizeActiveTable(rows: number, cols: number) {
  const t = activeTable.value
  if (!t) return
  rows = Math.max(1, Math.min(20, Math.round(rows)))
  cols = Math.max(1, Math.min(20, Math.round(cols)))
  if (rows === tableDims.value.rows && cols === tableDims.value.cols) return
  if (resizeWouldDropContent(t, rows, cols) && !window.confirm('Shrinking the table will remove content from some cells. Continue?')) return
  setTable(resizeTable(t, rows, cols))
}
function upd(p: ElementPatch) {
  emit('update-element', p)
}

// The theme's resolved default text color — what a box with no explicit `color`
// actually renders as (CanvasElements falls back to var(--dek-text)). Passing it
// as the picker's display value keeps the swatch honest instead of blank.
const themeDefaultText = computed(() => props.deck.config.theme?.text ?? DEFAULT_THEME.color.text)

// Font size steps through the token type scale rather than ±1, so the buttons
// move between sizes that actually read as distinct. The field stays free-type.
function stepFontSize(dir: 1 | -1) {
  upd({ size: stepScale(box.value?.size ?? 28, dir) })
}
/** Next/previous size on the token type scale, so the ± buttons land on sizes
 *  that actually read as distinct instead of drifting by 1px. */
function stepScale(cur: number, dir: 1 | -1): number {
  return dir > 0
    ? (TYPE_SCALE.find((s) => s > cur) ?? cur)
    : ([...TYPE_SCALE].reverse().find((s) => s < cur) ?? cur)
}
function stepTableSize(dir: 1 | -1) {
  patchTable({ size: stepScale(activeTable.value?.size ?? TABLE_CELL_SIZE, dir) })
}
// Swatches offered in the color picker: the deck theme's own colors first, then
// a couple of neutral anchors. De-duped, falling back to the built-in defaults.
const themeSwatches = computed(() => {
  const t = props.deck.config.theme ?? {}
  const d = DEFAULT_THEME.color
  const list = [t.text, t.accent, t.accent2, t.bg, d.text, d.bg, '#ffffff', '#000000']
  return [...new Set(list.filter((c): c is string => !!c).map((c) => c.toLowerCase()))]
})
</script>

<template>
  <div class="bar">
    <div class="left">
      <span class="brand">Dek</span>
      <DeckMenu
        :current-name="deck.config.deck ?? 'deck'"
        :theme-id="(deck.config.theme?.preset as ThemeId | undefined) ?? 'default'"
        :recent="recentDecks"
        @open-recent="emit('open-recent', $event)"
        @browse="emit('browse')"
        @save-as="emit('save-as')"
        @new="emit('new-deck')"
        @open="emit('open-deck', $event)"
        @export="emit('export')"
        @import="emit('import', $event)"
        @theme="emit('theme', $event)"
      />
      <span class="div" />
      <!-- Autosave + save state in one control: the disk's colour is the state
           (green saved / amber saving / red unsaved), the slash is autosave
           being off. Red-with-a-slash is the one combination worth noticing —
           pending changes and nothing coming to write them. -->
      <button class="save-btn" :class="saveStatus" :title="saveTitle" @click="emit('toggle-autosave')">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M4 4h12l4 4v12H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          <path d="M8 4v5h7V4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          <rect x="7.5" y="13" width="9" height="6" fill="none" stroke="currentColor" stroke-width="1.6" />
          <!-- The backing stroke is the bar's own colour, so the slash stays
               readable where it crosses the disk's outlines. -->
          <template v-if="!autosave">
            <line x1="3.5" y1="20.5" x2="20.5" y2="3.5" stroke="#14161b" stroke-width="4" stroke-linecap="round" />
            <line x1="3.5" y1="20.5" x2="20.5" y2="3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </template>
        </svg>
      </button>
      <div class="seg">
        <button title="Undo (Ctrl+Z)" :disabled="!canUndo" @click="emit('undo')">↶</button>
        <button title="Redo (Ctrl+Shift+Z)" :disabled="!canRedo" @click="emit('redo')">↷</button>
      </div>
    </div>

    <div class="center">
      <!-- Layout picker: Dek's own menu rather than a native <select>, whose
           popup takes the OS highlight and never matched the Insert menu beside
           it. Fixed at the longest label's width so the tools to its right
           don't shift as you move between slides with different layouts. -->
      <button
        ref="layoutBtn"
        class="layout-btn"
        :class="{ on: layoutOpen }"
        :style="{ width: `calc(${LAYOUT_LABEL_CH}ch + 30px)` }"
        title="Slide layout"
        @click="toggleLayout"
      >
        <span class="layout-name">{{ slide ? LAYOUT_LABELS[slide.layout] : '' }}</span>
        <svg class="caret" viewBox="0 0 10 6" width="9" height="6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <Teleport to="body">
        <div
          v-if="layoutOpen"
          ref="layoutMenu"
          class="menu"
          :style="{ top: layoutMenuPos.top + 'px', left: layoutMenuPos.left + 'px' }"
        >
          <button
            v-for="id in LAYOUT_IDS"
            :key="id"
            :class="{ current: slide?.layout === id }"
            @click="pickLayout(id)"
          >
            {{ LAYOUT_LABELS[id] }}
          </button>
        </div>
      </Teleport>

      <span class="div" />

      <!-- canvas tools (always available) -->
      <div class="seg ctools">
        <button class="icon-btn" :class="{ on: tool === 'select' }" title="Select / move (V)" @click="pickTool('select')">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M5 3l14 7-6 1.5L9.5 18z" fill="currentColor" /></svg>
        </button>
        <button class="icon-btn" :class="{ on: tool === 'text' }" title="Text box (T)" @click="pickTool('text')">
          <span class="tt">T</span>
        </button>
        <button class="icon-btn" :class="{ on: tool === 'rect' }" title="Box / rectangle" @click="pickTool('rect')">
          <svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        </button>
        <button class="icon-btn" :class="{ on: tool === 'arrow' }" title="Arrow" @click="pickTool('arrow')">
          <svg viewBox="0 0 24 24" width="15" height="15"><line x1="3" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" /><path d="M15 7l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        </button>
        <button class="icon-btn" title="Insert image" @click="pickImage()">
          <svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="8.5" cy="10" r="1.5" fill="currentColor" /><path d="M5 17l5-5 4 4 2-2 3 3" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        </button>
        <input ref="imgInput" type="file" accept="image/*" style="display: none" @change="onImgPick" />
        <div class="grp">
          <!-- Icon-only, sized to the canvas tool buttons it sits beside. The
               word and the caret were carrying no information the menu itself
               doesn't — the tooltip names the contents instead. -->
          <button ref="insertBtn" class="ins" :class="{ on: insertOpen }" title="Insert a Video, Diagram or Table slide" @click="toggleInsert">
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <Teleport to="body">
            <div
              v-if="insertOpen"
              ref="insertMenu"
              class="menu"
              :style="{ top: menuPos.top + 'px', left: menuPos.left + 'px' }"
            >
              <button @click="((insertOpen = false), emit('insert', 'video'))">▶ Video</button>
              <button @click="((insertOpen = false), emit('insert', 'diagram'))">◇ Diagram</button>
              <button @click="((insertOpen = false), emit('insert', 'table'))">▦ Table</button>
            </div>
          </Teleport>
        </div>
      </div>

      <!-- selected box: shape + text styling -->
      <template v-if="box">
        <span class="div" />
        <div class="seg style-seg">
          <ColorPicker
            title="Fill"
            :model-value="box.fill"
            :swatches="themeSwatches"
            allow-transparent
            fallback="#7fc7ff"
            @update:model-value="upd({ fill: $event })"
          />
          <ColorPicker
            title="Stroke"
            :model-value="box.stroke"
            :swatches="themeSwatches"
            allow-transparent
            fallback="#7fc7ff"
            @update:model-value="upd({ stroke: $event, strokeWidth: box.strokeWidth || 2 })"
          />
          <div class="num-spin" title="Stroke width">
            <button class="spin-btn" @mousedown.prevent="upd({ strokeWidth: Math.max(0, (box.strokeWidth ?? 0) - 1) })"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
            <input class="spin-val" type="number" min="0" max="40" :value="box.strokeWidth ?? 0" @input="upd({ strokeWidth: +($event.target as HTMLInputElement).value })" />
            <button class="spin-btn" @mousedown.prevent="upd({ strokeWidth: Math.min(40, (box.strokeWidth ?? 0) + 1) })"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
          </div>
          <div class="num-spin" title="Corner radius">
            <button class="spin-btn" @mousedown.prevent="upd({ radius: Math.max(0, (box.radius ?? 0) - 1) })"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
            <input class="spin-val" type="number" min="0" max="200" :value="box.radius ?? 0" @input="upd({ radius: +($event.target as HTMLInputElement).value })" />
            <button class="spin-btn" @mousedown.prevent="upd({ radius: Math.min(200, (box.radius ?? 0) + 1) })"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
          </div>
        </div>
        <span class="div" />
        <div class="seg style-seg">
          <select class="sel font" title="Font" :value="box.font ?? 'body'" @change="upd({ font: ($event.target as HTMLSelectElement).value })">
            <option v-for="f in FONTS" :key="f.v" :value="f.v">{{ f.label }}</option>
          </select>
          <div class="num-step" title="Font size">
            <button class="step-btn" title="Smaller" @mousedown.prevent="stepFontSize(-1)">−</button>
            <input class="step-val" type="number" min="8" max="400" :value="box.size ?? 28" @input="upd({ size: +($event.target as HTMLInputElement).value })" />
            <button class="step-btn" title="Larger" @mousedown.prevent="stepFontSize(1)">+</button>
          </div>
          <ColorPicker
            title="Text color"
            :model-value="box.color ?? themeDefaultText"
            :swatches="themeSwatches"
            fallback="#e6ecf2"
            @update:model-value="upd({ color: $event })"
          />
        </div>
        <div class="seg style-seg">
          <button class="icon-btn fmt" title="Bullet list (Ctrl+Shift+8)" @mousedown.prevent="emit('format', 'bullet')">
            <span class="bullet-list-icon" aria-hidden="true"><i /><i /><i /></span>
          </button>
          <button class="icon-btn fmt" :class="{ on: box.bold }" title="Bold" @mousedown.prevent="emit('format', 'bold')"><b>B</b></button>
          <button class="icon-btn fmt" :class="{ on: box.italic }" title="Italic" @mousedown.prevent="emit('format', 'italic')"><i>I</i></button>
          <button class="icon-btn fmt" :class="{ on: box.underline }" title="Underline" @mousedown.prevent="emit('format', 'underline')"><u>U</u></button>
          <button class="icon-btn fmt" :class="{ on: box.strike }" title="Strikethrough" @mousedown.prevent="emit('format', 'strike')"><s>S</s></button>
        </div>
        <div class="seg style-seg">
          <button class="icon-btn" :class="{ on: (box.align ?? 'left') === 'left' }" title="Align left" @click="upd({ align: 'left' })">⯇</button>
          <button class="icon-btn" :class="{ on: box.align === 'center' }" title="Align center" @click="upd({ align: 'center' })">≡</button>
          <button class="icon-btn" :class="{ on: box.align === 'right' }" title="Align right" @click="upd({ align: 'right' })">⯈</button>
        </div>
      </template>

      <!-- editing semantic text (no canvas element selected): inline formatting -->
      <template v-else-if="slide?.layout === 'text' || slide?.layout === 'text-image'">
        <span class="div" />
        <div class="seg style-seg">
          <button class="icon-btn fmt" title="Bullet list (Ctrl+Shift+8)" @mousedown.prevent="emit('format', 'bullet')">
            <span class="bullet-list-icon" aria-hidden="true"><i /><i /><i /></span>
          </button>
          <button class="icon-btn fmt" title="Bold" @mousedown.prevent="emit('format', 'bold')"><b>B</b></button>
          <button class="icon-btn fmt" title="Italic" @mousedown.prevent="emit('format', 'italic')"><i>I</i></button>
          <button class="icon-btn fmt" title="Underline" @mousedown.prevent="emit('format', 'underline')"><u>U</u></button>
          <button class="icon-btn fmt" title="Strikethrough" @mousedown.prevent="emit('format', 'strike')"><s>S</s></button>
        </div>
      </template>

      <!-- selected arrow: stroke -->
      <template v-else-if="arrow">
        <span class="div" />
        <div class="seg style-seg">
          <ColorPicker
            title="Color"
            :model-value="arrow.stroke"
            :swatches="themeSwatches"
            fallback="#e6ecf2"
            @update:model-value="upd({ stroke: $event })"
          />
          <div class="num-spin" title="Thickness">
            <button class="spin-btn" @mousedown.prevent="upd({ strokeWidth: Math.max(1, (arrow.strokeWidth ?? 3) - 1) })"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
            <input class="spin-val" type="number" min="1" max="40" :value="arrow.strokeWidth ?? 3" @input="upd({ strokeWidth: +($event.target as HTMLInputElement).value })" />
            <button class="spin-btn" @mousedown.prevent="upd({ strokeWidth: Math.min(40, (arrow.strokeWidth ?? 3) + 1) })"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
          </div>
        </div>
      </template>

      <!-- any selected element: z-order -->
      <template v-if="selectedElement">
        <span class="div" />
        <div class="seg style-seg">
          <button class="icon-btn" title="Bring forward (Ctrl+])" @click="emit('z-order', 1)">
            <svg viewBox="0 0 24 24" width="14" height="14"><rect x="8" y="4" width="12" height="12" rx="1.5" fill="currentColor" opacity="0.9" /><rect x="4" y="9" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" /></svg>
          </button>
          <button class="icon-btn" title="Send backward (Ctrl+[)" @click="emit('z-order', -1)">
            <svg viewBox="0 0 24 24" width="14" height="14"><rect x="8" y="4" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" /><rect x="4" y="9" width="11" height="11" rx="1.5" fill="currentColor" opacity="0.9" /></svg>
          </button>
        </div>
      </template>

      <!-- contextual controls -->
      <template v-if="slide?.layout === 'text-image'">
        <span class="div" />
        <label class="lbl">Image</label>
        <div class="seg">
          <button :class="{ on: (slide.side ?? 'right') === 'left' }" @click="emit('patch', { side: 'left' })">left</button>
          <button :class="{ on: (slide.side ?? 'right') === 'right' }" @click="emit('patch', { side: 'right' })">right</button>
        </div>
        <div class="seg">
          <button v-for="r in (['16:9', '1:1', '9:16'] as const)" :key="r"
            :class="{ on: (slide.imageRatio ?? '16:9') === r }"
            @click="emit('patch', { imageRatio: r })">{{ r }}</button>
        </div>
      </template>

      <!-- fill vs fit: shared by every single-image layout -->
      <template v-if="showImageFit">
        <span v-if="slide?.layout !== 'text-image'" class="div" />
        <div class="seg">
          <button title="Fill the frame, cropping overflow" :class="{ on: imageFit === 'cover' }" @click="emit('patch', { imageFit: 'cover' })">fill</button>
          <button title="Show the whole image inside the frame" :class="{ on: imageFit === 'contain' }" @click="emit('patch', { imageFit: 'contain' })">fit</button>
        </div>
      </template>

      <template v-if="slide?.layout === 'image-caption'">
        <span class="div" />
        <label class="lbl">Caption</label>
        <div class="seg">
          <button v-for="p in ['top-left', 'top-right', 'bottom-left', 'bottom-right']" :key="p"
            :class="{ on: (slide.captionPos ?? 'bottom-right') === p }"
            @click="emit('patch', { captionPos: p as any })">{{ p.replace('-', ' ') }}</button>
        </div>
      </template>

      <template v-if="slide?.layout === 'video-embed'">
        <span class="div" />
        <label class="lbl">Video</label>
        <div class="seg">
          <button title="16:9 frame with a caption below" :class="{ on: (slide.videoFit ?? 'framed') === 'framed' }" @click="emit('patch', { videoFit: 'framed' })">framed</button>
          <button title="Edge-to-edge 16:9, no caption" :class="{ on: slide.videoFit === 'full' }" @click="emit('patch', { videoFit: 'full' })">fullscreen</button>
        </div>
      </template>

      <template v-if="slide?.layout === 'poll'">
        <span class="div" />
        <label class="lbl">Answer</label>
        <div class="seg">
          <button title="Tap one of the answers" :class="{ on: (slide.poll?.kind ?? 'choice') === 'choice' }" @click="emit('patch', { poll: { ...slide.poll, kind: 'choice', options: slide.poll?.options?.length ? slide.poll.options : ['Yes', 'No'] } })">choice</button>
          <button title="Type a word or short phrase — shown as a word cloud" :class="{ on: slide.poll?.kind === 'words' }" @click="emit('patch', { poll: { ...slide.poll, kind: 'words' } })">words</button>
          <button title="Rate from 1 to 5" :class="{ on: slide.poll?.kind === 'scale' }" @click="emit('patch', { poll: { ...slide.poll, kind: 'scale' } })">1–5</button>
        </div>
      </template>

      <template v-if="slide?.layout === 'gallery'">
        <span class="div" />
        <label class="lbl">Cols</label>
        <div class="seg">
          <button v-for="c in ['auto', 2, 3, 4]" :key="c"
            :class="{ on: (slide.columns ?? 'auto') === c }"
            @click="emit('patch', { columns: c as any })">{{ c }}</button>
        </div>
        <label class="lbl">Labels</label>
        <div class="seg">
          <button title="A label row beneath each picture" :class="{ on: (slide.labelPos ?? 'below') === 'below' }" @click="emit('patch', { labelPos: undefined })">below</button>
          <button title="Short labels (1, A) as a badge on the picture — the pictures get the height" :class="{ on: slide.labelPos === 'overlay' }" @click="emit('patch', { labelPos: 'overlay' })">badge</button>
        </div>
      </template>

      <!-- table: the Table layout or a selected canvas table — same controls -->
      <template v-if="activeTable">
        <span class="div" />
        <label class="lbl">Rows</label>
        <div class="num-spin" title="Rows">
          <button class="spin-btn" @mousedown.prevent="resizeActiveTable(tableDims.rows - 1, tableDims.cols)"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
          <input class="spin-val" type="number" min="1" max="20" :value="tableDims.rows" @change="resizeActiveTable(+($event.target as HTMLInputElement).value, tableDims.cols)" />
          <button class="spin-btn" @mousedown.prevent="resizeActiveTable(tableDims.rows + 1, tableDims.cols)"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
        </div>
        <label class="lbl">Cols</label>
        <div class="num-spin" title="Columns">
          <button class="spin-btn" @mousedown.prevent="resizeActiveTable(tableDims.rows, tableDims.cols - 1)"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
          <input class="spin-val" type="number" min="1" max="20" :value="tableDims.cols" @change="resizeActiveTable(tableDims.rows, +($event.target as HTMLInputElement).value)" />
          <button class="spin-btn" @mousedown.prevent="resizeActiveTable(tableDims.rows, tableDims.cols + 1)"><svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg></button>
        </div>
        <span class="div" />
        <div class="seg">
          <button
            v-for="v in TABLE_VIEWS"
            :key="v.id"
            :title="v.title"
            :class="{ on: (activeTable.view ?? 'table') === v.id }"
            @click="setTableView(v.id)"
          >{{ v.id }}</button>
        </div>
        <div class="seg">
          <button title="The first row names the columns — styled as a header, and skipped as data by charts" :class="{ on: !!activeTable.header }" @click="patchTable({ header: activeTable.header ? undefined : true })">header</button>
        </div>
        <span class="div" />
        <div class="seg style-seg">
          <select class="sel font" title="Cell font" :value="activeTable.font ?? 'body'" @change="patchTable({ font: ($event.target as HTMLSelectElement).value })">
            <option v-for="f in FONTS" :key="f.v" :value="f.v">{{ f.label }}</option>
          </select>
          <!-- Base size: cell text shrinks below it to fit, never above -->
          <div class="num-step" title="Cell text size (shrinks to fit)">
            <button class="step-btn" title="Smaller" @mousedown.prevent="stepTableSize(-1)">−</button>
            <input class="step-val" type="number" min="8" max="120" :value="activeTable.size ?? TABLE_CELL_SIZE" @input="patchTable({ size: +($event.target as HTMLInputElement).value })" />
            <button class="step-btn" title="Larger" @mousedown.prevent="stepTableSize(1)">+</button>
          </div>
        </div>
      </template>
    </div>

    <div class="right">
      <button class="topbtn" title="Review validation and assets" @click="emit('review')">
        Review{{ reviewCount ? ` ${reviewCount}` : '' }}
      </button>
      <button class="topbtn" :class="{ on: showSource }" title="Toggle Markdown source view" @click="emit('toggle-source')">&lt;/&gt; Source</button>
      <button class="present" title="Present (Ctrl+E)" @click="emit('close')">▶ Present</button>
    </div>
  </div>
</template>

<style scoped>
.bar {
  height: 50px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px;
  background: #14161b;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #e6ecf2;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}
.left { display: flex; align-items: center; gap: 10px; }
.brand {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 700;
  font-size: 22px;
  color: #fff;
}
.deck-title { color: rgba(230, 236, 242, 0.5); font-size: 11px; white-space: nowrap; }
.center { display: flex; align-items: center; gap: 8px; flex: 1; overflow: hidden; }
.right { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.lbl {
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-size: 10px;
  color: rgba(230, 236, 242, 0.4);
}
.div { width: 1px; height: 22px; background: rgba(255, 255, 255, 0.1); }
.sel {
  background: #1e222b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 7px;
  padding: 5px 8px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.seg { display: flex; gap: 4px; }
.seg button {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(230, 236, 242, 0.8);
  border-radius: 6px;
  padding: 5px 9px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.seg button:hover { background: rgba(255, 255, 255, 0.1); }
.seg button.on { border-color: #7fc7ff; color: #7fc7ff; }
.seg button:disabled { opacity: 0.35; cursor: not-allowed; }
.seg button.danger:hover { color: #f87171; border-color: rgba(248, 113, 113, 0.5); }
.seg.tools {
  gap: 2px;
}
.seg button.icon-btn {
  width: 31px;
  height: 29px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.seg button.icon-btn.on {
  background: rgba(127, 199, 255, 0.12);
}
.bullet-list-icon {
  position: relative;
  display: grid;
  gap: 4px;
  width: 17px;
}
.bullet-list-icon i {
  display: block;
  height: 2px;
  margin-left: 7px;
  border-radius: 2px;
  background: currentColor;
}
.bullet-list-icon i::before {
  content: '';
  position: absolute;
  left: 0;
  width: 3px;
  height: 3px;
  margin-top: -0.5px;
  border-radius: 1px;
  background: currentColor;
}
.chk {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.65);
  cursor: pointer;
}
.save-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 24px;
  padding: 0;
  flex-shrink: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  cursor: pointer;
  transition: color 0.2s, background 0.15s;
}
.save-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}
/* Colour is the save state, never autosave's on/off — the slash carries that,
   so "unsaved" stays red and legible whichever mode you're in. */
.save-btn.saved { color: #4ade80; }
.save-btn.saving { color: #facc15; }
.save-btn.unsaved { color: #f87171; }
.topbtn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 7px;
  padding: 5px 12px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.topbtn:hover { background: rgba(255, 255, 255, 0.12); }
.topbtn.on { border-color: #7fc7ff; color: #7fc7ff; background: rgba(127, 199, 255, 0.12); }
.present {
  background: rgba(127, 199, 255, 0.16);
  border: 1px solid rgba(127, 199, 255, 0.5);
  color: #cfe8ff;
  border-radius: 7px;
  padding: 5px 14px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}
.present:hover { background: rgba(127, 199, 255, 0.28); }

/* ── canvas tools + element style controls ── */
.ctools { gap: 2px; }
.style-seg { gap: 3px; align-items: center; }
.tt { font-weight: 700; font-size: 14px; }
.grp { position: relative; }
/* Matches .seg button.icon-btn exactly — it sits in that row, so any other
   size reads as a misalignment rather than a distinction. */
.ins {
  width: 31px;
  height: 29px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(230, 236, 242, 0.85);
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.ins:hover { background: rgba(255, 255, 255, 0.1); }
/* Held open: same treatment as an active canvas tool, so the button reads as
   the source of the menu floating next to it. */
.ins.on {
  border-color: #7fc7ff;
  color: #7fc7ff;
  background: rgba(127, 199, 255, 0.12);
}
/* Menus are teleported to <body> (so .center's overflow can't clip them),
   which takes them out from under .bar — they must restate the chrome font or
   they inherit the page default. That's how the Insert menu came out in a
   serif. */
.menu {
  position: fixed;
  display: flex;
  flex-direction: column;
  min-width: 130px;
  padding: 4px;
  background: rgba(24, 26, 31, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  z-index: 60;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
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
  font-size: 12px;
  text-align: left;
  font-family: inherit;
}
.menu button:hover { background: rgba(127, 199, 255, 0.18); color: #fff; }
/* The active layout, marked the way an active tool is — accent text on a faint
   accent tint — instead of the OS selection blue the native select used. */
.menu button.current { color: #7fc7ff; background: rgba(127, 199, 255, 0.1); }
.menu button.current:hover { background: rgba(127, 199, 255, 0.18); }

/* Layout trigger: styled as a sibling of the .seg buttons, not as a form
   field, so it belongs to the toolbar rather than to a settings form. */
.layout-btn {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: 29px;
  padding: 0 9px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: rgba(230, 236, 242, 0.85);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.layout-btn:hover { background: rgba(255, 255, 255, 0.1); }
.layout-btn.on { border-color: #7fc7ff; color: #7fc7ff; background: rgba(127, 199, 255, 0.12); }
.layout-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.layout-btn .caret {
  flex-shrink: 0;
  opacity: 0.6;
}
.fmt b, .fmt i, .fmt u, .fmt s { font-size: 13px; font-style: normal; }
.fmt i { font-style: italic; }
/* Custom spinner for strokeWidth / radius / thickness — themed arrows on
   transparent buttons flanking a slim editable number field. */
.num-spin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.spin-btn {
  background: transparent;
  border: none;
  color: #7fc7ff;
  cursor: pointer;
  padding: 1px 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  opacity: 0.75;
}
.spin-btn:hover { opacity: 1; }
.spin-val {
  width: 28px;
  background: transparent;
  border: none;
  color: #e6ecf2;
  font-family: inherit;
  font-size: 11px;
  text-align: center;
  padding: 0;
  /* hide native OS spinner arrows */
  appearance: textfield;
  -moz-appearance: textfield;
}
.spin-val::-webkit-inner-spin-button,
.spin-val::-webkit-outer-spin-button {
  display: none;
}
/* Horizontal font-size stepper: editable field flanked by minimal −/+ buttons.
   Buttons jump through the type scale; the field accepts any typed value. */
.num-step {
  display: flex;
  align-items: center;
  background: #1e222b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  overflow: hidden;
}
.step-btn {
  background: transparent;
  border: none;
  color: #7fc7ff;
  cursor: pointer;
  width: 18px;
  height: 26px;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.8;
}
.step-btn:hover { opacity: 1; background: rgba(127, 199, 255, 0.12); }
.step-val {
  width: 30px;
  background: transparent;
  border: none;
  color: #e6ecf2;
  font-family: inherit;
  font-size: 11px;
  text-align: center;
  padding: 0;
  appearance: textfield;
  -moz-appearance: textfield;
}
.step-val::-webkit-inner-spin-button,
.step-val::-webkit-outer-spin-button {
  display: none;
}
.sel.font { padding: 4px 6px; }
</style>
