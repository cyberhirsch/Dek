<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Slide, DeckConfig, GalleryItem, Focus, SlideElement } from '../core/types'
import { parseContent, rowsToContent, type ContentRow } from '../render/inline'
import type { SlideSplitTarget } from '../core/split'
import type { IdleText } from './ContextMenu.vue'
import { parseVideo, autoplaySrc } from '../render/video'
import { safeLink } from '../render/qr'
import { effectiveFit, galleryBox, galleryColumns } from '../core/gallery'
import { naturalSize } from '../render/naturalSize'
import FramedImage from './FramedImage.vue'
import EditableText from './EditableText.vue'
import FittedText from './FittedText.vue'
import FittedTextList from './FittedTextList.vue'
import MermaidDiagram from './MermaidDiagram.vue'
import TableGrid from './TableGrid.vue'
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
  /** Present-mode step reveal — number of content rows to show (undefined = all). */
  reveal?: number
}>()

const emit = defineEmits<{
  patch: [p: Partial<Slide>]
  'config-patch': [p: Partial<DeckConfig>]
  /** `el` is set for a cell of a canvas table element (else the layout's own). */
  upload: [e: { field: 'image' | 'poster' | 'portraits' | 'gallery' | 'table'; file: File; index?: number; el?: number }]
  'update:elements': [els: SlideElement[]]
  'update:selectedEl': [sel: number[]]
  'create-element': [el: SlideElement]
  'tool-reset': []
  'element-image': [index: number, file: File]
  split: [target: SlideSplitTarget]
  'drop-image': [file: File, target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number }]
  'drop-link': [url: string, target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number }]
  ctxmenu: [p: { x: number; y: number; sx: number; sy: number; index: number; kind?: 'text' | 'link' | 'image'; url?: string; imageField?: 'image' | 'portraits' | 'gallery' | 'table'; imageIndex?: number; imageEl?: number; idle?: IdleText }]
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
// `auto` picks the count that shows the pictures largest, judged on the
// PRESENTING geometry (title only if set, labels only if any) — the editor
// always shows those boxes, and judging by them would arrange the gallery
// differently while editing than while presenting.
const galleryCols = computed(() =>
  galleryColumns(props.slide.columns, galleryItems.value.length, {
    aspects: galleryItems.value.map((it) => {
      const s = naturalSize(it.image)
      return s ? s.w / s.h : undefined
    }),
    box: galleryBox(!!props.slide.title),
    labelRow: props.slide.labelPos !== 'overlay' && galleryItems.value.some((it) => it.label),
  }),
)
// Explicit rows, sharing the height: without them the rows were implicit `auto`
// tracks that grew to each picture's natural height and ran off the stage.
const galleryRows = computed(() => Math.max(1, Math.ceil(galleryItems.value.length / galleryCols.value)))
/** A label row under every picture when any has a label (or while editing, to
 *  type one) — all or none, so the frames in a row line up, as bake draws it. */
const galleryOverlay = computed(() => props.slide.labelPos === 'overlay')
/** A `contain` picture whose shape is known gets a frame that hugs it: the
 *  aspect goes to CSS, which sizes the frame inside its slot. Undefined means
 *  the frame fills the slot (cover, or the shape hasn't loaded yet). */
function galleryHug(it: GalleryItem): Record<string, string> | undefined {
  if (effectiveFit(it, props.slide.imageFit) !== 'contain') return undefined
  const size = naturalSize(it.image)
  return size ? { '--ar': String(size.w / size.h) } : undefined
}
const galleryLabelRow = computed(
  () => !galleryOverlay.value && (!!props.editable || galleryItems.value.some((it) => it.label)),
)
const listBaseSize = computed(() =>
  props.slide.layout === 'text-image' && (props.slide.imageRatio ?? '16:9') === '16:9' ? 21 : 26,
)

// table

function patch(p: Partial<Slide>) {
  emit('patch', p)
}
// Right-clicking a layout image opens Dek's own image menu (Copy/Paste/Fit/…)
// instead of the browser's native one — the same actions the freeform canvas
// offers, wired to the slide's image field. Only in edit mode, and only when an
// image is present. `target` names the multi-image slots (portraits / gallery);
// omit it for the single `image` field. Table cells route through TableGrid.
function onImageCtx(e: MouseEvent, target?: { field: 'portraits' | 'gallery'; index: number }) {
  if (!props.editable) return
  const src = !target
    ? props.slide.image
    : target.field === 'portraits'
      ? props.slide.portraits?.[target.index]
      : galleryItems.value[target.index]?.image
  if (!src) return
  e.preventDefault()
  emit('ctxmenu', {
    x: e.clientX, y: e.clientY, sx: 0, sy: 0, index: -1,
    kind: 'image', imageField: target?.field ?? 'image', imageIndex: target?.index,
  })
}
function patchConfig(p: Partial<DeckConfig>) {
  emit('config-patch', p)
}
// Right-clicking selected text (or a link) in any semantic-layout text field —
// title, bullets, caption, subtitle, byline, … — opens Dek's own text/link menu
// (Bold/Italic/Add Link…, or Open/Edit/Remove Link) instead of the browser's
// native one. Matches any contenteditable surface (EditableText's `.dek-editable`
// title/caption/etc. AND EditableTextList's `.dek-list.editable-list` bullets),
// so it can't fire for image frames or the freeform canvas, which have no
// contenteditable ancestor and handle their own menus.
const slideRoot = ref<HTMLElement | null>(null)
/** A screen point in 1280×720 stage px — where a text box or shape added from
 *  the menu should land. The stage is CSS-scaled to fit the window. */
function toStagePoint(e: MouseEvent): { x: number; y: number } {
  const r = slideRoot.value?.getBoundingClientRect()
  if (!r || !r.width) return { x: 0, y: 0 }
  return { x: Math.round(((e.clientX - r.left) / r.width) * 1280), y: Math.round(((e.clientY - r.top) / r.height) * 720) }
}
/** Clicking into the layout (its text, its background) ends an element
 *  selection, as clicking empty canvas does on a freeform slide. */
function onLayoutPointerDown(e: PointerEvent) {
  if (!props.editable || !props.selectedEl?.length) return
  if ((e.target as HTMLElement | null)?.closest('.canvas-layer')) return
  emit('update:selectedEl', [])
}

/** Focus an editable text and put the caret at a screen point inside it, or
 *  at its end if the point doesn't land in it. */
function caretAt(host: HTMLElement, x: number, y: number) {
  host.focus()
  const sel = window.getSelection()
  if (!sel) return
  const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  let r = doc.caretRangeFromPoint?.(x, y) ?? null
  if (!r || !host.contains(r.startContainer)) {
    r = document.createRange()
    r.selectNodeContents(host)
    r.collapse(false)
  }
  sel.removeAllRanges()
  sel.addRange(r)
}
/** Focus an editable text with all of it selected — so a formatting command
 *  from the menu applies to the whole heading or list. */
function selectAllIn(host: HTMLElement) {
  host.focus()
  const sel = window.getSelection()
  if (!sel) return
  const r = document.createRange()
  r.selectNodeContents(host)
  sel.removeAllRanges()
  sel.addRange(r)
}

function onTextCtx(e: MouseEvent) {
  if (!props.editable) return
  // Something inside already opened its own menu (an image, a table cell).
  if (e.defaultPrevented) return
  const target = e.target as HTMLElement | null
  // The canvas-elements overlay (freeform boxes, or freeform elements layered
  // on any layout) wires its own contenteditable text boxes and context menu
  // with real element indices — skip those so the bubbled event isn't handled
  // twice, once by it and once (with the wrong index) by this generic handler.
  if (target?.closest('.canvas-layer')) return
  const host = target?.closest('[contenteditable="true"]') as HTMLElement | null
  if (!host) {
    // The layout's empty background (#44): Dek's stage menu — add a text box or
    // shape here, paste, and the slide operations — in place of the browser's.
    e.preventDefault()
    const p = toStagePoint(e)
    emit('ctxmenu', { x: e.clientX, y: e.clientY, sx: p.x, sy: p.y, index: -1 })
    return
  }
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount || !sel.anchorNode || !host.contains(sel.anchorNode)) {
    // Text that isn't being edited: offer to start editing it (caret where
    // the click was), and let formatting apply to the whole text. This used to
    // fall through to the browser's menu, which has nothing to offer here.
    e.preventDefault()
    const x = e.clientX
    const y = e.clientY
    emit('ctxmenu', {
      x, y, sx: 0, sy: 0, index: -1, kind: 'text',
      idle: { edit: () => caretAt(host, x, y), selectAll: () => selectAllIn(host) },
    })
    return
  }
  const anchor = sel.anchorNode
  const anchorEl = (anchor.nodeType === 1 ? (anchor as HTMLElement) : anchor.parentElement) ?? null
  const link = anchorEl?.closest('a')
  if (link) {
    e.preventDefault()
    emit('ctxmenu', { x: e.clientX, y: e.clientY, sx: 0, sy: 0, index: -1, kind: 'link', url: link.getAttribute('href') ?? '' })
  } else if (!sel.isCollapsed) {
    e.preventDefault()
    emit('ctxmenu', { x: e.clientX, y: e.clientY, sx: 0, sy: 0, index: -1, kind: 'text' })
  }
  // else: a bare caret with no link — nothing Dek-specific to offer, so leave
  // the native menu (Cut/Copy/Paste/Select all) alone.
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
function setGalleryFocus(i: number, focus: Focus) {
  patch({ items: galleryItems.value.map((g, j) => (j === i ? { ...g, focus } : g)) })
}


// video-embed
const videoFit = computed(() => props.slide.videoFit ?? 'framed')
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
  <div ref="slideRoot" class="dek-slide" :class="['l-' + slide.layout, { glow }]" @contextmenu="onTextCtx" @pointerdown="onLayoutPointerDown">
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
        <div v-for="(p, i) in slide.portraits ?? []" :key="i" class="frame" @contextmenu="onImageCtx($event, { field: 'portraits', index: i })">
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
        :reveal="reveal"
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
            :reveal="reveal"
            @update:rows="setRows"
            @split="emit('split', { kind: 'field', field: 'content' })"
          />
        </div>
        <div class="img-col">
          <div class="frame-img" @contextmenu="onImageCtx">
            <FramedImage :src="slide.image" :focus="slide.focus" :fit="slide.imageFit ?? 'cover'" :invert="slide.imageInvert" :desaturate="slide.imageDesaturate" :editable="editable" pannable @update:focus="setFocus" @file="emit('upload', { field: 'image', file: $event })" />
            <a v-if="!editable && safeLink(slide.imageLink)" class="img-link" :href="safeLink(slide.imageLink)" target="_blank" rel="noopener noreferrer" />
          </div>
          <FittedText
            v-if="editable || slide.caption"
            class="fit-ti-caption"
            content-class="ti-cap"
            :model-value="slide.caption"
            :editable="editable"
            placeholder="Caption (optional)"
            :base-size="18"
            :min-size="10"
            splittable
            @update:model-value="patch({ caption: $event })"
            @split="emit('split', { kind: 'field', field: 'caption' })"
          />
        </div>
      </div>
    </div>

    <!-- image-full -->
    <div v-else-if="slide.layout === 'image-full'" class="dek-pad l-image-full">
      <div class="bg" @contextmenu="onImageCtx">
        <FramedImage :src="slide.image" :focus="slide.focus" :fit="slide.imageFit ?? 'cover'" :invert="slide.imageInvert" :desaturate="slide.imageDesaturate" :editable="editable" pannable @update:focus="setFocus" @file="emit('upload', { field: 'image', file: $event })" />
        <a v-if="!editable && safeLink(slide.imageLink)" class="img-link" :href="safeLink(slide.imageLink)" target="_blank" rel="noopener noreferrer" />
      </div>
      <div v-if="slide.title || slide.caption || editable" class="overlay">
        <FittedText v-if="editable || slide.title" class="fit-image-title" content-class="image-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Overlay title (optional)" :base-size="64" :min-size="26" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
        <FittedText v-if="editable || slide.caption" class="fit-image-caption" content-class="cap" :model-value="slide.caption" :editable="editable" placeholder="Caption (optional)" :base-size="22" :min-size="11" splittable @update:model-value="patch({ caption: $event })" @split="emit('split', { kind: 'field', field: 'caption' })" />
      </div>
    </div>

    <!-- image-caption -->
    <div v-else-if="slide.layout === 'image-caption'" class="dek-pad l-image-caption">
      <div class="frame" @contextmenu="onImageCtx">
        <FramedImage :src="slide.image" :focus="slide.focus" :fit="slide.imageFit ?? 'contain'" :invert="slide.imageInvert" :desaturate="slide.imageDesaturate" :editable="editable" pannable @update:focus="setFocus" @file="emit('upload', { field: 'image', file: $event })" />
        <a v-if="!editable && safeLink(slide.imageLink)" class="img-link" :href="safeLink(slide.imageLink)" target="_blank" rel="noopener noreferrer" />
      </div>
      <FittedText v-if="editable || slide.caption" class="fit-photo-caption cap" :class="slide.captionPos ?? 'bottom-right'" content-class="photo-caption" :model-value="slide.caption" :editable="editable" placeholder="Caption / credit" :base-size="18" :min-size="10" splittable @update:model-value="patch({ caption: $event })" @split="emit('split', { kind: 'field', field: 'caption' })" />
    </div>

    <!-- video-embed -->
    <div v-else-if="slide.layout === 'video-embed'" class="dek-pad l-video-embed" :class="videoFit">
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
      <!-- Fullscreen bleeds the video to the slide edges, so there is nowhere
           for a caption to sit — it stays on the slide (and in `stash` terms,
           in the field) but isn't rendered until you switch back to Framed. -->
      <FittedText v-if="videoFit === 'framed' && (editable || slide.caption)" class="fit-video-caption" content-class="vid-cap" :model-value="slide.caption" :editable="editable" placeholder="Caption (optional)" :base-size="20" :min-size="11" splittable @update:model-value="patch({ caption: $event })" @split="emit('split', { kind: 'field', field: 'caption' })" />
    </div>

    <!-- gallery -->
    <div v-else-if="slide.layout === 'gallery'" class="dek-pad l-gallery">
      <FittedText v-if="editable || slide.title" class="fit-gallery-title" content-class="gallery-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Title (optional)" :base-size="64" :min-size="26" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
      <div class="gallery-wrap">
        <div class="gallery-grid" :style="{ gridTemplateColumns: `repeat(${galleryCols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${galleryRows}, minmax(0, 1fr))` }">
          <div v-for="(it, i) in galleryItems" :key="i" class="gallery-cell">
            <!-- The slot is the picture's share of the cell; the frame fills it,
                 or for `contain` with a known shape shrinks to hug the picture
                 so its border and radius wrap the picture, not letterbox bars. -->
            <div class="frame-slot">
              <div class="frame" :class="{ hug: !!galleryHug(it) }" :style="galleryHug(it)" @contextmenu="onImageCtx($event, { field: 'gallery', index: i })">
                <FramedImage :src="it.image" :focus="it.focus" :fit="galleryHug(it) ? 'cover' : effectiveFit(it, slide.imageFit)" :editable="editable" pannable @update:focus="setGalleryFocus(i, $event)" @file="emit('upload', { field: 'gallery', file: $event, index: i })" />
                <a v-if="!editable && safeLink(it.link)" class="img-link" :href="safeLink(it.link)" target="_blank" rel="noopener noreferrer" />
                <button v-if="editable" class="cell-x" title="Remove" @click="removeGalleryItem(i)">✕</button>
                <template v-if="galleryOverlay && (editable || it.label)">
                  <EditableText
                    v-if="editable"
                    class="gallery-badge"
                    :class="{ empty: !it.label }"
                    :model-value="it.label"
                    placeholder="1"
                    @update:model-value="setGalleryLabel(i, $event)"
                  />
                  <span v-else class="gallery-badge">{{ it.label }}</span>
                </template>
              </div>
            </div>
            <FittedText v-if="galleryLabelRow" class="fit-gallery-label" content-class="label" :model-value="it.label" :editable="editable" placeholder="label" :base-size="28" :min-size="11" splittable @update:model-value="setGalleryLabel(i, $event)" @split="emit('split', { kind: 'gallery-label', index: i })" />
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

    <!-- table -->
    <div v-else-if="slide.layout === 'table'" class="dek-pad l-table">
      <FittedText v-if="editable || slide.title" class="fit-table-title" content-class="table-title" tag="h1" :model-value="slide.title" :editable="editable" placeholder="Title (optional)" :base-size="64" :min-size="26" splittable @update:model-value="patch({ title: $event })" @split="emit('split', { kind: 'field', field: 'title' })" />
      <TableGrid
        :table="slide.table"
        :editable="editable"
        :safe-link="safeLink"
        @update:table="patch({ table: $event })"
        @cell-file="(i, f) => emit('upload', { field: 'table', file: f, index: i })"
        @cell-ctx="(e, i) => emit('ctxmenu', { x: e.clientX, y: e.clientY, sx: 0, sy: 0, index: -1, kind: 'image', imageField: 'table', imageIndex: i })"
      />
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
      :overlay="slide.layout !== 'freeform'"
      @update:elements="emit('update:elements', $event)"
      @update:selected="emit('update:selectedEl', $event)"
      @create="emit('create-element', $event)"
      @tool-reset="emit('tool-reset')"
      @element-image="(idx, f) => emit('element-image', idx, f)"
      @split-element="emit('split', { kind: 'element', index: $event })"
      @drop-image="(f, t) => emit('drop-image', f, t)"
      @drop-link="(u, t) => emit('drop-link', u, t)"
      @ctxmenu="emit('ctxmenu', $event)"
      @upload="emit('upload', $event)"
    />
  </div>
</template>
