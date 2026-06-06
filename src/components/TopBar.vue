<script setup lang="ts">
import { computed } from 'vue'
import type { Deck, LayoutId, Slide } from '../core/types'
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
}>()
const emit = defineEmits<{
  'change-layout': [id: LayoutId]
  patch: [p: Partial<Slide>]
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
  'open-file': []
  'open-folder': []
  'save-as': []
  'new-deck': []
  'open-deck': [file: string]
}>()

function onAdd(ev: Event) {
  const el = ev.target as HTMLSelectElement
  if (el.value) emit('add', el.value as LayoutId)
  el.value = '' // reset to placeholder
}

const slide = computed(() => props.deck.slides[props.index])
const statusText = computed(() =>
  props.saveStatus === 'saving' ? 'saving…' : props.saveStatus === 'unsaved' ? 'unsaved' : 'saved',
)
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
        <option v-for="id in LAYOUT_IDS" :key="id" :value="id">{{ id }}</option>
      </select>

      <!-- contextual controls -->
      <template v-if="slide?.layout === 'bullets-image'">
        <span class="div" />
        <label class="lbl">Image</label>
        <div class="seg">
          <button :class="{ on: (slide.side ?? 'right') === 'left' }" @click="emit('patch', { side: 'left' })">left</button>
          <button :class="{ on: (slide.side ?? 'right') === 'right' }" @click="emit('patch', { side: 'right' })">right</button>
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
        <button title="Add slide (same layout)" @click="emit('add', slide?.layout ?? 'bullets')">＋ Slide</button>
        <select class="sel add-as" title="Add slide as layout…" @change="onAdd">
          <option value="">as…</option>
          <option v-for="id in LAYOUT_IDS" :key="id" :value="id">{{ id }}</option>
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
</style>
