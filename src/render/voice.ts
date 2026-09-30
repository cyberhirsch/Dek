// The voice narrate mode speaks with. An engine only has to say a piece of text
// and resolve when it's done (or when the signal aborts), so the browser voice
// used now can later be swapped for pre-generated audio from a local model
// without touching the narration loop.
import { ref, watch } from 'vue'
import { speechChunks } from '../core/narration'

export interface VoiceEngine {
  speak(text: string, signal: AbortSignal): Promise<void>
}

export interface VoiceSettings {
  /** SpeechSynthesisVoice.voiceURI; empty = the browser's default voice. */
  voice: string
  rate: number
}

const KEY = 'dek:voice'
function load(): VoiceSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<VoiceSettings>
    return { voice: typeof v.voice === 'string' ? v.voice : '', rate: typeof v.rate === 'number' ? v.rate : 1 }
  } catch {
    return { voice: '', rate: 1 }
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
