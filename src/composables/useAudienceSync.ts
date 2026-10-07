// Presenting with two windows: the original tab becomes the presenter view
// (current + next slide, notes, timer) and the slides open in an audience
// window (`?view=audience`) to drag onto the projector.
//
// The two talk over a BroadcastChannel:
// - the audience window says hello and gets the deck (pictures inlined — it
//   can't open a folder deck itself), and asks for voice files the same way;
// - the position — slide and build rows — is shared both ways, so → in either
//   window reveals the next row everywhere. (Sending only the slide number
//   used to leave build slides showing nothing but their heading.)
// - Space, the remote's ■ and Enter pressed in the presenter view are handed
//   to the audience window, where the video and the narration live.
import { onUnmounted, ref, watch, type Ref } from 'vue'
import type { Deck } from '../core/types'
import { serializeDeck } from '../core/deck'
import { inlineSlidePictures } from '../storage/slideTransfer'
import { mapSlideAssetRefs } from '../storage/assets'
import { readVoiceFile } from '../api'

export const AUDIENCE_CHANNEL = 'dek-audience'

export type AudienceMsg =
  | { type: 'hello' }
  | { type: 'bye' }
  | { type: 'deck'; deckText: string; index: number; revealed: number }
  | { type: 'pos'; index: number; revealed: number }
  | { type: 'key'; key: string }
  | { type: 'voice-req'; id: number; name: string }
  | { type: 'voice-res'; id: number; blob: Blob | null }

export interface AudienceDeps {
  deck: Ref<Deck | null>
  current: Ref<number>
  revealed: Ref<number>
  /** The presenter view in this tab is showing. */
  presenterOpen: Ref<boolean>
  error: Ref<string | null>
}

export function useAudienceSync({ deck, current, revealed, presenterOpen, error }: AudienceDeps) {
  const win = ref<Window | null>(null)
  const bc = new BroadcastChannel(AUDIENCE_CHANNEL)
  const post = (m: AudienceMsg) => bc.postMessage(m)
  const open = () => !!win.value && !win.value.closed

  async function sendDeck() {
    if (!deck.value) return
    // Inline every picture as data (a folder deck's files are this tab's
    // blob: URLs), minus the file-name parameter pasting uses.
    const slides = (await inlineSlidePictures(deck.value.slides)).map((s) =>
      mapSlideAssetRefs(s, (r) => r.replace(/^(data:[^,]*?);name=[^;,]+/, '$1')),
    )
    post({ type: 'deck', deckText: serializeDeck({ config: deck.value.config, slides }), index: current.value, revealed: revealed.value })
  }

  let lastRemote = ''
  bc.onmessage = (e: MessageEvent<AudienceMsg>) => {
    const m = e.data
    if (!m) return
    if (m.type === 'hello') void sendDeck()
    else if (m.type === 'pos') {
      if (m.index !== current.value || m.revealed !== revealed.value) lastRemote = `${m.index}:${m.revealed}`
      current.value = m.index
      revealed.value = m.revealed
    } else if (m.type === 'voice-req') {
      void readVoiceFile(m.name)
        .catch(() => null)
        .then((blob) => post({ type: 'voice-res', id: m.id, blob }))
    } else if (m.type === 'bye') {
      win.value = null
      presenterOpen.value = false
    }
  }

  watch([current, revealed], ([index, rows]) => {
    const pos = `${index}:${rows}`
    if (pos === lastRemote) lastRemote = ''
    else if (open()) post({ type: 'pos', index, revealed: rows })
  })
  // A different deck opened while presenting: hand it over.
  watch(deck, () => open() && void sendDeck())

  /** Open the audience window and turn this tab into the presenter view. */
  function openPresenter() {
    if (open()) {
      presenterOpen.value = true
      return
    }
    const url = new URL(location.href)
    url.searchParams.set('view', 'audience')
    const w = window.open(url.toString(), 'dek-audience', 'popup,width=1280,height=760')
    if (!w) {
      error.value = 'The browser blocked the audience window. Allow pop-ups for Dek, then press P again.'
      return
    }
    win.value = w
    presenterOpen.value = true
  }
  /** Leaving the presenter view closes the audience window too. */
  watch(presenterOpen, (on) => {
    if (!on && open()) win.value!.close()
    if (!on) win.value = null
  })
  /** A key pressed in the presenter view that the audience window acts on. */
  function sendKey(key: string) {
    if (open()) post({ type: 'key', key })
  }

  onUnmounted(() => {
    if (open()) win.value!.close()
    bc.close()
  })

  return { openPresenter, sendKey }
}
