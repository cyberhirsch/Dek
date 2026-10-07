// The voice narrate mode speaks with. An engine only has to say a piece of text
// and resolve when it's done (or when the signal aborts), so the browser voice
// used now can later be swapped for pre-generated audio from a local model
// without touching the narration loop.
import { ref, watch } from 'vue'
import { lineId, speechChunks } from '../core/narration'

export interface VoiceEngine {
  speak(text: string, signal: AbortSignal): Promise<void>
}

export interface VoiceSettings {
  /** `browser`: the browser's speech. `local`: audio files generated from the
   *  notes by a local voice model (scripts/narration-audio.mjs). */
  source: 'browser' | 'local'
  /** SpeechSynthesisVoice.voiceURI; empty = the browser's default voice. */
  voice: string
  rate: number
  /** Keep the open deck voiced by itself through the Dek Helper
   *  (composables/useVoiceGeneration.ts). Opt-in. */
  autoVoice: boolean
}

const KEY = 'dek:voice'
function load(): VoiceSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<VoiceSettings>
    return {
      source: v.source === 'local' ? 'local' : 'browser',
      voice: typeof v.voice === 'string' ? v.voice : '',
      rate: typeof v.rate === 'number' ? v.rate : 1,
      autoVoice: v.autoVoice === true,
    }
  } catch {
    return { source: 'browser', voice: '', rate: 1, autoVoice: false }
  }
}
/** Per browser, like the pen colour: which voices exist depends on the machine. */
export const voiceSettings = ref<VoiceSettings>(load())
watch(
  voiceSettings,
  (v) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v))
    } catch {
      /* private mode: settings just don't persist */
    }
  },
  { deep: true },
)

/** The voices this browser offers. They load asynchronously in Chrome, so the
 *  list fills in on `voiceschanged`. */
export const browserVoices = ref<SpeechSynthesisVoice[]>([])
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const read = () => (browserVoices.value = speechSynthesis.getVoices())
  read()
  speechSynthesis.addEventListener?.('voiceschanged', read)
}

function sayOne(text: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    const v = browserVoices.value.find((x) => x.voiceURI === voiceSettings.value.voice)
    if (v) {
      u.voice = v
      u.lang = v.lang
    }
    u.rate = voiceSettings.value.rate
    const done = () => {
      signal.removeEventListener('abort', stop)
      resolve()
    }
    const stop = () => {
      speechSynthesis.cancel()
      done()
    }
    u.onend = done
    u.onerror = done
    signal.addEventListener('abort', stop)
    speechSynthesis.speak(u)
  })
}

/** The browser's own speech synthesis (Web Speech API). */
export const browserVoice: VoiceEngine = {
  async speak(text, signal) {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel() // nothing left over from a previous slide
    for (const chunk of speechChunks(text)) {
      if (signal.aborted) return
      await sayOne(chunk, signal)
    }
  },
}

/** Play an audio blob to its end; stop and resolve early on abort. */
function playBlob(blob: Blob, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    const done = () => {
      signal.removeEventListener('abort', stop)
      URL.revokeObjectURL(url)
      resolve()
    }
    const stop = () => {
      audio.pause()
      done()
    }
    audio.onended = done
    audio.onerror = done
    signal.addEventListener('abort', stop)
    audio.play().catch(done)
  })
}

/**
 * Pre-generated audio: `voice/<lineId>.wav` in the deck's folder. A line
 * without a file (not generated yet, or edited since) is spoken by
 * `fallback` instead, so narration never goes silent or stale. No
 * speechChunks here: the generator already split and joined long lines.
 */
export function makeLocalVoice(
  read: (name: string) => Promise<Blob | null>,
  play: (blob: Blob, signal: AbortSignal) => Promise<void>,
  fallback: VoiceEngine,
): VoiceEngine {
  return {
    async speak(text, signal) {
      const blob = await read(`${await lineId(text)}.wav`).catch(() => null)
      if (signal.aborted) return
      if (blob && blob.size) return play(blob, signal)
      return fallback.speak(text, signal)
    },
  }
}

/** Where voice files come from: the deck's folder, normally. The audience
 *  window (opened by the presenter view) has no access to that folder and
 *  asks the presenter tab for each file instead (setVoiceFileReader). */
let voiceFileReader = async (name: string): Promise<Blob | null> => (await import('../api')).readVoiceFile(name)
export function setVoiceFileReader(read: (name: string) => Promise<Blob | null>) {
  voiceFileReader = read
}

export const localVoice: VoiceEngine = makeLocalVoice((name) => voiceFileReader(name), playBlob, browserVoice)

/** The engine the ⚙ menu has chosen. */
export function currentVoice(): VoiceEngine {
  return voiceSettings.value.source === 'local' ? localVoice : browserVoice
}
