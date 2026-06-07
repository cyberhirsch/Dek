<script setup lang="ts">
// Root of the standalone presenter popup (opened with ?view=presenter so it can
// live on a second monitor). It loads the deck itself and stays in sync with the
// main window over a BroadcastChannel: it receives the current slide index and
// sends navigation back, so advancing in either window moves both.
import { onMounted, onUnmounted, ref } from 'vue'
import type { Deck } from '../core/types'
import { fetchDeck } from '../api'
import Presenter from './Presenter.vue'

const deck = ref<Deck | null>(null)
const current = ref(0)
const error = ref<string | null>(null)
const bc = new BroadcastChannel('dek-presenter')

bc.onmessage = (e: MessageEvent) => {
  const m = e.data as { type?: string; index?: number }
  if (m?.type === 'state' && typeof m.index === 'number') current.value = m.index
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

onMounted(async () => {
  document.title = 'Dek · Presenter'
  try {
    deck.value = await fetchDeck()
  } catch (e) {
    error.value = (e as Error).message
  }
  // Ask the main window for the current slide so we open on the right one.
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
