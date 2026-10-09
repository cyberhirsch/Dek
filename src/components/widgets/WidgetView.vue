<script setup lang="ts">
// One entry point for every widget kind, so the canvas only knows "widget".
// A kind this version of Dek doesn't know (a deck from a newer Dek) is kept in
// the file and shown as a placeholder rather than dropped.
import type { WidgetElement } from '../../core/types'
import TimerWidget from './TimerWidget.vue'

defineProps<{ el: WidgetElement; editable?: boolean }>()
</script>

<template>
  <TimerWidget v-if="el.widget === 'timer'" :el="el" :editable="editable" />
  <div v-else class="widget-unknown">Widget “{{ el.widget }}” needs a newer Dek</div>
</template>

<style scoped>
.widget-unknown {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--dek-line);
  border-radius: 8px;
  font: 14px var(--dek-font-body);
  color: var(--dek-faint);
}
</style>
