<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Slide, DeckConfig, GalleryItem, Focus, SlideElement } from '../core/types'
import { parseContent, rowsToContent, type ContentRow } from '../render/inline'
import type { SlideSplitTarget } from '../core/split'
import { parseVideo, autoplaySrc } from '../render/video'
import FramedImage from './FramedImage.vue'
import EditableText from './EditableText.vue'
import FittedText from './FittedText.vue'
import FittedTextList from './FittedTextList.vue'
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
  split: [target: SlideSplitTarget]
  'drop-image': [file: File, target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number }]
  ctxmenu: [p: { x: number; y: number; sx: number; sy: number; index: number; kind?: 'text' | 'link'; url?: string }]
}>()

const glow = computed(() => props.config.theme?.glow !== false)

type TextRow = ContentRow

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
const listBaseSize = computed(() =>
  props.slide.layout === 'text-image' && (props.slide.imageRatio ?? '16:9') === '16:9' ? 21 : 26,
)

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
      <FittedText class="fit-cover-title" content-class="mark" :model-value="slide.title" :editable="editable" placeholder="Title" :base-size="220" :min-size="56" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
      <FittedText v-if="editable || slide.subtitle" class="fit-cover-subtitle" content-class="sub" :model-value="slide.subtitle" :editable="editable" placeholder="Subtitle" :base-size="48" :min-size="20" splittable @update:model-value="patch({ subtitle: $event })" @split="emit('split', { kind: 'field', field: 'subtitle' })" />
      <FittedText v-if="editable || slide.byline" class="fit-cover-byline" content-class="byline" :model-value="slide.byline" :editable="editable" placeholder="Byline" :base-size="20" :min-size="11" splittable @update:model-value="patch({ byline: $event })" @split="emit('split', { kind: 'field', field: 'byline' })" />
    </div>

    <!-- section -->
    <div v-else-if="slide.layout === 'section'" class="dek-pad l-section">
      <FittedText class="fit-section-title" content-class="section-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Section" :base-size="110" :min-size="34" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
    </div>

    <!-- statement -->
    <div v-else-if="slide.layout === 'statement'" class="dek-pad l-statement">
      <FittedText class="fit-statement-text" content-class="text" :model-value="slide.text" :editable="editable" multiline placeholder="A bold statement…" :base-size="56" :min-size="24" splittable @update:model-value="patch({ text: $event })" @split="emit('split', { kind: 'field', field: 'text' })" />
      <FittedText v-if="editable || slide.cite" class="fit-statement-cite" content-class="cite" :model-value="slide.cite" :editable="editable" prefix="— " placeholder="— source (optional)" :base-size="22" :min-size="11" splittable @update:model-value="patch({ cite: $event })" @split="emit('split', { kind: 'field', field: 'cite' })" />
    </div>

    <!-- speaker -->
    <div v-else-if="slide.layout === 'speaker'" class="dek-pad l-speaker">
      <div class="portraits">
        <div v-for="(p, i) in slide.portraits ?? []" :key="i" class="frame">
          <FramedImage :src="p" :editable="editable" @file="emit('upload', { field: 'portraits', file: $event, index: i })" />
        </div>
        <div v-if="editable && (slide.portraits ?? []).length < 3" class="frame add-frame" @click="patch({ portraits: [...(slide.portraits ?? []), ''] })">+</div>
      </div>
      <FittedText class="fit-speaker-name" content-class="speaker-name" tag="h1" :model-value="slide.name" :editable="editable" placeholder="Name" :base-size="64" :min-size="26" splittable @update:model-value="patch({ name: $event })" @split="emit('split', { kind: 'field', field: 'name' })" />
      <FittedText v-if="editable || slide.role" class="fit-speaker-role" content-class="role" :model-value="slide.role" :editable="editable" placeholder="Role" :base-size="24" :min-size="12" splittable @update:model-value="patch({ role: $event })" @split="emit('split', { kind: 'field', field: 'role' })" />
    </div>

    <!-- text -->
    <div v-else-if="slide.layout === 'text'" class="dek-pad l-text">
      <FittedText class="fit-layout-title" content-class="layout-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Heading" :base-size="64" :min-size="26" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
      <FittedTextList
        :rows="textItems"
        :editable="editable"
        :format-command="bulletFormatCommand"
        :base-size="listBaseSize"
        @update:rows="setRows"
        @split="emit('split', { kind: 'field', field: 'content' })"
      />
    </div>

    <!-- text-image -->
    <div v-else-if="slide.layout === 'text-image'" class="dek-pad l-text-image" :class="['side-' + (slide.side ?? 'right'), 'ratio-' + (slide.imageRatio ?? '16:9').replace(':', 'x')]">
      <FittedText class="fit-layout-title" content-class="layout-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Heading" :base-size="64" :min-size="26" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
      <div class="cols">
        <div class="text-col">
          <FittedTextList
            :rows="textItems"
            :editable="editable"
            :format-command="bulletFormatCommand"
            :base-size="listBaseSize"
            @update:rows="setRows"
            @split="emit('split', { kind: 'field', field: 'content' })"
          />
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
        <FittedText v-if="editable || slide.title" class="fit-image-title" content-class="image-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Overlay title (optional)" :base-size="64" :min-size="26" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
        <FittedText v-if="editable || slide.caption" class="fit-image-caption" content-class="cap" :model-value="slide.caption" :editable="editable" placeholder="Caption (optional)" :base-size="22" :min-size="11" splittable @update:model-value="patch({ caption: $event })" @split="emit('split', { kind: 'field', field: 'caption' })" />
      </div>
    </div>

    <!-- image-caption -->
    <div v-else-if="slide.layout === 'image-caption'" class="dek-pad l-image-caption">
      <div class="frame">
        <FramedImage :src="slide.image" :focus="slide.focus" fit="contain" :editable="editable" pannable @update:focus="setFocus" @file="emit('upload', { field: 'image', file: $event })" />
      </div>
      <FittedText v-if="editable || slide.caption" class="fit-photo-caption cap" :class="slide.captionPos ?? 'bottom-right'" content-class="photo-caption" :model-value="slide.caption" :editable="editable" placeholder="Caption / credit" :base-size="18" :min-size="10" splittable @update:model-value="patch({ caption: $event })" @split="emit('split', { kind: 'field', field: 'caption' })" />
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
      <FittedText v-if="editable || slide.caption" class="fit-video-caption" content-class="vid-cap" :model-value="slide.caption" :editable="editable" placeholder="Caption (optional)" :base-size="20" :min-size="11" splittable @update:model-value="patch({ caption: $event })" @split="emit('split', { kind: 'field', field: 'caption' })" />
    </div>

    <!-- gallery -->
    <div v-else-if="slide.layout === 'gallery'" class="dek-pad l-gallery">
      <FittedText v-if="editable || slide.title" class="fit-gallery-title" content-class="gallery-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Title (optional)" :base-size="64" :min-size="26" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
      <div class="gallery-wrap">
        <div class="gallery-grid" :style="{ gridTemplateColumns: `repeat(${galleryCols}, 1fr)` }">
          <div v-for="(it, i) in galleryItems" :key="i" class="gallery-cell">
            <div class="frame">
              <FramedImage :src="it.image" :editable="editable" @file="emit('upload', { field: 'gallery', file: $event, index: i })" />
              <button v-if="editable" class="cell-x" title="Remove" @click="removeGalleryItem(i)">✕</button>
            </div>
            <FittedText v-if="editable || it.label" class="fit-gallery-label" content-class="label" :model-value="it.label" :editable="editable" placeholder="label" :base-size="28" :min-size="11" splittable @update:model-value="setGalleryLabel(i, $event)" @split="emit('split', { kind: 'gallery-label', index: i })" />
          </div>
        </div>
        <button v-if="editable" class="gallery-add" title="Add image" @click="addGalleryItem">＋</button>
      </div>
    </div>

    <!-- diagram (Mermaid) -->
    <div v-else-if="slide.layout === 'diagram'" class="dek-pad l-diagram">
      <FittedText v-if="editable || slide.title" class="fit-diagram-title" content-class="diagram-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Title (optional)" :base-size="64" :min-size="26" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
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
      @split-element="emit('split', { kind: 'element', index: $event })"
      @drop-image="(f, t) => emit('drop-image', f, t)"
      @ctxmenu="emit('ctxmenu', $event)"
    />
  </div>
</template>
