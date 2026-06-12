<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Deck, LayoutId, Slide, SlideElement, BoxElement, ArrowElement, CanvasTool, ElementPatch } from '../core/types'
import { LAYOUT_IDS } from '../core/types'
import { TYPE_SCALE } from '../core/defaults'
import { DEFAULT_THEME } from '../tokens'
import DeckMenu from './DeckMenu.vue'
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
  'open-file': []
  'open-folder': []
  'save-as': []
  'new-deck': []
  'open-deck': [file: string]
  import: [file: File]
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

// The theme's resolved default text color — what a box with no explicit `color`
// actually renders as (CanvasElements falls back to var(--dek-text)). Passing it
// as the picker's display value keeps the swatch honest instead of blank.
const themeDefaultText = computed(() => props.deck.config.theme?.text ?? DEFAULT_THEME.color.text)

// Font size steps through the token type scale rather than ±1, so the buttons
// move between sizes that actually read as distinct. The field stays free-type.
function stepFontSize(dir: 1 | -1) {
  const cur = box.value?.size ?? 28
  const next =
    dir > 0
      ? (TYPE_SCALE.find((s) => s > cur) ?? cur)
      : ([...TYPE_SCALE].reverse().find((s) => s < cur) ?? cur)
  upd({ size: next })
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
        @open-file="emit('open-file')"
        @open-folder="emit('open-folder')"
        @save-as="emit('save-as')"
        @new="emit('new-deck')"
        @open="emit('open-deck', $event)"
        @export="emit('export')"
        @import="emit('import', $event)"
      />
      <span class="div" />
      <label class="chk-auto">
        <input type="checkbox" :checked="autosave" @change="emit('toggle-autosave')" />
        autosave
        <span class="save-led" :class="saveStatus" />
      </label>
      <div class="seg">
        <button title="Undo (Ctrl+Z)" :disabled="!canUndo" @click="emit('undo')">↶</button>
        <button title="Redo (Ctrl+Shift+Z)" :disabled="!canRedo" @click="emit('redo')">↷</button>
      </div>
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
        <button class="icon-btn" title="Insert image" @click="pickImage()">
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
.chk-auto {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.65);
  cursor: pointer;
  user-select: none;
}
.chk-auto input[type='checkbox'] {
  accent-color: #7fc7ff;
  cursor: pointer;
}
.save-led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.2s;
}
.save-led.saved { background: #4ade80; }
.save-led.saving { background: #facc15; }
.save-led.unsaved { background: #f87171; }
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
