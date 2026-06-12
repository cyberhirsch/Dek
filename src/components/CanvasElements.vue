<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { SlideElement, BoxElement, ArrowElement, ImageElement, VideoElement, DiagramElement, CanvasTool } from '../core/types'
import { inlineMd, htmlToInline } from '../render/inline'
import { newElementRect, newArrow, defaultSize } from '../core/bake'
import { parseVideo, autoplaySrc } from '../render/video'
import FramedImage from './FramedImage.vue'
import MermaidDiagram from './MermaidDiagram.vue'
import BoxText from './BoxText.vue'

const STAGE_W = 1280
const STAGE_H = 720

const props = defineProps<{
  elements: SlideElement[]
  editable?: boolean
  tool?: CanvasTool
  /** Selected element indices, in selection order (last = primary). */
  selected?: number[]
  /** URL for the image tool — dragging out a rectangle places this picture. */
  pendingImage?: string
}>()

const emit = defineEmits<{
  'update:elements': [els: SlideElement[]]
  'update:selected': [sel: number[]]
  /** A creation tool was used on the canvas — the parent decides whether to bake
   *  the slide to freeform first, then append this element. */
  create: [el: SlideElement]
  'tool-reset': []
  /** User picked a replacement image file for a box element at the given index. */
  'element-image': [index: number, file: File]
  /** An image file was dropped on the canvas: either onto a box (set its image)
   *  or onto empty background (create a new image box at the drop point). */
  'drop-image': [file: File, target: { kind: 'box'; index: number } | { kind: 'new'; x: number; y: number }]
  /** Right-click: client coords for the menu, stage coords for new-element
   *  placement, and the element index under the cursor (−1 = empty background).
   *  `kind` flags a text selection / link hit inside a box being edited; `url`
   *  carries the link target for the link context. */
  ctxmenu: [
    p: {
      x: number
      y: number
      sx: number
      sy: number
      index: number
      kind?: 'text' | 'link'
      url?: string
    },
  ]
}>()

const root = ref<HTMLElement | null>(null)
const editing = ref<number | null>(null) // index being text-edited

// ── selection helpers ──
const selSet = computed(() => new Set(props.selected ?? []))
const isSelected = (i: number) => selSet.value.has(i)
// Resize/rotate handles only make sense on a single element.
const single = computed(() => (props.selected?.length === 1 ? props.selected[0] : null))

// ── in-frame image controls (replace / remove) ──
const imgFileEl = ref<HTMLInputElement | null>(null)
const imgPickIdx = ref<number | null>(null)
function pickBoxImage(i: number) {
  imgPickIdx.value = i
  imgFileEl.value?.click()
}
function onImgFilePick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  ;(e.target as HTMLInputElement).value = ''
  if (!file || !file.type.startsWith('image/') || imgPickIdx.value == null) return
  emit('element-image', imgPickIdx.value, file)
  imgPickIdx.value = null
}
function removeBoxImage(i: number) {
  const next = props.elements.map((el, idx) =>
    idx === i ? ({ ...el, src: undefined } as SlideElement) : el,
  )
  emit('update:elements', next)
}

// ── drag-and-drop image files from the OS / other windows ──
const dropActive = ref(false)
function hasFiles(e: DragEvent): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
}
function onCanvasDragOver(e: DragEvent) {
  if (!props.editable || !hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  dropActive.value = true
}
function onCanvasDragLeave(e: DragEvent) {
  // Only clear when the pointer actually leaves the layer, not on child crossings.
  if (e.target === root.value) dropActive.value = false
}
/** The topmost box element under the drop point (DOM-based, so it respects
 *  z-order and rotation), or null when the drop lands on empty canvas. */
function boxIndexAt(e: DragEvent): number | null {
  const node = (e.target as HTMLElement | null)?.closest?.('.el') as HTMLElement | null
  if (!node || node.dataset.idx == null) return null
  const i = Number(node.dataset.idx)
  return items.value[i]?.type === 'box' ? i : null
}
function onCanvasDrop(e: DragEvent) {
  dropActive.value = false
  if (!props.editable || !hasFiles(e)) return
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  const idx = boxIndexAt(e)
  if (idx != null) {
    emit('drop-image', file, { kind: 'box', index: idx })
  } else {
    const p = toStage(e)
    emit('drop-image', file, { kind: 'new', x: Math.round(p.x), y: Math.round(p.y) })
  }
}

// Capture pointer events only when there's something to do here: a creation tool
// is active, or the slide actually has elements. Otherwise stay transparent so
// the underlying semantic layout (EditableText, image frames) stays clickable.
const interactive = computed(
  () => !!props.editable && ((props.tool && props.tool !== 'select') || props.elements.length > 0),
)

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type Handle = (typeof HANDLES)[number]

function toStage(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const el = root.value!
  const r = el.getBoundingClientRect()
  const s = r.width / STAGE_W || 1
  return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }
}

function onContextMenu(e: MouseEvent) {
  if (!props.editable) return
  e.preventDefault()
  // Inside a box being text-edited, a caret in a link or a non-empty selection
  // opens the text-aware menus instead of the element menu.
  if (editing.value != null) {
    const sel = window.getSelection()
    const editEl = root.value?.querySelector(`[data-edit="${editing.value}"]`)
    if (sel && sel.rangeCount && sel.anchorNode && editEl?.contains(sel.anchorNode)) {
      const node = sel.anchorNode
      const host = (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement) ?? null
      const link = host?.closest('a')
      if (link) {
        emit('ctxmenu', { x: e.clientX, y: e.clientY, sx: 0, sy: 0, index: editing.value, kind: 'link', url: link.getAttribute('href') ?? '' })
        return
      }
      if (!sel.isCollapsed) {
        emit('ctxmenu', { x: e.clientX, y: e.clientY, sx: 0, sy: 0, index: editing.value, kind: 'text' })
        return
      }
    }
  }
  const elDiv = (e.target as HTMLElement).closest('.el') as HTMLElement | null
  const index = elDiv?.dataset.idx != null ? Number(elDiv.dataset.idx) : -1
  const p = toStage(e)
  emit('ctxmenu', { x: e.clientX, y: e.clientY, sx: Math.round(p.x), sy: Math.round(p.y), index })
}

// ── element styles ──
function boxStyle(el: SlideElement) {
  const s: Record<string, string> = {
    left: el.x + 'px',
    top: el.y + 'px',
    width: el.w + 'px',
    height: el.h + 'px',
    transform: `rotate(${el.rotation ?? 0}deg)`,
  }
  if (el.type === 'box') {
    s.background = el.fill ?? 'transparent'
    s.border = `${el.strokeWidth ?? 0}px solid ${el.stroke ?? 'transparent'}`
    s.borderRadius = (el.radius ?? 0) + 'px'
  }
  return s
}
function resolveFont(font?: string): string {
  if (!font || font === 'body') return 'var(--dek-font-body)'
  if (font === 'heading') return 'var(--dek-font-heading)'
  return `'${font}', sans-serif`
}
function textStyle(el: BoxElement) {
  const deco = [el.underline ? 'underline' : '', el.strike ? 'line-through' : ''].filter(Boolean).join(' ')
  // Inset the text so it never collides with a rounded corner: padding scales
  // with the corner radius (capped so the content area never collapses).
  const r = el.radius ?? 0
  const padX = Math.min(Math.max(10, r * 0.5), el.w / 2)
  const padY = Math.min(Math.max(6, r * 0.35), el.h / 2)
  return {
    fontFamily: resolveFont(el.font),
    fontSize: (el.size ?? 28) + 'px',
    textAlign: el.align ?? 'left',
    color: el.color ?? 'var(--dek-text)',
    // bold always wins (so the B button works); otherwise use an explicit weight
    // (e.g. 300 from a baked heading), defaulting to 400.
    fontWeight: el.bold ? '700' : el.weight != null ? String(el.weight) : '400',
    fontStyle: el.italic ? 'italic' : 'normal',
    textDecoration: deco || 'none',
    // match the slide CSS headings' tracking so baked headings render identically
    letterSpacing: el.font === 'heading' ? '0.02em' : 'normal',
    lineHeight: String(el.lineHeight ?? 1.25),
    gap: (el.lineGap ?? 0.4) + 'em',
    justifyContent: el.valign === 'middle' ? 'center' : el.valign === 'bottom' ? 'flex-end' : 'flex-start',
    padding: `${padY}px ${padX}px`,
    borderRadius: 'inherit',
  } as Record<string, string>
}

// ── selection / creation ──
// Creating any element is click-the-top-left + drag-out-the-size. We record the
// down point, track the pointer, and on release build the element from the dragged
// rectangle (or, if it was just a click, a sensible default size at that point).
const createDraft = ref<{ tool: CanvasTool; x0: number; y0: number; x1: number; y1: number } | null>(null)
const createRect = computed(() => {
  const c = createDraft.value
  if (!c) return null
  return { x: Math.min(c.x0, c.x1), y: Math.min(c.y0, c.y1), w: Math.abs(c.x1 - c.x0), h: Math.abs(c.y1 - c.y0) }
})

function onBackgroundDown(e: PointerEvent) {
  if (!props.editable) return
  if (e.button !== 0) return // right/middle button: leave for the context menu
  if (props.tool && props.tool !== 'select') {
    e.preventDefault()
    const p = toStage(e)
    createDraft.value = { tool: props.tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y }
    window.addEventListener('pointermove', onCreateMove)
    window.addEventListener('pointerup', onCreateUp)
    return
  }
  // Select tool on empty canvas: drag out a marquee. A plain click (no movement)
  // falls through to a deselect on pointer-up, preserving the old behaviour.
  e.preventDefault()
  const p = toStage(e)
  marquee.value = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, base: e.shiftKey ? [...(props.selected ?? [])] : [] }
  window.addEventListener('pointermove', onMarqueeMove)
  window.addEventListener('pointerup', onMarqueeUp)
}

// ── marquee selection ──
const marquee = ref<{ x0: number; y0: number; x1: number; y1: number; base: number[] } | null>(null)
const marqueeRect = computed(() => {
  const m = marquee.value
  if (!m) return null
  return { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), w: Math.abs(m.x1 - m.x0), h: Math.abs(m.y1 - m.y0) }
})
/** Axis-aligned bounding box of an element, accounting for rotation. */
function aabb(el: SlideElement) {
  const r = (((el.rotation ?? 0) % 360) * Math.PI) / 180
  const c = Math.abs(Math.cos(r))
  const s = Math.abs(Math.sin(r))
  const hw = (el.w * c + el.h * s) / 2
  const hh = (el.w * s + el.h * c) / 2
  const cx = el.x + el.w / 2
  const cy = el.y + el.h / 2
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }
}
function marqueeHits(): number[] {
  const r = marqueeRect.value
  if (!r) return []
  return props.elements.flatMap((el, i) => {
    const b = aabb(el)
    const hit = b.x1 >= r.x && b.x0 <= r.x + r.w && b.y1 >= r.y && b.y0 <= r.y + r.h
    return hit ? [i] : []
  })
}
function onMarqueeMove(e: PointerEvent) {
  if (!marquee.value) return
  const p = toStage(e)
  marquee.value = { ...marquee.value, x1: p.x, y1: p.y }
}
function onMarqueeUp() {
  window.removeEventListener('pointermove', onMarqueeMove)
  window.removeEventListener('pointerup', onMarqueeUp)
  const m = marquee.value
  marquee.value = null
  if (!m) return
  const dragged = Math.hypot(m.x1 - m.x0, m.y1 - m.y0) > 4
  if (!dragged) {
    // plain background click: clear selection (shift-click keeps it)
    emit('update:selected', m.base)
    if (editing.value != null) commitEdit()
    return
  }
  const hits = marqueeHits()
  emit('update:selected', [...new Set([...m.base, ...hits])])
}
function onCreateMove(e: PointerEvent) {
  if (!createDraft.value) return
  const p = toStage(e)
  createDraft.value = { ...createDraft.value, x1: p.x, y1: p.y }
}
function onCreateUp() {
  window.removeEventListener('pointermove', onCreateMove)
  window.removeEventListener('pointerup', onCreateUp)
  const c = createDraft.value
  createDraft.value = null
  if (!c) return
  const dragged = Math.hypot(c.x1 - c.x0, c.y1 - c.y0) > 6
  let el: SlideElement
  if (c.tool === 'arrow') {
    el = dragged ? newArrow(c.x0, c.y0, c.x1, c.y1) : newArrow(c.x0, c.y0, c.x0 + 240, c.y0)
  } else {
    const d = defaultSize(c.tool)
    const x = dragged ? Math.min(c.x0, c.x1) : c.x0
    const y = dragged ? Math.min(c.y0, c.y1) : c.y0
    const w = dragged ? Math.abs(c.x1 - c.x0) : d.w
    const h = dragged ? Math.abs(c.y1 - c.y0) : d.h
    el = newElementRect(c.tool, x, y, w, h, props.pendingImage)
  }
  emit('create', el)
  emit('tool-reset')
}

function onElementDown(e: PointerEvent, i: number) {
  if (!props.editable) return
  if (e.button !== 0) return // right/middle button: leave for the context menu
  if (props.tool && props.tool !== 'select') {
    onBackgroundDown(e)
    return
  }
  e.stopPropagation()
  if (e.shiftKey) {
    // shift-click toggles membership; no drag starts so a sloppy click can't move things
    const cur = props.selected ?? []
    emit('update:selected', cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i])
    return
  }
  // Clicking an already-selected element keeps the group (so it can be dragged
  // together); clicking an unselected one selects just it.
  if (!isSelected(i)) emit('update:selected', [i])
  if (editing.value != null && editing.value !== i) commitEdit()
  startDrag(e, i, 'move')
}

// ── transform engine ──
interface DragState {
  mode: 'move' | 'resize' | 'rotate'
  handle?: Handle
  index: number
  start: { x: number; y: number }
  orig: SlideElement
  /** Origin snapshots of every element the drag moves (the whole selection). */
  origs: Map<number, SlideElement>
  cx: number
  cy: number
}
let drag: DragState | null = null
const draft = ref<SlideElement[] | null>(null)
const items = computed<SlideElement[]>(() => draft.value ?? props.elements)

// ── snapping ──
// While dragging, the moving bounds' edges and centre lines snap to the stage
// (edges + centre) and to every non-dragged element's edges and centres. Alt
// disables snapping; active guide lines render across the whole stage.
const SNAP = 6
const guides = ref<{ v: number[]; h: number[] }>({ v: [], h: [] })
function snapLines(excluded: Set<number>): { v: number[]; h: number[] } {
  const v = [0, STAGE_W / 2, STAGE_W]
  const h = [0, STAGE_H / 2, STAGE_H]
  props.elements.forEach((el, i) => {
    if (excluded.has(i)) return
    const b = aabb(el)
    v.push(b.x0, (b.x0 + b.x1) / 2, b.x1)
    h.push(b.y0, (b.y0 + b.y1) / 2, b.y1)
  })
  return { v, h }
}
/** Nearest snap adjustment for a set of probe positions against candidate lines. */
function bestSnap(probes: number[], lines: number[]): { d: number; line: number } | null {
  let best: { d: number; line: number } | null = null
  for (const p of probes) {
    for (const line of lines) {
      const d = line - p
      if (Math.abs(d) <= SNAP && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line }
    }
  }
  return best
}

function startDrag(e: PointerEvent, index: number, mode: 'move' | 'resize' | 'rotate', handle?: Handle) {
  if (editing.value != null) return
  e.preventDefault()
  e.stopPropagation()
  const orig = { ...props.elements[index] }
  // A move drags every selected element together. The just-emitted selection may
  // not have round-tripped through the parent yet, so fall back to [index].
  const moveSet = mode === 'move' && isSelected(index) ? (props.selected ?? [index]) : [index]
  const origs = new Map<number, SlideElement>()
  for (const i of moveSet) if (props.elements[i]) origs.set(i, { ...props.elements[i] })
  if (!origs.has(index)) origs.set(index, orig)
  draft.value = props.elements.map((el) => ({ ...el }))
  drag = {
    mode,
    handle,
    index,
    start: toStage(e),
    orig,
    origs,
    cx: orig.x + orig.w / 2,
    cy: orig.y + orig.h / 2,
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragUp)
}

function onDragMove(e: PointerEvent) {
  if (!drag || !draft.value) return
  const p = toStage(e)
  let dx = p.x - drag.start.x
  let dy = p.y - drag.start.y
  const o = drag.orig
  const next = { ...draft.value[drag.index] }

  if (drag.mode === 'move') {
    guides.value = { v: [], h: [] }
    if (!e.altKey) {
      // Snap the union bounds of everything being moved.
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
      for (const og of drag.origs.values()) {
        const b = aabb(og)
        bx0 = Math.min(bx0, b.x0 + dx)
        by0 = Math.min(by0, b.y0 + dy)
        bx1 = Math.max(bx1, b.x1 + dx)
        by1 = Math.max(by1, b.y1 + dy)
      }
      const lines = snapLines(new Set(drag.origs.keys()))
      const sv = bestSnap([bx0, (bx0 + bx1) / 2, bx1], lines.v)
      const sh = bestSnap([by0, (by0 + by1) / 2, by1], lines.h)
      if (sv) {
        dx += sv.d
        guides.value.v = [sv.line]
      }
      if (sh) {
        dy += sh.d
        guides.value.h = [sh.line]
      }
    }
    // shift every element in the selection by the same delta
    for (const [idx, og] of drag.origs) {
      const n = { ...draft.value[idx] }
      n.x = Math.round(og.x + dx)
      n.y = Math.round(og.y + dy)
      draft.value[idx] = n
    }
    return
  } else if (drag.mode === 'resize') {
    const h = drag.handle!
    let x = o.x
    let y = o.y
    let w = o.w
    let hgt = o.h
    if (h.includes('e')) w = o.w + dx
    if (h.includes('s')) hgt = o.h + dy
    if (h.includes('w')) {
      x = o.x + dx
      w = o.w - dx
    }
    if (h.includes('n')) {
      y = o.y + dy
      hgt = o.h - dy
    }
    // Snap the edge(s) being dragged (skip for rotated elements, where the
    // x/y/w/h box no longer matches what's on screen).
    guides.value = { v: [], h: [] }
    if (!e.altKey && !(o.rotation ?? 0)) {
      const lines = snapLines(new Set([drag.index]))
      if (h.includes('e')) {
        const s = bestSnap([x + w], lines.v)
        if (s) {
          w += s.d
          guides.value.v.push(s.line)
        }
      } else if (h.includes('w')) {
        const s = bestSnap([x], lines.v)
        if (s) {
          x += s.d
          w -= s.d
          guides.value.v.push(s.line)
        }
      }
      if (h.includes('s')) {
        const s = bestSnap([y + hgt], lines.h)
        if (s) {
          hgt += s.d
          guides.value.h.push(s.line)
        }
      } else if (h.includes('n')) {
        const s = bestSnap([y], lines.h)
        if (s) {
          y += s.d
          hgt -= s.d
          guides.value.h.push(s.line)
        }
      }
    }
    const MINW = 12
    const MINH = next.type === 'arrow' ? 0 : 12
    if (w < MINW) {
      if (h.includes('w')) x = o.x + o.w - MINW
      w = MINW
    }
    if (hgt < MINH) {
      if (h.includes('n')) y = o.y + o.h - MINH
      hgt = MINH
    }
    next.x = Math.round(x)
    next.y = Math.round(y)
    next.w = Math.round(w)
    next.h = Math.round(hgt)
  } else {
    let deg = (Math.atan2(p.y - drag.cy, p.x - drag.cx) * 180) / Math.PI + 90
    if (e.shiftKey) deg = Math.round(deg / 15) * 15
    next.rotation = Math.round(deg)
  }

  draft.value[drag.index] = next
}

function onDragUp() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragUp)
  guides.value = { v: [], h: [] }
  if (draft.value) emit('update:elements', draft.value)
  draft.value = null
  drag = null
}

function onHandleDown(e: PointerEvent, i: number, h: Handle) {
  startDrag(e, i, 'resize', h)
}
function onRotateDown(e: PointerEvent, i: number) {
  startDrag(e, i, 'rotate')
}

// ── text inline editing ──
function onElementDblClick(i: number) {
  if (!props.editable) return
  if (props.elements[i].type !== 'box') return
  editing.value = i
  emit('update:selected', [i])
  nextTick(() => {
    const node = root.value?.querySelector<HTMLElement>(`[data-edit="${i}"]`)
    if (node) {
      node.focus()
      const range = document.createRange()
      range.selectNodeContents(node)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  })
}
function commitEdit() {
  const i = editing.value
  if (i == null) return
  const node = root.value?.querySelector<HTMLElement>(`[data-edit="${i}"]`)
  editing.value = null
  if (!node) return
  const content = htmlToInline(node.innerHTML).replace(/\n+$/, '')
  if (content !== (props.elements[i] as BoxElement).content) {
    const next = props.elements.map((el) => ({ ...el }))
    ;(next[i] as BoxElement).content = content
    emit('update:elements', next)
  }
}

// ── video element playback ──
const playing = ref<Set<number>>(new Set())
function videoPoster(el: VideoElement) {
  return el.poster || parseVideo(el.video)?.thumb || ''
}
function playVideo(i: number, el: VideoElement) {
  if (!parseVideo(el.video)) return
  playing.value = new Set(playing.value).add(i)
}
function videoSrc(el: VideoElement) {
  const pv = parseVideo(el.video)
  return pv ? autoplaySrc(pv) : ''
}
function isFileVideo(el: VideoElement) {
  return parseVideo(el.video)?.provider === 'file'
}

// type-narrowing helpers for the template
const asBox = (el: SlideElement) => el as BoxElement
const asArrow = (el: SlideElement) => el as ArrowElement
const asImage = (el: SlideElement) => el as ImageElement
const asVideo = (el: SlideElement) => el as VideoElement
const asDiagram = (el: SlideElement) => el as DiagramElement

defineExpose({ commitEdit })
</script>

<template>
  <div
    ref="root"
    class="canvas-layer"
    :class="{ editable, creating: editable && tool && tool !== 'select', 'drop-active': dropActive }"
    :style="{ pointerEvents: interactive ? 'auto' : 'none' }"
    @pointerdown="onBackgroundDown"
    @contextmenu="onContextMenu"
    @dragover="onCanvasDragOver"
    @dragleave="onCanvasDragLeave"
    @drop="onCanvasDrop"
  >
    <div
      v-for="(el, i) in items"
      :key="i"
      class="el"
      :class="['el-' + el.type, { selected: editable && isSelected(i) && editing == null }]"
      :style="boxStyle(el)"
      :data-idx="i"
      @pointerdown="onElementDown($event, i)"
      @dblclick="onElementDblClick(i)"
    >
      <!-- box: shape (bg/border) + optional image + optional text -->
      <template v-if="el.type === 'box'">
        <FramedImage
          v-if="asBox(el).src"
          class="el-box-img"
          :src="asBox(el).src"
          :focus="asBox(el).focus"
          :fit="asBox(el).fit ?? 'cover'"
        />
        <!-- replace / remove controls appear on hover for image-carrying boxes -->
        <div v-if="editable && asBox(el).src" class="img-ctrl" @pointerdown.stop @click.stop>
          <button class="img-btn" title="Replace image" @click="pickBoxImage(i)">⇄</button>
          <button class="img-btn" title="Remove image" @click="removeBoxImage(i)">✕</button>
        </div>
        <div
          v-if="editing === i"
          class="el-text-body editing"
          :style="textStyle(asBox(el))"
          :data-edit="i"
          data-rich
          contenteditable="true"
          spellcheck="false"
          @pointerdown.stop
          @blur="commitEdit"
          @keydown.escape.prevent="commitEdit"
          v-html="inlineMd(asBox(el).content)"
        />
        <BoxText
          v-else
          :content="asBox(el).content"
          :base-size="asBox(el).size ?? 28"
          :style="textStyle(asBox(el))"
        />
      </template>

      <!-- arrow -->
      <svg
        v-else-if="el.type === 'arrow'"
        class="el-arrow"
        :width="el.w"
        :height="Math.max(el.h, 1)"
        :viewBox="`0 0 ${el.w} ${Math.max(el.h, 1)}`"
        preserveAspectRatio="none"
        overflow="visible"
      >
        <defs>
          <marker :id="`ah-${i}`" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 Z" :fill="asArrow(el).stroke ?? '#e6ecf2'" />
          </marker>
        </defs>
        <line
          x1="0"
          :y1="el.h / 2"
          :x2="el.w"
          :y2="el.h / 2"
          :stroke="asArrow(el).stroke ?? '#e6ecf2'"
          :stroke-width="asArrow(el).strokeWidth ?? 3"
          :marker-end="`url(#ah-${i})`"
        />
      </svg>

      <!-- image -->
      <FramedImage v-else-if="el.type === 'image'" :src="asImage(el).src" :focus="asImage(el).focus" :fit="asImage(el).fit ?? 'cover'" />

      <!-- video -->
      <div v-else-if="el.type === 'video'" class="el-video">
        <template v-if="playing.has(i)">
          <iframe v-if="!isFileVideo(asVideo(el))" :src="videoSrc(asVideo(el))" allow="autoplay; encrypted-media; fullscreen" allowfullscreen />
          <video v-else :src="asVideo(el).video" controls autoplay />
        </template>
        <template v-else>
          <FramedImage :src="videoPoster(asVideo(el))" fit="contain" />
          <button class="vid-play" title="Play" @click.stop="playVideo(i, asVideo(el))" @pointerdown.stop><span class="tri" /></button>
        </template>
      </div>

      <!-- diagram -->
      <div v-else-if="el.type === 'diagram'" class="el-diagram">
        <MermaidDiagram :code="asDiagram(el).code" />
      </div>

      <!-- selection chrome (transform handles only for a single selection) -->
      <template v-if="editable && single === i && editing == null">
        <span class="rot-line" />
        <span class="handle rot" @pointerdown="onRotateDown($event, i)" />
        <span
          v-for="h in HANDLES"
          :key="h"
          class="handle"
          :class="'h-' + h"
          @pointerdown="onHandleDown($event, i, h)"
        />
      </template>
    </div>

    <!-- drag-to-create preview -->
    <div
      v-if="createDraft && createDraft.tool !== 'arrow' && createRect"
      class="create-ghost"
      :style="{ left: createRect.x + 'px', top: createRect.y + 'px', width: createRect.w + 'px', height: createRect.h + 'px' }"
    />
    <svg v-else-if="createDraft" class="create-ghost-arrow" viewBox="0 0 1280 720" preserveAspectRatio="none">
      <line :x1="createDraft.x0" :y1="createDraft.y0" :x2="createDraft.x1" :y2="createDraft.y1" />
    </svg>

    <!-- marquee selection rectangle -->
    <div
      v-if="marqueeRect && (marqueeRect.w > 2 || marqueeRect.h > 2)"
      class="marquee"
      :style="{ left: marqueeRect.x + 'px', top: marqueeRect.y + 'px', width: marqueeRect.w + 'px', height: marqueeRect.h + 'px' }"
    />

    <!-- snap guide lines -->
    <div v-for="(g, gi) in guides.v" :key="'gv' + gi" class="guide guide-v" :style="{ left: g + 'px' }" />
    <div v-for="(g, gi) in guides.h" :key="'gh' + gi" class="guide guide-h" :style="{ top: g + 'px' }" />

    <input ref="imgFileEl" type="file" accept="image/*" style="display:none" @change="onImgFilePick" />
  </div>
</template>

<style scoped>
.canvas-layer {
  position: absolute;
  inset: 0;
  z-index: 3;
}
.canvas-layer.creating {
  cursor: crosshair;
}
/* highlight the whole stage while an image file is dragged over it */
.canvas-layer.drop-active::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 7;
  pointer-events: none;
  border: 2px dashed rgba(127, 199, 255, 0.7);
  background: rgba(127, 199, 255, 0.08);
}
/* drag-to-create ghost */
.create-ghost {
  position: absolute;
  border: 1.5px dashed #7fc7ff;
  background: rgba(127, 199, 255, 0.1);
  border-radius: 4px;
  pointer-events: none;
  z-index: 6;
}
.create-ghost-arrow {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 6;
  overflow: visible;
}
.create-ghost-arrow line {
  stroke: #7fc7ff;
  stroke-width: 3;
  stroke-dasharray: 6 5;
}
.marquee {
  position: absolute;
  border: 1px dashed rgba(127, 199, 255, 0.8);
  background: rgba(127, 199, 255, 0.07);
  pointer-events: none;
  z-index: 6;
}
/* snap alignment guides */
.guide {
  position: absolute;
  pointer-events: none;
  z-index: 8;
  background: #ff7ab8;
}
.guide-v {
  top: 0;
  bottom: 0;
  width: 1px;
}
.guide-h {
  left: 0;
  right: 0;
  height: 1px;
}
.el {
  position: absolute;
  transform-origin: center center;
  box-sizing: border-box;
}
.canvas-layer.editable .el {
  cursor: move;
}
/* In the editor, links don't navigate — clicks select/move the box or place the
   caret. They become live again in present/export mode (non-editable). */
.canvas-layer.editable :deep(.el-text-body a) {
  pointer-events: none;
}
.el-box-img {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  z-index: 0;
}
.el-text-body {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  line-height: 1.25;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: hidden;
}
.el-text-body.editing {
  display: block;
  white-space: pre-wrap;
}
.el-line {
  position: relative;
}
.el-line.bullet {
  padding-left: 1.4em;
}
.el-line.bullet::before {
  content: '▪';
  position: absolute;
  left: 0;
  top: 0;
  color: var(--dek-accent);
}
.el-text-body.editing {
  outline: none;
  cursor: text;
  background: rgba(127, 199, 255, 0.08);
}
.el-arrow {
  display: block;
  overflow: visible;
}
.el-video {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}
.el-video iframe,
.el-video video {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
/* play button stays clickable even when the layer is non-interactive (present mode) */
.el-video .vid-play {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
}
.el-video .vid-play:hover { background: rgba(0, 0, 0, 0.75); }
.el-video .tri {
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 13px 0 13px 22px;
  border-color: transparent transparent transparent #fff;
  margin-left: 4px;
}
.el-diagram {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
/* selection */
.el.selected::after {
  content: '';
  position: absolute;
  inset: -2px;
  border: 1.5px solid #7fc7ff;
  pointer-events: none;
}
.handle {
  position: absolute;
  width: 11px;
  height: 11px;
  background: #fff;
  border: 1.5px solid #7fc7ff;
  border-radius: 2px;
  z-index: 5;
}
.handle.rot {
  border-radius: 50%;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  cursor: grab;
}
.rot-line {
  position: absolute;
  top: -22px;
  left: 50%;
  width: 1px;
  height: 22px;
  background: #7fc7ff;
  transform: translateX(-50%);
  pointer-events: none;
}
/* in-frame image controls — replace / remove, appear on hover */
.img-ctrl {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}
.el:hover .img-ctrl { opacity: 1; }
.img-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(7, 8, 9, 0.65);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.img-btn:hover { background: rgba(127, 199, 255, 0.4); }

.h-nw { top: -6px; left: -6px; cursor: nwse-resize; }
.h-n  { top: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
.h-ne { top: -6px; right: -6px; cursor: nesw-resize; }
.h-e  { top: 50%; right: -6px; transform: translateY(-50%); cursor: ew-resize; }
.h-se { bottom: -6px; right: -6px; cursor: nwse-resize; }
.h-s  { bottom: -6px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
.h-sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
.h-w  { top: 50%; left: -6px; transform: translateY(-50%); cursor: ew-resize; }
</style>
