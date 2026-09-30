import { describe, expect, it } from 'vitest'
import { lineId } from '../core/narration'
import { makeLocalVoice, type VoiceEngine } from './voice'

function recorder() {
  const said: string[] = []
  const fallback: VoiceEngine = { speak: async (t) => void said.push(t) }
  return { said, fallback }
}

describe('local voice', () => {
  it('plays the generated file for a line that has one', async () => {
    const id = await lineId('Hello there.')
    const played: string[] = []
    const { said, fallback } = recorder()
    const v = makeLocalVoice(
      async (name) => (name === `${id}.wav` ? new Blob(['RIFF']) : null),
      async () => void played.push('wav'),
      fallback,
    )
    await v.speak('Hello there.', new AbortController().signal)
    expect(played).toEqual(['wav'])
    expect(said).toEqual([])
  })

  it('falls back to the other voice when the line has no file (new or edited)', async () => {
    const { said, fallback } = recorder()
    const v = makeLocalVoice(async () => null, async () => {}, fallback)
    await v.speak('Edited line.', new AbortController().signal)
    expect(said).toEqual(['Edited line.'])
  })

  it('falls back when reading fails', async () => {
    const { said, fallback } = recorder()
    const v = makeLocalVoice(
      async () => {
        throw new Error('no folder')
      },
      async () => {},
      fallback,
    )
    await v.speak('Line.', new AbortController().signal)
    expect(said).toEqual(['Line.'])
  })
})
