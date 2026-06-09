<script setup lang="ts">
// Root of the standalone presenter popup (opened with ?view=presenter so it can
// live on a second monitor). The deck is handed to it by the main window over a
// BroadcastChannel — it must NOT reload the deck itself, because a File-System-
// opened deck's handle lives only in the main window (reloading would show the
// wrong/default deck). It receives the deck + current index and sends navigation
// back, so advancing in either window moves both.
import { onMounted, onUnmounted, ref } from 'vue'
import type { Deck } from '../core/types'
import { parseDeck } from '../core/deck'
import Presenter from './Presenter.vue'

const deck = ref<Deck | null>(null)
const current = ref(0)
const error = ref<string | null>(null)
const bc = new BroadcastChannel('dek-presenter')

bc.onmessage = (e: MessageEvent) => {
  const m = e.data as { type?: string; index?: number; deckText?: string }
  if (!m) return
  if (m.type === 'deck' && typeof m.deckText === 'string') {
    try {
      deck.value = parseDeck(m.deckText)
      if (typeof m.index === 'number') current.value = m.index
    } catch (err) {
      error.value = (err as Error).message
    }
  } else if (m.type === 'state' && typeof m.index === 'number') {
    current.value = m.index
  }
}
function setCurrent(i: number) {
  current.value = i
  bc.postMessage({ type: 'nav', index: i })
}
function bye() {
  bc.postMessage({ type: 'bye' })
}
function closeWin() {
  window.close()
}

onMounted(() => {
  document.title = 'Dek · Presenter'
  // Ask the main window for the deck + current slide; it replies with `deck`.
  bc.postMessage({ type: 'hello' })
  window.addEventListener('pagehide', bye)
})
onUnmounted(() => {
  window.removeEventListener('pagehide', bye)
  bye()
  bc.close()
})
</script>

<template>
  <Presenter
    v-if="deck"
    :deck="deck"
    :current="current"
    @update:current="setCurrent"
    @close="closeWin"
  />
  <div v-else-if="error" class="msg">{{ error }}</div>
  <div v-else class="msg">loading…</div>
</template>

<style scoped>
.msg {
  color: #888;
  font-family: 'JetBrains Mono', monospace;
  padding: 40px;
}
</style>
