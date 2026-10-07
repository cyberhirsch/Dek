<script setup lang="ts">
// The audience window: opened by the presenter view (`?view=audience`), dragged
// onto the projector, made fullscreen. It shows the slides — videos, narration,
// the pen and all — while the original tab shows the presenter view.
//
// It can't open the deck itself (a folder deck's access lives only in the
// original tab), so the deck arrives over a BroadcastChannel, pictures inlined.
// Position (slide + build rows) is shared both ways: keys pressed here move
// both windows, and so do keys in the presenter view. Voice files are fetched
// from the original tab on demand.
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { Deck } from '../core/types'
import { parseDeck } from '../core/deck'
import { setVoiceFileReader } from '../render/voice'
import DeckView from './Deck.vue'
import { AUDIENCE_CHANNEL, type AudienceMsg } from '../composables/useAudienceSync'

const deck = ref<Deck | null>(null)
const current = ref(0)
const revealed = ref(0)
const drawing = ref(false)
const narrating = ref(false)
const fullscreen = ref(false)
const bc = new BroadcastChannel(AUDIENCE_CHANNEL)
const post = (m: AudienceMsg) => bc.postMessage(m)

// Voice files: ask the presenter tab, which holds the deck's folder.
let reqId = 0
const pending = new Map<number, (b: Blob | null) => void>()
setVoiceFileReader(
  (name) =>
    new Promise((resolve) => {
      const id = ++reqId
      pending.set(id, resolve)
      post({ type: 'voice-req', id, name })
      setTimeout(() => pending.delete(id) && resolve(null), 5000)
    }),
)

// A position from the other window must not be sent straight back to it.
let lastRemote = ''
bc.onmessage = (e: MessageEvent<AudienceMsg>) => {
  const m = e.data
  if (!m) return
  if (m.type === 'deck') {
    deck.value = parseDeck(m.deckText)
    setPos(m.index, m.revealed)
  } else if (m.type === 'pos') setPos(m.index, m.revealed)
  else if (m.type === 'key') window.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, cancelable: true }))
  else if (m.type === 'voice-res') {
    pending.get(m.id)?.(m.blob)
    pending.delete(m.id)
  }
}
function setPos(index: number, rows: number) {
  // Only a real change triggers the watcher below, so only then expect an echo.
  if (index !== current.value || rows !== revealed.value) lastRemote = `${index}:${rows}`
  current.value = index
  revealed.value = rows
}
watch([current, revealed], ([index, rows]) => {
  const pos = `${index}:${rows}`
  if (pos === lastRemote) lastRemote = '' // the echo of what just arrived: consume it
  else post({ type: 'pos', index, revealed: rows })
})

// Fullscreen: F, or the first click / key — the browser only allows it then.
function goFullscreen() {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {})
}
function onKey(e: KeyboardEvent) {
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault()
    if (document.fullscreenElement) void document.exitFullscreen()
    else goFullscreen()
  } else if (e.isTrusted && e.key !== 'Escape') goFullscreen()
}
const onFsChange = () => (fullscreen.value = !!document.fullscreenElement)
const bye = () => post({ type: 'bye' })

onMounted(() => {
  document.title = 'Dek · Audience'
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('pointerdown', goFullscreen)
  document.addEventListener('fullscreenchange', onFsChange)
  window.addEventListener('pagehide', bye)
  post({ type: 'hello' })
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  window.removeEventListener('pointerdown', goFullscreen)
  document.removeEventListener('fullscreenchange', onFsChange)
  window.removeEventListener('pagehide', bye)
  bye()
  bc.close()
})
</script>

<template>
  <div class="aud">
    <DeckView
      v-if="deck"
      v-model="current"
      v-model:revealed="revealed"
      v-model:drawing="drawing"
      v-model:narrating="narrating"
      :deck="deck"
      :editable="false"
      :nav-enabled="true"
    />
    <div v-else class="msg">Waiting for the presenter view…</div>
    <div v-if="deck && !fullscreen" class="hint">Click or press F for fullscreen</div>
  </div>
</template>

<style scoped>
.aud {
  position: fixed;
  inset: 0;
  display: flex;
  background: #050506;
}
.msg {
  margin: auto;
  color: #888;
  font-family: 'JetBrains Mono', monospace;
}
.hint {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(18, 20, 24, 0.85);
  color: rgba(230, 236, 242, 0.75);
  font: 12px 'JetBrains Mono', monospace;
  pointer-events: none;
}
</style>
