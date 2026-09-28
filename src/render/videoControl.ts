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
  if (state === 1) paused.set(frame, false)
  else if (state === 2 || state === 0) paused.set(frame, true)
  // Vimeo
  if (data.event === 'play') paused.set(frame, false)
  if (data.event === 'pause' || data.event === 'ended') paused.set(frame, true)
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
