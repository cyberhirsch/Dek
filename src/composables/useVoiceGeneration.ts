// ⚙ → Local voice: how much of the deck has audio, and making the rest through
// the Dek Helper. The helper voices the lines; each finished WAV is fetched and
// written into this deck's `voice/` folder right away, so narration can use it
// before the whole job is done.
//
// With "Voice new lines automatically" on, this keeps the deck voiced by
// itself: when a deck opens, ~30 s after the last change to its spoken text
// (typed here or written to deck.md from outside), it voices what's missing.
// A busy graphics card (ComfyUI, a render) is waited out quietly; nothing runs
// during an MP4 recording; and stale files are pruned only once every line
// has audio, so undoing an edit in the same session still finds its file.
import { ref, watch, type Ref } from 'vue'
import type { Deck } from '../core/types'
import {
  VOICE_MANIFEST,
  deckSpokenLines,
  looksGerman,
  respellingOutdated,
  respellingStamp,
  unknownVoiceTags,
  type VoiceManifest,
} from '../core/narration'
import { deleteVoiceFile, listVoiceFiles, readVoiceFile, writeVoiceFile } from '../api'
import { voiceSettings } from '../render/voice'
import {
  cancelVoiceJob,
  helperRespellings,
  helperStatus,
  startVoiceJob,
  voiceJob,
  voiceJobAudio,
  type HelperJob,
  type HelperStatus,
} from '../render/helper'

type Outcome = 'done' | 'nothing' | 'busy' | 'error' | 'stopped'

/** The helper's ways of saying "the graphics card is taken, try later". */
const GPU_BUSY = /free on the GPU|ran out of memory|Already voicing/i

const OPEN_DELAY = 3_000
const EDIT_DELAY = 30_000
const BUSY_RETRY = 3 * 60_000
const WAIT_RETRY = 2 * 60_000
const ERROR_RETRY = 5 * 60_000
const RECORDING_RETRY = 60_000

export function useVoiceGeneration(deck: Ref<Deck | null>, isRecording: () => boolean = () => false) {
  const coverage = ref<{ have: number; total: number } | null>(null)
  const missing = ref<{ id: string; text: string }[]>([])
  const stale = ref<string[]>([])
  const german = ref(false)
  /** Direction tags in the deck that the voice tool ignores, e.g. [excited]. */
  const unknownTags = ref<string[]>([])
  const status = ref<HelperStatus | null>(null)
  const job = ref<HelperJob | null>(null)
  const written = ref(0)
  const error = ref('')
  /** One quiet line about what auto-voicing is doing. */
  const autoState = ref('')
  let stopRequested = false

  // voice/voiced.json: which respellings each file was voiced with (see
  // core/narration.ts). A line whose respellings have changed since counts as
  // missing, so a fix in pronunciations.json reaches the audio too.
  let manifest: VoiceManifest = { version: 1, lines: {} }
  const stamps = new Map<string, string>()
  async function readManifest(): Promise<VoiceManifest | null> {
    try {
      const b = await readVoiceFile(VOICE_MANIFEST)
      if (!b) return null
      const m = JSON.parse(await b.text()) as Partial<VoiceManifest>
      return m && typeof m.lines === 'object' && m.lines ? { version: 1, lines: { ...m.lines } } : null
    } catch {
      return null
    }
  }
  async function saveManifest() {
    await writeVoiceFile(VOICE_MANIFEST, new Blob([JSON.stringify(manifest, null, 1)], { type: 'application/json' }))
  }

  async function refresh() {
    status.value = await helperStatus()
    if (!deck.value) return
    const lines = await deckSpokenLines(deck.value.slides)
    const files = await listVoiceFiles().catch(() => [] as string[])
    const have = new Set(files)
    const wanted = new Set(lines.map((l) => `${l.id}.wav`))
    // Without the helper the respellings can't be read: judge nothing outdated.
    const respell = status.value.running ? await helperRespellings() : null
    const stored = await readManifest()
    manifest = stored ?? { version: 1, lines: {} }
    stamps.clear()
    for (const l of lines) stamps.set(l.id, respell ? await respellingStamp(l.text, respell) : (manifest.lines[l.id] ?? ''))
    missing.value = lines.filter(
      (l) => !have.has(`${l.id}.wav`) || (respell != null && respellingOutdated(stored, l.id, stamps.get(l.id) ?? '')),
    )
    stale.value = files.filter((f) => /^[0-9a-f]{12}\.wav$/.test(f) && !wanted.has(f))
    german.value = looksGerman(lines.map((l) => l.text))
    unknownTags.value = [...new Set(lines.flatMap((l) => unknownVoiceTags(l.text)))]
    coverage.value = { have: lines.length - missing.value.length, total: lines.length }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  async function generate(cpuOffload = false, quiet = false): Promise<Outcome> {
    const target = deck.value
    if (!target || !missing.value.length) return 'nothing'
    if (job.value) return 'busy'
    if (!quiet) error.value = ''
    written.value = 0
    stopRequested = false
    // Asked for by hand: show the error. Automatic: no error box — a busy
    // graphics card is simply waited out, anything else goes on the status line.
    const fail = (message: string): Outcome => {
      const busy = GPU_BUSY.test(message)
      if (!quiet) error.value = message
      else if (!busy) autoState.value = message
      return busy ? 'busy' : 'error'
    }
    let j: HelperJob
    try {
      j = await startVoiceJob(missing.value, { cpuOffload })
    } catch (e) {
      return fail((e as Error).message)
    }
    job.value = j
    const saved = new Set<string>()
    let outcome: Outcome = 'done'
    try {
      for (;;) {
        // Another deck opened meanwhile: its folder isn't where these belong.
        // A recording started: the graphics card and disk are needed there.
        if (deck.value !== target || stopRequested || (quiet && isRecording())) {
          await cancelVoiceJob(j.id)
          outcome = 'stopped'
          break
        }
        j = await voiceJob(j.id)
        job.value = j
        for (const it of j.ready) {
          if (saved.has(it.id)) continue
          const wav = await voiceJobAudio(j.id, it.id)
          if (deck.value !== target) break
          if (!(await writeVoiceFile(`${it.id}.wav`, wav))) throw new Error('This deck has no folder to keep audio in — open it from disk.')
          manifest.lines[it.id] = stamps.get(it.id) ?? ''
          await saveManifest()
          saved.add(it.id)
          written.value = saved.size
          if (coverage.value) coverage.value = { ...coverage.value, have: coverage.value.have + 1 }
        }
        if (j.state === 'error') throw new Error(j.error ?? 'The voice tool failed.')
        if (j.state === 'done' || j.state === 'cancelled') break
        await sleep(1000)
      }
    } catch (e) {
      outcome = fail((e as Error).message)
    } finally {
      job.value = null
      await refresh()
    }
    return outcome
  }

  function stop() {
    stopRequested = true
  }

  // ── auto-voicing ──
  let timer: ReturnType<typeof setTimeout> | null = null
  let autoRunning = false
  function schedule(ms: number) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void autoRun(), ms)
  }

  async function autoRun() {
    timer = null
    if (!voiceSettings.value.autoVoice || !deck.value) return (autoState.value = '')
    if (autoRunning || job.value) return schedule(EDIT_DELAY)
    if (isRecording()) {
      autoState.value = 'Waiting for the recording to end.'
      return schedule(RECORDING_RETRY)
    }
    autoRunning = true
    try {
      await refresh()
      const s = status.value
      if (!s?.running || !s.paired || !s.voiceTool) {
        autoState.value = !s?.running ? 'Waiting for the Dek Helper.' : !s.paired ? 'Restart the Dek Helper (older version).' : 'The Dek Helper has no voice tool.'
        return schedule(WAIT_RETRY)
      }
      if (german.value) {
        autoState.value = 'German narration stays on the browser voice.'
        return
      }
      if (!missing.value.length) {
        // Only now: while any line lacks audio, an undo may still want an old file.
        for (const f of stale.value) await deleteVoiceFile(f)
        const gone = Object.keys(manifest.lines).filter((id) => !stamps.has(id))
        for (const id of gone) delete manifest.lines[id]
        if (gone.length) await saveManifest()
        if (stale.value.length) await refresh()
        autoState.value = 'Every line has audio.'
        return
      }
      autoState.value = `Voicing ${missing.value.length} new ${missing.value.length === 1 ? 'line' : 'lines'}…`
      const outcome = await generate(false, true)
      if (outcome === 'busy') {
        autoState.value = 'Graphics card busy — trying again in 3 minutes.'
        return schedule(BUSY_RETRY)
      }
      if (outcome === 'error') return schedule(ERROR_RETRY)
      // done / stopped: look again (new edits, or pruning now due)
      schedule(outcome === 'stopped' ? RECORDING_RETRY : 1000)
    } finally {
      autoRunning = false
    }
  }

  // Triggers: a deck opens (or is reloaded after an outside edit), and the
  // spoken text changes — debounced, so a burst of typing is one job.
  watch(
    () => deck.value,
    () => voiceSettings.value.autoVoice && schedule(OPEN_DELAY),
  )
  watch(
    () =>
      deck.value?.slides.map((s) => `${s.notes ?? ''}\u0001${s.steps ? 1 : 0}\u0001${s.steps ? s.content ?? '' : ''}`).join('\u0002'),
    () => voiceSettings.value.autoVoice && schedule(EDIT_DELAY),
  )
  watch(
    () => voiceSettings.value.autoVoice,
    (on) => {
      if (on) schedule(1000)
      else {
        if (timer) clearTimeout(timer)
        autoState.value = ''
      }
    },
    { immediate: true },
  )

  return { coverage, missing, stale, german, unknownTags, status, job, written, error, autoState, refresh, generate, stop }
}
