<script setup lang="ts">
// Post-import review: a thumbnail grid of the freshly parsed deck where each
// slide shows its detected layout and can be switched to a different one before
// anything is saved. The classifier falls back to `freeform` for slides it can't
// confidently name, so those are flagged — they're the most likely to need a fix.
import { ref, computed } from 'vue'
import type { Deck, Slide, LayoutId } from '../core/types'
import { LAYOUT_IDS } from '../core/types'
import { convertLayout } from '../core/convert'
import SlideThumb from './SlideThumb.vue'

const props = defineProps<{ deck: Deck; name: string }>()
const emit = defineEmits<{ commit: [deck: Deck]; cancel: [] }>()

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

// Work on a deep copy so layout edits don't touch the pending deck until commit.
const slides = ref<Slide[]>(JSON.parse(JSON.stringify(props.deck.slides)))

const freeformCount = computed(() => slides.value.filter((s) => s.layout === 'freeform').length)

function setLayout(i: number, layout: LayoutId) {
  if (slides.value[i].layout === layout) return
  slides.value[i] = convertLayout(slides.value[i], layout)
}

function commit() {
  emit('commit', { config: props.deck.config, slides: slides.value })
}
</script>

<template>
  <div class="review-root">
    <div class="review-bar">
      <div class="review-info">
        <span class="title">Review import — {{ name }}</span>
        <span class="count">
          {{ slides.length }} slides<template v-if="freeformCount">
            · <span class="warn">{{ freeformCount }} freeform</span> (check these)</template>
        </span>
      </div>
      <div class="actions">
        <button class="cancel" @click="emit('cancel')">Cancel</button>
        <button class="use" @click="commit">Use this deck →</button>
      </div>
    </div>

    <p class="hint">
      Each slide shows the layout the importer detected. If one looks wrong, pick a
      different layout from its menu — the content is remapped, nothing is lost.
    </p>

    <div class="grid">
      <div v-for="(s, i) in slides" :key="i" class="cell">
        <div class="thumb-wrap" :class="{ flagged: s.layout === 'freeform' }">
          <SlideThumb :slide="s" :config="deck.config" :index="i" :total="slides.length" :width="240" />
          <span class="num">{{ i + 1 }}</span>
        </div>
        <select
          class="layout-sel"
          :class="{ flagged: s.layout === 'freeform' }"
          :value="s.layout"
          @change="setLayout(i, ($event.target as HTMLSelectElement).value as LayoutId)"
        >
          <option v-for="id in LAYOUT_IDS" :key="id" :value="id">{{ LAYOUT_LABELS[id] }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-root {
  position: fixed;
  inset: 0;
  z-index: 95;
  background: #050506;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  color: #e6ecf2;
}
.review-bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(16, 18, 22, 0.96);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.review-info { display: flex; flex-direction: column; gap: 2px; }
.title { font-size: 14px; }
.count { font-size: 11px; color: rgba(230, 236, 242, 0.55); }
.count .warn { color: #facc15; }
.actions { display: flex; gap: 10px; }
.actions button {
  border-radius: 8px;
  padding: 7px 16px;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.cancel {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
}
.cancel:hover { background: rgba(255, 255, 255, 0.12); }
.use {
  background: rgba(127, 199, 255, 0.16);
  border: 1px solid rgba(127, 199, 255, 0.5);
  color: #cfe8ff;
  font-weight: 500;
}
.use:hover { background: rgba(127, 199, 255, 0.28); }
.hint {
  margin: 0;
  padding: 12px 20px 0;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.5);
  max-width: 760px;
  line-height: 1.5;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 20px;
  padding: 20px;
}
.cell { display: flex; flex-direction: column; gap: 8px; }
.thumb-wrap {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 2px solid transparent;
}
.thumb-wrap.flagged { border-color: rgba(250, 204, 21, 0.55); }
.num {
  position: absolute;
  left: 6px;
  top: 4px;
  z-index: 2;
  font-size: 11px;
  color: rgba(230, 236, 242, 0.7);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.layout-sel {
  background: #1e222b;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e6ecf2;
  border-radius: 6px;
  padding: 5px 8px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.layout-sel.flagged {
  border-color: rgba(250, 204, 21, 0.55);
  color: #facc15;
}
</style>
