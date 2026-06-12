// Presenter popup sync. The presenter view runs in a separate window (?view=
// presenter) for a second monitor; this keeps it in lock-step over a
// BroadcastChannel — pushing the current index, answering the popup's "hello"
// with the actual deck, and accepting navigation back so advancing in either
// window moves both.
import { ref, watch, onUnmounted, type Ref } from 'vue'
import type { Deck, Slide, SlideElement } from '../core/types'
import { serializeDeck } from '../core/deck'

export interface PresenterDeps {
  deck: Ref<Deck | null>
  current: Ref<number>
  editMode: Ref<boolean>
  /** Set true when the popup is blocked so App can show the in-app overlay. */
  presenterOpen: Ref<boolean>
}

export function usePresenterSync({ deck, current, editMode, presenterOpen }: PresenterDeps) {
  const presenterWin = ref<Window | null>(null)
  const presenterBC = new BroadcastChannel('dek-presenter')

  presenterBC.onmessage = (e: MessageEvent) => {
    const m = e.data as { type?: string; index?: number }
    if (!m) return
    if (m.type === 'nav' && typeof m.index === 'number') current.value = m.index
    // The popup can't reach a File-System-opened deck (the handle lives only in
    // this window), so hand it the actual deck rather than letting it reload one.
    else if (m.type === 'hello') sendPresenterDeck()
    else if (m.type === 'bye') presenterWin.value = null
  }

  /** A File-System-opened deck's images are `blob:` URLs scoped to THIS window,
   *  so the popup (a separate document) can't load them. Inline those as data
   *  URLs before sending. http(s)/data URLs are already cross-window safe. */
  async function inlineBlobImages(d: Deck): Promise<Deck> {
    const cache = new Map<string, string>()
    async function conv(u?: string): Promise<string | undefined> {
      if (!u || !u.startsWith('blob:')) return u
      if (cache.has(u)) return cache.get(u)
      try {
        const blob = await (await fetch(u)).blob()
        const data = await new Promise<string>((res) => {
          const fr = new FileReader()
          fr.onload = () => res(fr.result as string)
          fr.readAsDataURL(blob)
        })
        cache.set(u, data)
        return data
      } catch {
        return u
      }
    }
    const slides = await Promise.all(
      d.slides.map(async (s) => {
        const n: Slide = { ...s }
        if (typeof n.image === 'string') n.image = await conv(n.image)
        if (typeof n.poster === 'string') n.poster = await conv(n.poster)
        if (Array.isArray(n.portraits)) n.portraits = await Promise.all(n.portraits.map((p) => (typeof p === 'string' ? conv(p) : p) as Promise<string>))
        if (Array.isArray(n.items)) {
          n.items = await Promise.all(
            n.items.map(async (it) =>
              it && typeof it === 'object' && 'image' in it ? { ...it, image: (await conv((it as { image: string }).image)) ?? '' } : it,
            ),
          )
        }
        if (Array.isArray(n.elements)) {
          n.elements = await Promise.all(
            n.elements.map(async (el) => {
              const e = { ...el } as SlideElement & { src?: string; poster?: string }
              if (typeof e.src === 'string') e.src = await conv(e.src)
              if (typeof e.poster === 'string') e.poster = await conv(e.poster)
              return e as SlideElement
            }),
          )
        }
        return n
      }),
    )
    return { config: d.config, slides }
  }

  /** Push the current deck + slide to the presenter popup. */
  async function sendPresenterDeck() {
    if (!deck.value) return
    const d = await inlineBlobImages(deck.value)
    presenterBC.postMessage({ type: 'deck', deckText: serializeDeck(d), index: current.value })
  }

  function openPresenter() {
    if (presenterWin.value && !presenterWin.value.closed) {
      presenterWin.value.focus()
      return
    }
    const url = new URL(location.href)
    url.searchParams.set('view', 'presenter')
    const w = window.open(url.toString(), 'dek-presenter', 'popup,width=1100,height=700')
    if (!w) {
      presenterOpen.value = true // popup blocked → fall back to the in-app overlay
      return
    }
    presenterWin.value = w
    if (editMode.value) editMode.value = false // the main window becomes the audience view
  }

  watch(current, (i) => presenterBC.postMessage({ type: 'state', index: i }))
  // Keep the popup's deck current when a different deck is loaded or edited.
  watch(deck, () => {
    if (presenterWin.value && !presenterWin.value.closed) sendPresenterDeck()
  })
  onUnmounted(() => presenterBC.close())

  return { openPresenter }
}
