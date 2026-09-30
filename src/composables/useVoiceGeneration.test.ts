import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import type { Deck } from '../core/types'
import { lineId } from '../core/narration'

const api = vi.hoisted(() => ({
  files: [] as string[],
  deleted: [] as string[],
  written: [] as string[],
  manifest: null as string | null,
}))
vi.mock('../api', () => ({
  listVoiceFiles: async () => [...api.files],
  readVoiceFile: async (name: string) => (name === 'voiced.json' && api.manifest ? new Blob([api.manifest]) : null),
  deleteVoiceFile: async (name: string) => {
    api.deleted.push(name)
    api.files = api.files.filter((f) => f !== name)
  },
  writeVoiceFile: async (name: string, data: Blob) => {
    if (name === 'voiced.json') {
      api.manifest = await data.text()
      return true
    }
    api.written.push(name)
    if (!api.files.includes(name)) api.files.push(name)
    return true
  },
}))
const helper = vi.hoisted(() => ({ start: vi.fn(), respell: {} as Record<string, string> }))
vi.mock('../render/helper', () => ({
  helperStatus: async () => ({ running: true, paired: true, voiceTool: true, busy: false }),
  helperRespellings: async () => helper.respell,
  startVoiceJob: (...a: unknown[]) => helper.start(...a),
  voiceJob: async () => ({ id: 'j', state: 'done', total: 1, ready: [] }),
  voiceJobAudio: async () => new Blob(['RIFF']),
  cancelVoiceJob: async () => {},
}))

import { useVoiceGeneration } from './useVoiceGeneration'
import { voiceSettings } from '../render/voice'

const deckWith = (notes: string): Deck => ({ config: {}, slides: [{ layout: 'text', notes }] }) as Deck

/** Real async work (hashing, mocked calls) interleaved with fake timers:
 *  a few real milliseconds, taken with the timer from before faking, so it
 *  holds up under a busy parallel test run. */
const realSetTimeout = globalThis.setTimeout
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => realSetTimeout(r, 10))
}
async function settle(ms: number) {
  await flush()
  await vi.advanceTimersByTimeAsync(ms)
  await nextTick()
  await flush()
  await vi.advanceTimersByTimeAsync(0)
  await flush()
}
let scope: EffectScope
function make(deck: Deck, isRecording?: () => boolean) {
  return scope.run(() => useVoiceGeneration(ref(deck), isRecording))!
}

describe('auto-voicing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    scope = effectScope()
    api.files = []
    api.deleted = []
    api.written = []
    api.manifest = null
    helper.respell = {}
    helper.start.mockReset()
    voiceSettings.value = { ...voiceSettings.value, autoVoice: false }
  })
  afterEach(() => {
    scope.stop()
    voiceSettings.value = { ...voiceSettings.value, autoVoice: false }
    vi.useRealTimers()
  })

  it('prunes stale files once every line has audio', async () => {
    const id = await lineId('Hello there.')
    api.files = [`${id}.wav`, 'aaaaaaaaaaaa.wav']
    const g = make(deckWith('> Hello there.'))
    voiceSettings.value = { ...voiceSettings.value, autoVoice: true }
    await settle(2000)
    expect(api.deleted).toEqual(['aaaaaaaaaaaa.wav'])
    expect(g.autoState.value).toBe('Every line has audio.')
  })

  it('waits out a busy graphics card quietly, and keeps stale files meanwhile', async () => {
    api.files = ['aaaaaaaaaaaa.wav']
    helper.start.mockRejectedValue(new Error('Only 2.0 GB free on the GPU; the voice needs 18 GB.'))
    const g = make(deckWith('> A new line.'))
    voiceSettings.value = { ...voiceSettings.value, autoVoice: true }
    await settle(2000)
    expect(helper.start).toHaveBeenCalledTimes(1)
    expect(g.error.value).toBe('')
    expect(g.autoState.value).toMatch(/Graphics card busy/)
    expect(api.deleted).toEqual([])
    await settle(3 * 60_000)
    expect(helper.start).toHaveBeenCalledTimes(2)
  })

  it('starts nothing during a recording', async () => {
    const g = make(deckWith('> A new line.'), () => true)
    voiceSettings.value = { ...voiceSettings.value, autoVoice: true }
    await settle(2000)
    expect(helper.start).not.toHaveBeenCalled()
    expect(g.autoState.value).toMatch(/recording/)
  })

  it('leaves German narration to the browser voice', async () => {
    const g = make(deckWith('> Das ist die erste Folie, und wir schauen uns die Gesetze an.'))
    voiceSettings.value = { ...voiceSettings.value, autoVoice: true }
    await settle(2000)
    expect(helper.start).not.toHaveBeenCalled()
    expect(g.autoState.value).toMatch(/German/)
  })

  it('voices the missing lines when the switch is on', async () => {
    helper.start.mockResolvedValue({ id: 'j', state: 'loading', total: 1, ready: [] })
    make(deckWith('> A new line.'))
    voiceSettings.value = { ...voiceSettings.value, autoVoice: true }
    await settle(2000)
    expect(helper.start).toHaveBeenCalledTimes(1)
    expect(helper.start.mock.calls[0][0]).toEqual([{ id: await lineId('A new line.'), text: 'A new line.' }])
  })

  it('does nothing while the switch is off', async () => {
    make(deckWith('> A new line.'))
    await settle(60_000)
    expect(helper.start).not.toHaveBeenCalled()
  })

  it('voices a line again when its respelling changes, and records the new one', async () => {
    const id = await lineId('The Gestalt laws.')
    api.files = [`${id}.wav`]
    // voiced before "Gestalt" was respelled: no manifest entry
    helper.respell = { Gestalt: 'Gheshtalt' }
    helper.start.mockResolvedValue({ id: 'j', state: 'loading', total: 1, ready: [] })
    const g = make(deckWith('> The Gestalt laws.'))
    await g.refresh()
    expect(g.missing.value.map((l) => l.id)).toEqual([id])
  })

  it('keeps a file whose respellings are unchanged', async () => {
    const id = await lineId('The Gestalt laws.')
    api.files = [`${id}.wav`]
    helper.respell = { Gestalt: 'Gheshtalt' }
    const { respellingStamp } = await import('../core/narration')
    api.manifest = JSON.stringify({ version: 1, lines: { [id]: await respellingStamp('The Gestalt laws.', helper.respell) } })
    const g = make(deckWith('> The Gestalt laws.'))
    await g.refresh()
    expect(g.missing.value).toEqual([])
  })
})
