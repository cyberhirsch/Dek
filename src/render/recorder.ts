// Recording a narrated presentation to MP4, in the browser.
//
// The browser records what it shows (getDisplayMedia): the picked tab, window
// or screen, with its sound. That includes embedded YouTube/Vimeo players,
// which a page can't otherwise read. When the Dek tab itself is picked, the
// recording is narrowed to the slide (Element Capture, else Region Capture),
// so the HUD and the rest of the window stay out of it.
//
// Sound: tab audio carries videos and audio files. The browser's own speech
// voices on Windows usually play outside the tab; to get them, record the
// entire screen with "Also share system audio" ticked.

const MP4_TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
]

/** The MP4 flavour this browser can record, if any (Chrome 126+, Edge, Brave). */
export function mp4Type(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return MP4_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
}

export interface Recording {
  /** Stop and hand over the video. */
  stop(): Promise<Blob>
  /** Called when the recording ends from the browser's side ("Stop sharing"). */
  onEnded(cb: () => void): void
  readonly started: number
}

type CaptureWindow = Window & {
  RestrictionTarget?: { fromElement(el: Element): Promise<unknown> }
  CropTarget?: { fromElement(el: Element): Promise<unknown> }
}
type CaptureTrack = MediaStreamTrack & {
  restrictTo?: (t: unknown) => Promise<void>
  cropTo?: (t: unknown) => Promise<void>
}

/** Narrow a self-capture to `el`. Silently does nothing when the picked
 *  surface isn't this tab or the browser lacks the APIs. */
async function narrowTo(track: CaptureTrack, el: HTMLElement) {
  const w = window as CaptureWindow
  try {
    if (w.RestrictionTarget && track.restrictTo) return await track.restrictTo(await w.RestrictionTarget.fromElement(el))
  } catch {
    /* fall through to cropping */
  }
  try {
    if (w.CropTarget && track.cropTo) await track.cropTo(await w.CropTarget.fromElement(el))
  } catch {
    /* not this tab: record the whole surface */
  }
}

export async function startRecording(slideEl: HTMLElement): Promise<Recording> {
  const mimeType = mp4Type()
  if (!mimeType) throw new Error('This browser can’t record MP4. Chrome, Edge or Brave (2024 or newer) can.')
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: true,
    // Chrome-specific hints: offer this tab first, allow system audio.
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    systemAudio: 'include',
    surfaceSwitching: 'exclude',
  } as DisplayMediaStreamOptions)
  const [video] = stream.getVideoTracks()
  if (video) await narrowTo(video as CaptureTrack, slideEl)

  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  let endedCb: (() => void) | null = null
  let stopped: Promise<Blob> | null = null
  const stop = () => {
    stopped ??= new Promise<Blob>((resolve) => {
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        resolve(new Blob(chunks, { type: 'video/mp4' }))
      }
      if (rec.state !== 'inactive') rec.stop()
      else rec.onstop?.(new Event('stop'))
    })
    return stopped
  }
  video?.addEventListener('ended', () => endedCb?.())
  rec.start(1000)
  return { stop, onEnded: (cb) => (endedCb = cb), started: Date.now() }
}

/** Save the video: a real file picker where the browser has one. */
export async function saveVideo(blob: Blob, suggestedName: string) {
  const w = window as Window & {
    showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>
  }
  if (w.showSaveFilePicker) {
    const handle = await w.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
    })
    const out = await handle.createWritable()
    await out.write(blob)
    await out.close()
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = suggestedName
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
