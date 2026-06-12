<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Slide, DeckConfig, GalleryItem, Focus, SlideElement } from '../core/types'
import { inlineMd, parseContent, rowsToContent } from '../render/inline'
import { parseVideo, autoplaySrc } from '../render/video'
import FramedImage from './FramedImage.vue'
import EditableText from './EditableText.vue'
import EditableTextList, { type EditableTextListRow } from './EditableTextList.vue'
import MermaidDiagram from './MermaidDiagram.vue'
import CanvasElements from './CanvasElements.vue'
import type { CanvasTool } from '../core/types'
import '../styles/slide.css'

const props = defineProps<{
  slide: Slide
  config: DeckConfig
  index: number
  total: number
  editable?: boolean
  bulletFormatCommand?: number
  tool?: CanvasTool
  selectedEl?: number[]
  pendingImage?: string
}>()

const emit = defineEmits<{
  patch: [p: Partial<Slide>]
  'config-patch': [p: Partial<DeckConfig>]
  upload: [e: { field: 'image' | 'poster' | 'portraits' | 'gallery'; file: File; index?: number }]
  'update:elements': [els: SlideElement[]]
  'update:selectedEl': [sel: number[]]
  'create-element': [el: SlideElement]
  'tool-reset': []
  'element-image': [index: number, file: File]
  'drop-image': [file: File, target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number }]
  ctxmenu: [p: { x: number; y: number; sx: number; sy: number; index: number; kind?: 'text' | 'link'; url?: string }]
}>()

const glow = computed(() => props.config.theme?.glow !== false)

type TextRow = EditableTextListRow

function isGalleryItem(i: unknown): i is GalleryItem {
  return !!i && typeof i === 'object' && typeof (i as GalleryItem).image === 'string'
}

const textItems = computed<TextRow[]>(() => parseContent(props.slide.content))
const galleryItems = computed<GalleryItem[]>(() =>
  (props.slide.items ?? []).flatMap((i) => {
    if (typeof i === 'string') return [{ image: i }]
    if (isGalleryItem(i)) return [i]
    return []
  }),
)
const galleryCols = computed(() => {
  const c = props.slide.columns
  if (typeof c === 'number') return c
  return Math.min(galleryItems.value.length || 1, 3)
})

function patch(p: Partial<Slide>) {
  emit('patch', p)
}
function patchConfig(p: Partial<DeckConfig>) {
  emit('config-patch', p)
}

// text content ops — the editable list round-trips through the Markdown `content` field
function setRows(rows: TextRow[]) {
  patch({ content: rowsToContent(rows) })
}
// gallery ops
function setGalleryLabel(i: number, label: string) {
  const items = galleryItems.value.map((g, j) => (j === i ? { ...g, label } : g))
  patch({ items })
}
function addGalleryItem() {
  patch({ items: [...galleryItems.value, { image: '' }] })
}
function removeGalleryItem(i: number) {
  patch({ items: galleryItems.value.filter((_, j) => j !== i) })
}
function setFocus(f: Focus) {
  patch({ focus: f })
}

// video-embed
const pv = computed(() => parseVideo(props.slide.video))
const posterSrc = computed(() => props.slide.poster || props.slide.image || pv.value?.thumb || '')
const playing = ref(false)
const playSrc = computed(() => (pv.value ? autoplaySrc(pv.value) : ''))
function playVideo() {
  if (pv.value) playing.value = true
}
function stopVideo() {
  playing.value = false
}
// reset playback when the slide changes
watch(
  () => props.index,
  () => (playing.value = false),
)
</script>

<template>
  <div class="dek-slide" :class="['l-' + slide.layout, { glow }]">
    <EditableText
      v-if="editable && slide.layout !== 'cover'"
      class="dek-header"
      :model-value="config.header"
      placeholder="Running header"
      @update:model-value="patchConfig({ header: $event })"
    />
    <div v-else-if="config.header && slide.layout !== 'cover'" class="dek-header">{{ config.header }}</div>
    <EditableText
      v-if="editable && slide.layout !== 'cover'"
      class="dek-footer"
      :model-value="config.footer"
      placeholder="Running footer"
      @update:model-value="patchConfig({ footer: $event })"
    />
    <div v-else-if="config.footer && slide.layout !== 'cover'" class="dek-footer">{{ config.footer }}</div>
    <div v-if="config.paginate" class="dek-pageno">{{ index + 1 }} / {{ total }}</div>

    <!-- cover -->
    <div v-if="slide.layout === 'cover'" class="dek-pad l-cover">
      <EditableText v-if="editable" class="mark" :model-value="slide.title" placeholder="Title" @update:model-value="patch({ title: $event })" />
      <div v-else class="mark">{{ slide.title }}</div>
      <EditableText v-if="editable" class="sub" :model-value="slide.subtitle" placeholder="Subtitle" @update:model-value="patch({ subtitle: $event })" />
      <div v-else-if="slide.subtitle" class="sub">{{ slide.subtitle }}</div>
      <EditableText v-if="editable" class="byline" :model-value="slide.byline" placeholder="Byline" @update:model-value="patch({ byline: $event })" />
      <div v-else-if="slide.byline" class="byline">{{ slide.byline }}</div>
    </div>

    <!-- section -->
    <div v-else-if="slide.layout === 'section'" class="dek-pad l-section">
      <EditableText v-if="editable" tag="h1" :model-value="slide.title" placeholder="Section" @update:model-value="patch({ title: $event })" />
      <h1 v-else>{{ slide.title }}</h1>
    </div>

    <!-- statement -->
    <div v-else-if="slide.layout === 'statement'" class="dek-pad l-statement">
      <EditableText v-if="editable" class="text" multiline :model-value="slide.text" placeholder="A bold statement…" @update:model-value="patch({ text: $event })" />
      <div v-else class="text">{{ slide.text }}</div>
      <EditableText v-if="editable" class="cite" :model-value="slide.cite" placeholder="— source (optional)" @update:model-value="patch({ cite: $event })" />
      <div v-else-if="slide.cite" class="cite">— {{ slide.cite }}</div>
    </div>

    <!-- speaker -->
    <div v-else-if="slide.layout === 'speaker'" class="dek-pad l-speaker">
      <div class="portraits">
        <div v-for="(p, i) in slide.portraits ?? []" :key="i" class="frame">
          <FramedImage :src="p" :editable="editable" @file="emit('upload', { field: 'portraits', file: $event, index: i })" />
        </div>
        <div v-if="editable && (slide.portraits ?? []).length < 3" class="frame add-frame" @click="patch({ portraits: [...(slide.portraits ?? []), ''] })">+</div>
      </div>
      <EditableText v-if="editable" tag="h1" :model-value="slide.name" placeholder="Name" @update:model-value="patch({ name: $event })" />
      <h1 v-else>{{ slide.name }}</h1>
      <EditableText v-if="editable" class="role" :model-value="slide.role" placeholder="Role" @update:model-value="patch({ role: $event })" />
      <div v-else-if="slide.role" class="role">{{ slide.role }}</div>
    </div>

    <!-- text -->
    <div v-else-if="slide.layout === 'text'" class="dek-pad l-text">
      <EditableText v-if="editable" tag="h1" :model-value="slide.title" placeholder="Heading" @update:model-value="patch({ title: $event })" />
      <h1 v-else>{{ slide.title }}</h1>
      <EditableTextList v-if="editable" :rows="textItems" :format-command="bulletFormatCommand" @update:rows="setRows" />
      <ul v-else class="dek-list">
        <li v-for="(it, i) in textItems" :key="i" :class="{ plain: !it.bullet }" v-html="inlineMd(it.text)" />
      </ul>
    </div>

    <!-- text-image -->
    <div v-else-if="slide.layout === 'text-image'" class="dek-pad l-text-image" :class="['side-' + (slide.side ?? 'right'), 'ratio-' + (slide.imageRatio ?? '16:9').replace(':', 'x')]">
      <EditableText v-if="editable" tag="h1" :model-value="slide.title" placeholder="Heading" @update:model-value="patch({ title: $event })" />
      <h1 v-else>{{ slide.title }}</h1>
      <div class="cols">
        <div class="text-col">
          <EditableTextList v-if="editable" :rows="textItems" :format-command="bulletFormatCommand" @update:rows="setRows" />
          <ul v-else class="dek-list">
            <li v-for="(it, i) in textItems" :key="i" :class="{ plain: !it.bullet }" v-html="inlineMd(it.text)" />
          </ul>
        </div>
        <div class="img-col">
          <div class="frame-img">
            <FramedImage :src="slide.image" :focus="slide.focus" :editable="editable" pannable @update:focus="setFocus" @file="emit('upload', { field: 'image', file: $event })" />
          </div>
        </div>
      </div>
    </div>

    <!-- image-full -->
    <div v-else-if="slide.layout === 'image-full'" class="dek-pad l-image-full">
      <div class="bg">
        <FramedImage :src="slide.image" :focus="slide.focus" :editable="editable" pannable @update:focus="setFocus" @file="emit('upload', { field: 'image', file: $event })" />
      </div>
      <div v-if="slide.title || slide.caption || editable" class="overlay">
        <EditableText v-if="editable" tag="h1" :model-value="slide.title" placeholder="Overlay title (optional)" @update:model-value="patch({ title: $event })" />
        <h1 v-else-if="slide.title">{{ slide.title }}</h1>
        <EditableText v-if="editable" class="cap" :model-value="slide.caption" placeholder="Caption (optional)" @update:model-value="patch({ caption: $event })" />
        <div v-else-if="slide.caption" class="cap">{{ slide.caption }}</div>
      </div>
    </div>

    <!-- image-caption -->
    <div v-else-if="slide.layout === 'image-caption'" class="dek-pad l-image-caption">
      <div class="frame">
        <FramedImage :src="slide.image" :focus="slide.focus" fit="contain" :editable="editable" pannable @update:focus="setFocus" @file="emit('upload', { field: 'image', file: $event })" />
      </div>
      <EditableText v-if="editable" class="cap" :class="slide.captionPos ?? 'bottom-right'" :model-value="slide.caption" placeholder="Caption / credit" @update:model-value="patch({ caption: $event })" />
      <div v-else-if="slide.caption" class="cap" :class="slide.captionPos ?? 'bottom-right'">{{ slide.caption }}</div>
    </div>

    <!-- video-embed -->
    <div v-else-if="slide.layout === 'video-embed'" class="dek-pad l-video-embed">
      <div class="vid-frame">
        <!-- player (after clicking play) -->
        <template v-if="playing && pv">
          <iframe
            v-if="pv.provider !== 'file'"
            :src="playSrc"
            allow="autoplay; encrypted-media; fullscreen"
            allowfullscreen
          />
          <video v-else :src="pv.embedUrl" controls autoplay />
          <!-- in the editor, let the user stop and return to the poster/fields -->
          <button v-if="editable" class="vid-stop" title="Stop / back to editing" @click="stopVideo">✕</button>
        </template>

        <!-- poster + play button -->
        <template v-else>
          <FramedImage
            :src="posterSrc"
            fit="contain"
            :editable="editable"
            @file="emit('upload', { field: 'poster', file: $event })"
          />
          <button class="play" :disabled="!pv" :title="pv ? 'Play' : 'Add a video URL first'" @click="playVideo">
            <span class="tri" />
          </button>
          <div v-if="editable" class="vid-url">
            <EditableText :model-value="slide.video" placeholder="https://youtube.com/watch?v=…" @update:model-value="patch({ video: $event })" />
          </div>
        </template>
      </div>
      <EditableText v-if="editable" class="vid-cap" :model-value="slide.caption" placeholder="Caption (optional)" @update:model-value="patch({ caption: $event })" />
      <div v-else-if="slide.caption" class="vid-cap">{{ slide.caption }}</div>
    </div>

    <!-- gallery -->
    <div v-else-if="slide.layout === 'gallery'" class="dek-pad l-gallery">
      <EditableText v-if="editable" tag="h1" :model-value="slide.title" placeholder="Title (optional)" @update:model-value="patch({ title: $event })" />
      <h1 v-else-if="slide.title">{{ slide.title }}</h1>
      <div class="gallery-wrap">
        <div class="gallery-grid" :style="{ gridTemplateColumns: `repeat(${galleryCols}, 1fr)` }">
          <div v-for="(it, i) in galleryItems" :key="i" class="gallery-cell">
            <div class="frame">
              <FramedImage :src="it.image" :editable="editable" @file="emit('upload', { field: 'gallery', file: $event, index: i })" />
              <button v-if="editable" class="cell-x" title="Remove" @click="removeGalleryItem(i)">✕</button>
            </div>
            <EditableText v-if="editable" class="label" :model-value="it.label" placeholder="label" @update:model-value="setGalleryLabel(i, $event)" />
            <div v-else-if="it.label" class="label">{{ it.label }}</div>
          </div>
        </div>
        <button v-if="editable" class="gallery-add" title="Add image" @click="addGalleryItem">＋</button>
      </div>
    </div>

    <!-- diagram (Mermaid) -->
    <div v-else-if="slide.layout === 'diagram'" class="dek-pad l-diagram">
      <EditableText v-if="editable" tag="h1" :model-value="slide.title" placeholder="Title (optional)" @update:model-value="patch({ title: $event })" />
      <h1 v-else-if="slide.title">{{ slide.title }}</h1>
      <div class="diagram-stage">
        <MermaidDiagram :code="slide.code" />
      </div>
      <div v-if="editable" class="diagram-code">
        <div class="code-label">Mermaid · edit to update the chart live</div>
        <EditableText
          tag="pre"
          multiline
          class="code-area"
          :model-value="slide.code"
          placeholder="flowchart LR
  A[Shoot] --> B[Edit] --> C[Grade]"
          @update:model-value="patch({ code: $event })"
        />
      </div>
    </div>

    <!-- freeform — a bare canvas; content lives in the elements overlay below -->
    <div v-else class="dek-pad l-freeform">
      <div v-if="slide.body" v-html="slide.body" />
    </div>

    <!-- free-positioned elements overlay (any layout may carry them) -->
    <CanvasElements
      v-if="editable || (slide.elements && slide.elements.length)"
      :elements="slide.elements ?? []"
      :editable="editable"
      :tool="tool"
      :selected="selectedEl"
      :pending-image="pendingImage"
      @update:elements="emit('update:elements', $event)"
      @update:selected="emit('update:selectedEl', $event)"
      @create="emit('create-element', $event)"
      @tool-reset="emit('tool-reset')"
      @element-image="(idx, f) => emit('element-image', idx, f)"
      @drop-image="(f, t) => emit('drop-image', f, t)"
      @ctxmenu="emit('ctxmenu', $event)"
    />
  </div>
</template>
