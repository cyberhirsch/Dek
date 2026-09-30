// ⚙ → Local voice: how much of the deck has audio, and generating the rest
// through the Dek Helper. The helper voices the lines; each finished WAV is
// fetched and written into this deck's `voice/` folder right away, so
// narration can use it before the whole job is done.
import { ref, type Ref } from 'vue'
import type { Deck } from '../core/types'
import { deckSpokenLines } from '../core/narration'
import { listVoiceFiles, writeVoiceFile } from '../api'
import {
  cancelVoiceJob,
  helperStatus,
  startVoiceJob,
  voiceJob,
  voiceJobAudio,
  type HelperJob,
  type HelperStatus,
} from '../render/helper'

export function useVoiceGeneration(deck: Ref<Deck | null>) {
  const coverage = ref<{ have: number; total: number } | null>(null)
  const missing = ref<{ id: string; text: string }[]>([])
  const status = ref<HelperStatus | null>(null)
  const job = ref<HelperJob | null>(null)
  const written = ref(0)
  const error = ref('')
  let stopRequested = false

  async function refresh() {
    status.value = await helperStatus()
    if (!deck.value) return
    const lines = await deckSpokenLines(deck.value.slides)
    const files = new Set(await listVoiceFiles().catch(() => [] as string[]))
    missing.value = lines.filter((l) => !files.has(`${l.id}.wav`))
    coverage.value = { have: lines.length - missing.value.length, total: lines.length }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  async function generate(cpuOffload = false) {
    const target = deck.value
    if (!target || !missing.value.length || job.value) return
    error.value = ''
    written.value = 0
    stopRequested = false
    let j: HelperJob
    try {
      j = await startVoiceJob(missing.value, { cpuOffload })
    } catch (e) {
      error.value = (e as Error).message
      return
    }
    job.value = j
    const saved = new Set<string>()
    try {
      for (;;) {
        // Another deck opened meanwhile: its folder isn't where these belong.
        if (deck.value !== target || stopRequested) {
          await cancelVoiceJob(j.id)
          break
        }
        j = await voiceJob(j.id)
        job.value = j
        for (const it of j.ready) {
          if (saved.has(it.id)) continue
          const wav = await voiceJobAudio(j.id, it.id)
          if (deck.value !== target) break
          if (!(await writeVoiceFile(`${it.id}.wav`, wav))) throw new Error('This deck has no folder to keep audio in — open it from disk.')
          saved.add(it.id)
          written.value = saved.size
          if (coverage.value) coverage.value = { ...coverage.value, have: coverage.value.have + 1 }
        }
        if (j.state === 'error') throw new Error(j.error ?? 'The voice tool failed.')
        if (j.state === 'done' || j.state === 'cancelled') break
        await sleep(1000)
      }
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      job.value = null
      await refresh()
    }
  }

  function stop() {
    stopRequested = true
  }

  return { coverage, missing, status, job, written, error, refresh, generate, stop }
}
