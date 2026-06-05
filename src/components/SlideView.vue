<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Slide, DeckConfig, GalleryItem, Focus } from '../core/types'
import { inlineMd } from '../render/inline'
import { parseVideo, autoplaySrc } from '../render/video'
import FramedImage from './FramedImage.vue'
import EditableText from './EditableText.vue'
import '../styles/slide.css'

const props = defineProps<{
  slide: Slide
  config: DeckConfig
  index: number
  total: number
  editable?: boolean
}>()

const emit = defineEmits<{
  patch: [p: Partial<Slide>]
  upload: [e: { field: 'image' | 'poster' | 'portraits' | 'gallery'; file: File; index?: number }]
}>()

const glow = computed(() => props.config.theme?.glow !== false)

const textItems = computed<string[]>(() =>
  (props.slide.items ?? []).filter((i): i is string => typeof i === 'string'),
)
const galleryItems = computed<GalleryItem[]>(() =>
  (props.slide.items ?? []).map((i) => (typeof i === 'string' ? { image: i } : i)),
)
const galleryCols = computed(() => {
  const c = props.slide.columns
  if (typeof c === 'number') return c
  return Math.min(galleryItems.value.length || 1, 3)
})

function patch(p: Partial<Slide>) {
  emit('patch', p)
}

// bullet list ops
function setItem(i: number, v: string) {
  const items = [...textItems.value]
  items[i] = v
  patch({ items })
}
function addItem(i: number) {
  const items = [...textItems.value]
  items.splice(i + 1, 0, '')
  patch({ items })
}
function removeItem(i: number) {
  const items = [...textItems.value]
  if (items.length <= 1) return
  items.splice(i, 1)
  patch({ items })
}
// gallery ops
function setGalleryLabel(i: number, label: string) {
  const items = galleryItems.value.map((g, j) => (j === i ? { ...g, label } : g))
  patch({ items })
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
  if (props.editable) return // editing: don't autoplay
  if (pv.value) playing.value = true
}
// reset playback when the slide changes
watch(
  () => props.index,
  () => (playing.value = false),
)
</script>

<template>
  <div class="dek-slide" :class="['l-' + slide.layout, { glow }]">
    <div v-if="config.header && slide.layout !== 'cover'" class="dek-header">{{ config.header }}</div>
    <div v-if="config.footer && slide.layout !== 'cover'" class="dek-footer">{{ config.footer }}</div>
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

    <!-- bullets -->
    <div v-else-if="slide.layout === 'bullets'" class="dek-pad l-bullets">
      <EditableText v-if="editable" tag="h1" :model-value="slide.title" placeholder="HEADING" @update:model-value="patch({ title: $event })" />
      <h1 v-else>{{ slide.title }}</h1>
      <ul class="dek-list">
        <template v-if="editable">
          <li v-for="(it, i) in textItems" :key="i">
            <EditableText :model-value="it" placeholder="Point…" @update:model-value="setItem(i, $event)" @enter="addItem(i)" @empty-backspace="removeItem(i)" />
          </li>
        </template>
        <template v-else>
          <li v-for="(it, i) in textItems" :key="i" v-html="inlineMd(it)" />
        </template>
      </ul>
    </div>

    <!-- bullets-image -->
    <div v-else-if="slide.layout === 'bullets-image'" class="dek-pad l-bullets-image" :class="'side-' + (slide.side ?? 'right')">
      <EditableText v-if="editable" tag="h1" :model-value="slide.title" placeholder="HEADING" @update:model-value="patch({ title: $event })" />
      <h1 v-else>{{ slide.title }}</h1>
      <div class="cols">
        <div class="text-col">
          <ul class="dek-list">
            <template v-if="editable">
              <li v-for="(it, i) in textItems" :key="i">
                <EditableText :model-value="it" placeholder="Point…" @update:model-value="setItem(i, $event)" @enter="addItem(i)" @empty-backspace="removeItem(i)" />
              </li>
            </template>
            <template v-else>
              <li v-for="(it, i) in textItems" :key="i" v-html="inlineMd(it)" />
            </template>
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
        <!-- player (present mode, after click) -->
        <iframe
          v-if="playing && pv && pv.provider !== 'file'"
          :src="playSrc"
          allow="autoplay; encrypted-media; fullscreen"
          allowfullscreen
        />
        <video v-else-if="playing && pv && pv.provider === 'file'" :src="pv.embedUrl" controls autoplay />

        <!-- poster + play button -->
        <template v-else>
          <FramedImage
            :src="posterSrc"
            fit="contain"
            :editable="editable"
            @file="emit('upload', { field: 'poster', file: $event })"
          />
          <button class="play" :class="{ ghost: editable }" @click="playVideo">
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
      <div class="gallery-grid" :style="{ gridTemplateColumns: `repeat(${galleryCols}, 1fr)` }">
        <div v-for="(it, i) in galleryItems" :key="i" class="gallery-cell">
          <div class="frame">
            <FramedImage :src="it.image" :editable="editable" @file="emit('upload', { field: 'gallery', file: $event, index: i })" />
          </div>
          <EditableText v-if="editable" class="label" :model-value="it.label" placeholder="label" @update:model-value="setGalleryLabel(i, $event)" />
          <div v-else-if="it.label" class="label">{{ it.label }}</div>
        </div>
      </div>
    </div>

    <!-- freeform -->
    <div v-else class="dek-pad l-freeform">
      <h1 v-if="slide.title">{{ slide.title }}</h1>
      <div v-html="slide.body ?? ''" />
    </div>
  </div>
</template>
