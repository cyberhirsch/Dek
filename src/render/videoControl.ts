// Play/pause the video on the slide being presented, from the keyboard or a
// presenter remote (Space, and the remote's ■ button, which sends `.` or `b`).
//
// It works on the stage's DOM rather than on component state, so the layout
// video, canvas video elements and any future player all answer the same key
// without registering anywhere:
//
// - a poster with its play button (`[data-dek-play]`) — starts the video;
// - a `<video>` file — toggled directly;
// - a YouTube or Vimeo iframe (`[data-dek-video]`) — toggled through the
//   player's postMessage API. Each player reports its own play/pause back, so
//   the toggle stays right even after someone clicks the player's own button.

type Provider = 'youtube' | 'vimeo'

/** Last known state per player iframe. Missing = not heard from yet; players
 *  are started with autoplay, so that reads as playing. */
const paused = new WeakMap<HTMLIFrameElement, boolean>()
/** Players that have reported actually playing at least once. */
const started = new WeakSet<HTMLIFrameElement>()
/** Narrate mode waiting for a player to finish (playToEnd). */
const endWaiters = new WeakMap<HTMLIFrameElement, Array<() => void>>()
function notifyEnded(frame: HTMLIFrameElement) {
  const ws = endWaiters.get(frame) ?? []
  endWaiters.delete(frame)
  for (const w of ws) w()
}

function post(frame: HTMLIFrameElement, msg: unknown) {
  frame.contentWindow?.postMessage(JSON.stringify(msg), '*')
}

function providerOf(frame: HTMLIFrameElement): Provider | undefined {
  const p = frame.dataset.dekVideo
  return p === 'youtube' || p === 'vimeo' ? p : undefined
}

/** Call from the iframe's `load`: asks the player to report play/pause. */
export function listenToPlayer(frame: HTMLIFrameElement) {
  const p = providerOf(frame)
  if (p === 'youtube') post(frame, { event: 'listening', id: 1, channel: 'widget' })
  if (p === 'vimeo') {
    post(frame, { method: 'addEventListener', value: 'play' })
    post(frame, { method: 'addEventListener', value: 'pause' })
    post(frame, { method: 'addEventListener', value: 'ended' })
    post(frame, { method: 'addEventListener', value: 'finish' })
  }
}

function onPlayerMessage(e: MessageEvent) {
  if (!/^https:\/\/(www\.youtube\.com|www\.youtube-nocookie\.com|player\.vimeo\.com)$/.test(e.origin)) return
  let data: { event?: string; info?: { playerState?: number } }
  try {
    data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
  } catch {
    return
  }
  const frame = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe[data-dek-video]')).find(
    (f) => f.contentWindow === e.source,
  )
  if (!frame || !data) return
  // YouTube: 1 playing, 2 paused, 0 ended.
  const state = data.info?.playerState
  if (state === 1) {
    paused.set(frame, false)
    started.add(frame)
  }
  else if (state === 2 || state === 0) paused.set(frame, true)
  if (state === 0) notifyEnded(frame)
  // Vimeo ignores event requests sent before its player is ready, and the
  // iframe's `load` comes earlier than that: ask again once it says so.
  if (data.event === 'ready' && providerOf(frame) === 'vimeo') listenToPlayer(frame)
  if (data.event === 'play') {
    paused.set(frame, false)
    started.add(frame)
  }
  // Its postMessage API calls the end `finish`; newer docs say `ended`.
  const ended = data.event === 'ended' || data.event === 'finish'
  if (data.event === 'pause' || ended) paused.set(frame, true)
  if (ended) notifyEnded(frame)
}
if (typeof window !== 'undefined') window.addEventListener('message', onPlayerMessage)

function toggleFrame(frame: HTMLIFrameElement): boolean {
  const p = providerOf(frame)
  if (!p) return false
  const wasPaused = paused.get(frame) ?? false
  if (p === 'youtube') post(frame, { event: 'command', func: wasPaused ? 'playVideo' : 'pauseVideo', args: '' })
  else post(frame, { method: wasPaused ? 'play' : 'pause' })
  // Optimistic; the player's own report corrects it if the command didn't land.
  paused.set(frame, !wasPaused)
  return true
}

/** Toggle the first video inside `root`. False when there's none, so the key
 *  can do its usual job (Space advances on a slide without a video). */
export function toggleVideoIn(root: HTMLElement): boolean {
  const video = root.querySelector<HTMLVideoElement>('video')
  if (video) {
    if (video.paused) void video.play().catch(() => {})
    else video.pause()
    return true
  }
  const frame = root.querySelector<HTMLIFrameElement>('iframe[data-dek-video]')
  if (frame && toggleFrame(frame)) return true
  const play = root.querySelector<HTMLButtonElement>('[data-dek-play]:not(:disabled)')
  if (play) {
    play.click()
    return true
  }
  return false
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The playing video inside `root`, once a poster's play button has swapped
 *  it in — it mounts a moment after the click. */
async function playerIn(root: HTMLElement): Promise<HTMLVideoElement | HTMLIFrameElement | null> {
  for (let i = 0; i < 30; i++) {
    const v = root.querySelector<HTMLVideoElement>('video') ?? root.querySelector<HTMLIFrameElement>('iframe[data-dek-video]')
    if (v) return v
    await sleep(100)
  }
  return null
}

/** Whether the slide inside `root` has a video Dek can play and follow. */
export function slideHasVideo(root: HTMLElement): boolean {
  return !!root.querySelector('[data-dek-play]:not(:disabled), video, iframe[data-dek-video]')
}

/** A video that hasn't started this long after Dek pressed play (autoplay
 *  blocked by the browser, a dead link) is skipped, so narration never hangs. */
const START_TIMEOUT = 15_000

/**
 * Narrate mode: start the slide's video and wait until it has played to its
 * end (or its `end=` segment). False when the slide has no video. A player Dek
 * can't follow (neither YouTube, Vimeo nor a file) isn't waited for. Resolves
 * early when `signal` aborts.
 */
export async function playToEnd(root: HTMLElement, signal: AbortSignal): Promise<boolean> {
  if (!slideHasVideo(root)) return false
  const play = root.querySelector<HTMLButtonElement>('[data-dek-play]:not(:disabled)')
  if (play) play.click()
  const player = await playerIn(root)
  if (!player || signal.aborted) return !!player
  if (player instanceof HTMLIFrameElement && !providerOf(player)) return true
  await new Promise<void>((resolve) => {
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      clearTimeout(watchdog)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish)
    if (player instanceof HTMLVideoElement) {
      if (player.ended) return finish()
      let playing = false
      player.addEventListener('playing', () => (playing = true), { once: true })
      player.addEventListener('ended', finish, { once: true })
      player.addEventListener('error', finish, { once: true })
      if (player.paused) void player.play().catch(() => {})
      watchdog = setTimeout(() => !playing && finish(), START_TIMEOUT)
    } else {
      endWaiters.set(player, [...(endWaiters.get(player) ?? []), finish])
      if (paused.get(player)) toggleFrame(player)
      watchdog = setTimeout(() => !started.has(player) && finish(), START_TIMEOUT)
    }
  })
  return true
}
