<script setup lang="ts">
// Uncontrolled contenteditable: we set textContent imperatively so Vue re-renders
// never reset the caret mid-type. Emits on input (debounced upstream) and blur.
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{
  modelValue?: string
  tag?: string
  placeholder?: string
  multiline?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [v: string]
  enter: []
  'empty-backspace': []
}>()

const el = ref<HTMLElement | null>(null)
let focused = false

function read(): string {
  return el.value?.innerText.replace(/\n$/, '') ?? ''
}
function onInput() {
  emit('update:modelValue', read())
}
function onFocus() {
  focused = true
}
function onBlur() {
  focused = false
  emit('update:modelValue', read())
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !props.multiline && !e.shiftKey) {
    e.preventDefault()
    emit('enter')
  } else if (e.key === 'Backspace' && read() === '') {
    e.preventDefault()
    emit('empty-backspace')
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (!focused && el.value && el.value.innerText !== v) el.value.innerText = v ?? ''
  },
)
onMounted(() => {
  if (el.value) el.value.innerText = props.modelValue ?? ''
})
</script>

<template>
  <component
    :is="tag || 'div'"
    ref="el"
    class="dek-editable"
    :class="{ empty: !modelValue }"
    contenteditable="true"
    spellcheck="false"
    :data-placeholder="placeholder"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @keydown="onKeydown"
  />
</template>

<style>
.dek-editable {
  outline: none;
  cursor: text;
  border-radius: 4px;
  transition: box-shadow 0.12s, background 0.12s;
}
.dek-editable:hover {
  box-shadow: 0 0 0 1px rgba(127, 199, 255, 0.25);
}
.dek-editable:focus {
  box-shadow: 0 0 0 1px rgba(127, 199, 255, 0.6);
  background: rgba(127, 199, 255, 0.05);
}
.dek-editable.empty::before {
  content: attr(data-placeholder);
  opacity: 0.35;
  pointer-events: none;
}
.dek-editable.empty:focus::before {
  content: '';
}
</style>
