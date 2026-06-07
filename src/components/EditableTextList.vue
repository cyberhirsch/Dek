<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { inlineMd, htmlToInline } from '../render/inline'

export interface EditableTextListRow {
  text: string
  bullet: boolean
}

const props = defineProps<{
  rows: EditableTextListRow[]
  formatCommand?: number
}>()
const emit = defineEmits<{
  'update:rows': [rows: EditableTextListRow[]]
}>()

const el = ref<HTMLUListElement | null>(null)
let focused = false

function buildRow(row: EditableTextListRow, index: number): HTMLLIElement {
  const li = document.createElement('li')
  li.className = row.bullet ? 'editing' : 'editing plain'
  li.dataset.textRow = String(index)
  // Render the inline Markdown as real HTML so the user sees styled text while
  // editing (WYSIWYG); readRows() serializes it back to Markdown on the way out.
  li.innerHTML = inlineMd(row.text)
  return li
}
function syncDomRows() {
  const list = el.value
  if (!list) return
  const rows = props.rows.length ? props.rows : [{ text: '', bullet: true }]
  list.replaceChildren(...rows.map(buildRow))
}
function normalizeChildren() {
  const list = el.value
  if (!list) return
  if (!list.children.length) list.append(buildRow({ text: '', bullet: true }, 0))
  Array.from(list.children).forEach((child, index) => {
    const row = child as HTMLElement
    row.classList.add('editing')
    row.dataset.textRow = String(index)
  })
}
function readRows(): EditableTextListRow[] {
  normalizeChildren()
  const list = el.value
  if (!list) return []
  return Array.from(list.children).map((child) => {
    const row = child as HTMLElement
    return {
      text: htmlToInline(row.innerHTML),
      bullet: !row.classList.contains('plain'),
    }
  })
}
function emitRows() {
  emit('update:rows', readRows())
}
function onFocusIn() {
  focused = true
}
function onFocusOut() {
  focused = false
  emitRows()
}
function onInput() {
  emitRows()
}
function onKeydown(e: KeyboardEvent) {
  const rows = readRows()
  if (e.key === 'Backspace' && rows.length <= 1 && rows[0]?.text === '') {
    e.preventDefault()
  }
}
function rowFromNode(node: Node | null): HTMLElement | null {
  const list = el.value
  if (!node || !list) return null
  const candidate = node instanceof Element ? node : node.parentElement
  const row = candidate?.closest<HTMLElement>('[data-text-row]')
  return row && list.contains(row) ? row : null
}
function selectedRows(): HTMLElement[] {
  const list = el.value
  const selection = window.getSelection()
  if (!list) return []
  const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-text-row]'))
  const picked = new Set<HTMLElement>()

  if (selection?.rangeCount) {
    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i)
      for (const row of rows) {
        if (range.intersectsNode(row)) picked.add(row)
      }
    }
    const anchor = rowFromNode(selection.anchorNode)
    const focus = rowFromNode(selection.focusNode)
    if (anchor) picked.add(anchor)
    if (focus) picked.add(focus)
  }

  if (!picked.size) {
    const active = rowFromNode(document.activeElement)
    if (active) picked.add(active)
  }

  return rows.filter((row) => picked.has(row))
}
function toggleSelectedBullets() {
  const rows = selectedRows()
  if (!rows.length) return
  const nextBullet = !rows.every((row) => !row.classList.contains('plain'))
  for (const row of rows) row.classList.toggle('plain', !nextBullet)
  emitRows()
}

watch(
  () => props.rows,
  () => {
    if (!focused) syncDomRows()
  },
  { deep: true },
)
watch(
  () => props.formatCommand,
  (command, previous) => {
    if (command !== previous) toggleSelectedBullets()
  },
)
onMounted(syncDomRows)
</script>

<template>
  <ul
    ref="el"
    class="dek-list editable-list"
    contenteditable="true"
    tabindex="0"
    spellcheck="false"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
    @input="onInput"
    @keydown="onKeydown"
  />
</template>
