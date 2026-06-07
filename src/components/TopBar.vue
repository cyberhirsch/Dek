<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Deck, LayoutId, Slide, SlideElement, BoxElement, ArrowElement, CanvasTool, ElementPatch } from '../core/types'
import { LAYOUT_IDS } from '../core/types'
import DeckMenu from './DeckMenu.vue'

const props = defineProps<{
  deck: Deck
  index: number
  selectedCount: number
  saveStatus: 'saved' | 'unsaved' | 'saving'
  autosave: boolean
  canUndo: boolean
  canRedo: boolean
  reviewCount: number
  tool: CanvasTool
  selectedElement: SlideElement | null
  showSource: boolean
}>()
const emit = defineEmits<{
  'change-layout': [id: LayoutId]
  patch: [p: Partial<Slide>]
  format: [kind: 'bold' | 'italic' | 'underline' | 'strike' | 'bullet']
  add: [id: LayoutId]
  duplicate: []
  remove: []
  group: []
  undo: []
  redo: []
  'toggle-autosave': []
  save: []
  close: []
  export: []
  review: []
  'open-file': []
  'open-folder': []
  'save-as': []
  'new-deck': []
  'open-deck': [file: string]
  'update:tool': [t: CanvasTool]
  insert: [what: 'video' | 'diagram' | 'table']
  'update-element': [p: ElementPatch]
  'toggle-source': []
  /** Set the selected box's image (file picked in the bar). */
  'set-image': [f: File]
  /** Insert a new image as a box on the canvas. */
  'insert-image': [f: File]
}>()

// One hidden file input drives both "add image to box" and "insert image".
const imgInput = ref<HTMLInputElement | null>(null)
let imgMode: 'set' | 'insert' = 'set'
function pickImage(mode: 'set' | 'insert') {
  imgMode = mode
  imgInput.value?.click()
}
function onImgPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f && f.type.startsWith('image/')) {
    if (imgMode === 'set') emit('set-image', f)
    else emit('insert-image', f)
  }
  input.value = ''
}

function onAdd(ev: Event) {
  const el = ev.target as HTMLSelectElement
  if (el.value) emit('add', el.value as LayoutId)
  el.value = '' // reset to placeholder
}

const slide = computed(() => props.deck.slides[props.index])

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
  freeform: 'Freeform',
}
const statusText = computed(() =>
  props.saveStatus === 'saving' ? 'saving…' : props.saveStatus === 'unsaved' ? 'unsaved' : 'saved',
)

// ── canvas tools ──
const insertOpen = ref(false)
const insertBtn = ref<HTMLButtonElement | null>(null)
// The Insert menu is teleported to <body> so it isn't clipped by .center's
// overflow: hidden. We anchor it under the button via its bounding rect.
const menuPos = ref({ top: 0, left: 0 })
function toggleInsert() {
  insertOpen.value = !insertOpen.value
  if (insertOpen.value) {
    const r = insertBtn.value?.getBoundingClientRect()
    if (r) menuPos.value = { top: r.bottom + 4, left: r.left }
  }
}
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
function upd(p: ElementPatch) {
  emit('update-element', p)
}
/** A hex to show in a color picker even when the stored value is transparent/unset. */
function colorOr(v: string | undefined, fallback: string) {
  return v && v !== 'transparent' ? v : fallback
}
</script>

<template>
  <div class="bar">
    <div class="left">
      <span class="brand">Dek</span>
      <DeckMenu
        :current-name="deck.config.deck ?? 'deck'"
        @open-file="emit('open-file')"
        @open-folder="emit('open-folder')"
        @save-as="emit('save-as')"
        @new="emit('new-deck')"
        @open="emit('open-deck', $event)"
      />
    </div>

    <div class="center">
      <label class="lbl">Layout</label>
      <select class="sel" :value="slide?.layout" @change="emit('change-layout', ($event.target as HTMLSelectElement).value as LayoutId)">
        <option v-for="id in LAYOUT_IDS" :key="id" :value="id">{{ LAYOUT_LABELS[id] }}</option>
      </select>

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
        <button class="icon-btn" title="Insert image" @click="pickImage('insert')">
          <svg viewBox="0 0 24 24" width="15" height="15"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="8.5" cy="10" r="1.5" fill="currentColor" /><path d="M5 17l5-5 4 4 2-2 3 3" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        </button>
        <input ref="imgInput" type="file" accept="image/*" style="display: none" @change="onImgPick" />
        <div class="grp">
          <button ref="insertBtn" class="ins" title="Insert…" @click="toggleInsert">＋ Insert ▾</button>
          <Teleport to="body">
            <div
              v-if="insertOpen"
              class="menu"
              :style="{ top: menuPos.top + 'px', left: menuPos.left + 'px' }"
              @pointerleave="insertOpen = false"
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
          <label class="swatch" title="Fill">
            <input type="color" :value="colorOr(box.fill, '#7fc7ff')" @input="upd({ fill: ($event.target as HTMLInputElement).value })" />
          </label>
          <button class="mini" title="No fill" @click="upd({ fill: 'transparent' })">∅</button>
          <label class="swatch stroke" title="Stroke">
            <input type="color" :value="colorOr(box.stroke, '#7fc7ff')" @input="upd({ stroke: ($event.target as HTMLInputElement).value, strokeWidth: box.strokeWidth || 2 })" />
          </label>
          <button class="mini" title="No stroke" @click="upd({ stroke: 'transparent' })">∅</button>
          <input class="num" type="number" min="0" max="40" title="Stroke width" :value="box.strokeWidth ?? 0" @input="upd({ strokeWidth: +($event.target as HTMLInputElement).value })" />
          <input class="num" type="number" min="0" max="200" title="Corner radius" :value="box.radius ?? 0" @input="upd({ radius: +($event.target as HTMLInputElement).value })" />
          <button class="mini img" :title="box.src ? 'Replace image' : 'Add image'" @click="pickImage('set')">
            <svg viewBox="0 0 24 24" width="13" height="13"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="8.5" cy="10" r="1.5" fill="currentColor" /><path d="M5 17l5-5 4 4 2-2 3 3" fill="none" stroke="currentColor" stroke-width="2" /></svg>
          </button>
          <button v-if="box.src" class="mini" title="Remove image" @click="upd({ src: '' })">∅</button>
        </div>
        <span class="div" />
        <div class="seg style-seg">
          <select class="sel font" title="Font" :value="box.font ?? 'body'" @change="upd({ font: ($event.target as HTMLSelectElement).value })">
            <option v-for="f in FONTS" :key="f.v" :value="f.v">{{ f.label }}</option>
          </select>
          <input class="num" type="number" min="8" max="400" title="Font size" :value="box.size ?? 28" @input="upd({ size: +($event.target as HTMLInputElement).value })" />
          <input class="num" type="number" min="100" max="900" step="100" title="Font weight" :value="box.weight ?? (box.bold ? 700 : 400)" @input="upd({ weight: +($event.target as HTMLInputElement).value })" />
          <label class="swatch" title="Text color">
            <input type="color" :value="colorOr(box.color, '#e6ecf2')" @input="upd({ color: ($event.target as HTMLInputElement).value })" />
          </label>
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
          <label class="swatch stroke" title="Color">
            <input type="color" :value="colorOr(arrow.stroke, '#e6ecf2')" @input="upd({ stroke: ($event.target as HTMLInputElement).value })" />
          </label>
          <input class="num" type="number" min="1" max="40" title="Thickness" :value="arrow.strokeWidth ?? 3" @input="upd({ strokeWidth: +($event.target as HTMLInputElement).value })" />
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

      <template v-if="slide?.layout === 'image-caption'">
        <span class="div" />
        <label class="lbl">Caption</label>
        <div class="seg">
          <button v-for="p in ['top-left', 'top-right', 'bottom-left', 'bottom-right']" :key="p"
            :class="{ on: (slide.captionPos ?? 'bottom-right') === p }"
            @click="emit('patch', { captionPos: p as any })">{{ p.replace('-', ' ') }}</button>
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
      </template>
    </div>

    <div class="right">
      <div class="seg">
        <button title="Undo (Ctrl+Z)" :disabled="!canUndo" @click="emit('undo')">↶</button>
        <button title="Redo (Ctrl+Shift+Z)" :disabled="!canRedo" @click="emit('redo')">↷</button>
      </div>
      <span class="div" />
      <div class="seg">
        <button title="Add slide (same layout)" @click="emit('add', slide?.layout ?? 'text')">＋ Slide</button>
        <select class="sel add-as" title="Add slide as layout…" @change="onAdd">
          <option value="">as…</option>
          <option v-for="id in LAYOUT_IDS" :key="id" :value="id">{{ LAYOUT_LABELS[id] }}</option>
        </select>
        <button title="Duplicate" @click="emit('duplicate')">Duplicate</button>
        <button title="Delete" class="danger" :disabled="deck.slides.length <= 1" @click="emit('remove')">Delete</button>
        <button title="Group selected" :disabled="selectedCount < 1" @click="emit('group')">
          Group{{ selectedCount > 1 ? ` (${selectedCount})` : '' }}
        </button>
      </div>

      <span class="div" />
      <label class="chk"><input type="checkbox" :checked="autosave" @change="emit('toggle-autosave')" />auto</label>
      <button class="save" :class="saveStatus" @click="emit('save')">
        <span class="dot" :class="saveStatus" />{{ statusText }}
      </button>
      <button class="topbtn" title="Review validation and assets" @click="emit('review')">
        Review{{ reviewCount ? ` ${reviewCount}` : '' }}
      </button>
      <button class="topbtn" :class="{ on: showSource }" title="Toggle Markdown source view" @click="emit('toggle-source')">&lt;/&gt; Source</button>
      <button class="topbtn" title="Export (PDF / HTML)" @click="emit('export')">⤓ Export</button>
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
.save {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 999px;
  padding: 5px 12px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.save.unsaved { background: #2563eb; border-color: #2563eb; }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.dot.saved { background: #4ade80; }
.dot.unsaved { background: #fff; }
.dot.saving { background: #facc15; }
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
.ins {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(230, 236, 242, 0.85);
  border-radius: 6px;
  padding: 5px 8px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.ins:hover { background: rgba(255, 255, 255, 0.1); }
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
.fmt b, .fmt i, .fmt u, .fmt s { font-size: 13px; font-style: normal; }
.fmt i { font-style: italic; }
.num {
  width: 42px;
  background: #1e222b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 6px;
  padding: 4px 5px;
  font-family: inherit;
  font-size: 11px;
}
.sel.font { padding: 4px 6px; }
.swatch {
  display: inline-flex;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  overflow: hidden;
  cursor: pointer;
  padding: 0;
}
.swatch input[type='color'] {
  width: 150%;
  height: 150%;
  margin: -25%;
  border: none;
  background: none;
  cursor: pointer;
}
.mini {
  width: 20px;
  height: 26px;
  padding: 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(230, 236, 242, 0.7);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}
.mini:hover { background: rgba(255, 255, 255, 0.1); }
</style>
