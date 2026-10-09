<script setup lang="ts">
// The `poll` layout. Editing: the question and (for a choice poll) its
// answers, one per line. Presenting: the question, the QR code phones scan to
// vote, and the results as they come in — bars for a choice or a 1–5 scale, a
// word cloud for words. The live part runs in live/liveState.ts.
import { computed } from 'vue'
import type { PollSpec, Slide, TableData } from '../core/types'
import { liveState } from '../live/liveState'
import { joinUrl } from '../live/client'
import FittedText from './FittedText.vue'
import EditableText from './EditableText.vue'
import QrCode from './QrCode.vue'
import WordCloud from './WordCloud.vue'

const props = defineProps<{ slide: Slide; index: number; editable?: boolean }>()
const emit = defineEmits<{ patch: [p: Partial<Slide>] }>()

const spec = computed<PollSpec>(() => props.slide.poll ?? { kind: 'choice', options: [] })
const live = computed(() => liveState.polls[props.index])
const session = computed(() => liveState.session)

/** Rows to draw: live results, or before any vote the options at zero. */
const rows = computed<[string, number][]>(() => {
  if (live.value) return live.value.results
  if (spec.value.kind === 'choice') return (spec.value.options ?? []).filter((o) => String(o).trim()).map((o) => [String(o), 0])
  if (spec.value.kind === 'scale') return ['1', '2', '3', '4', '5'].map((n) => [n, 0])
  return []
})
const max = computed(() => Math.max(1, ...rows.value.map(([, n]) => n)))
const total = computed(() => live.value?.total ?? 0)
const cloud = computed<TableData>(() => ({ rows: [['Answer', 'Votes'], ...rows.value], header: true }))

const optionsText = computed(() => (spec.value.options ?? []).join('\n'))
function setOptions(text: string) {
  emit('patch', { poll: { ...spec.value, options: text.split('\n').map((o) => o.trim()).filter(Boolean) } })
}

const status = computed(() => {
  if (props.editable) return ''
  if (liveState.error) return liveState.error
  if (liveState.connecting === props.index) return 'Connecting…'
  return ''
})
</script>

<template>
  <div class="dek-pad l-poll">
    <FittedText
      class="fit-poll-title"
      content-class="layout-title"
      tag="h1"
      :model-value="slide.title"
      :editable="editable"
      placeholder="Your question?"
      :base-size="56"
      :min-size="26"
      @update:model-value="emit('patch', { title: $event })"
    />
    <div class="poll-body">
      <div class="poll-results">
        <!-- editing a choice poll: its answers, one per line -->
        <div v-if="editable && spec.kind === 'choice'" class="poll-edit">
          <div class="poll-hint">Answers, one per line</div>
          <EditableText class="poll-options-edit" multiline :model-value="optionsText" placeholder="Yes&#10;No" @update:model-value="setOptions" />
        </div>
        <WordCloud v-else-if="spec.kind === 'words' && rows.length" :table="cloud" />
        <div v-else-if="spec.kind === 'words'" class="poll-empty">{{ editable ? 'Answers appear here as a word cloud.' : 'Waiting for answers…' }}</div>
        <div v-else class="poll-bars">
          <div v-for="([label, n], k) in rows" :key="k" class="poll-bar">
            <span class="poll-label">{{ label }}</span>
            <span class="poll-track"><span class="poll-fill" :style="{ width: (n / max) * 100 + '%' }" /></span>
            <span class="poll-n">{{ n }}</span>
          </div>
        </div>
      </div>
      <div class="poll-join">
        <div class="poll-qr">
          <QrCode v-if="!editable && session" :text="joinUrl(session.id)" />
          <div v-else class="poll-qr-empty">{{ editable ? 'QR code appears while presenting' : '' }}</div>
        </div>
        <div class="poll-scan">Scan to vote</div>
        <div v-if="live" class="poll-count">{{ total }} {{ total === 1 ? 'vote' : 'votes' }}</div>
        <div v-if="status" class="poll-status">{{ status }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.l-poll {
  display: flex;
  flex-direction: column;
}
.fit-poll-title {
  width: 100%;
  height: 78px;
  margin-bottom: 28px;
  flex: none;
}
.poll-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 56px;
}
.poll-results {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.poll-bars {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.poll-bar {
  display: grid;
  grid-template-columns: minmax(0, 34%) 1fr 56px;
  align-items: center;
  gap: 18px;
  font-family: var(--dek-font-body);
  font-size: 22px;
  color: var(--dek-text);
}
.poll-label {
  overflow-wrap: anywhere;
}
.poll-track {
  height: 26px;
  border-radius: 6px;
  background: var(--dek-line);
  overflow: hidden;
}
.poll-fill {
  display: block;
  height: 100%;
  background: var(--dek-accent);
  transition: width 0.5s ease;
}
.poll-n {
  text-align: right;
  color: var(--dek-dim);
}
.poll-empty,
.poll-hint {
  font-family: var(--dek-font-body);
  font-size: 18px;
  color: var(--dek-faint);
}
.poll-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.poll-options-edit {
  font-family: var(--dek-font-body);
  font-size: 22px;
  line-height: 1.6;
  color: var(--dek-text);
  min-height: 120px;
}
.poll-join {
  flex: none;
  width: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-family: var(--dek-font-body);
}
.poll-qr {
  width: 240px;
  height: 240px;
  padding: 12px;
  box-sizing: border-box;
  border-radius: 12px;
  background: #fff;
}
.poll-qr-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 13px;
  color: #666;
}
.poll-scan {
  font-size: 18px;
  color: var(--dek-dim);
}
.poll-count {
  font-size: 28px;
  color: var(--dek-accent);
}
.poll-status {
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
  color: var(--dek-faint);
}
</style>
