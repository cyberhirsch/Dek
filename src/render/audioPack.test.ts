import { describe, expect, it } from 'vitest'
import { encodeMp3, toPcm16 } from './audioPack'

describe('toPcm16', () => {
  it('maps [-1, 1] to 16-bit and clamps beyond', () => {
    expect(Array.from(toPcm16(new Float32Array([0, 1, -1, 2, -2])))).toEqual([0, 32767, -32768, 32767, -32768])
  })
})

describe('encodeMp3', () => {
  it('produces MP3 frames, about 48 kbps for speech-length audio', async () => {
    const rate = 24000
    // one second of a 220 Hz tone
    const pcm = toPcm16(Float32Array.from({ length: rate }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 220 * i) / rate)))
    const mp3 = await encodeMp3(pcm, rate)
    // MPEG audio frame sync: 11 set bits
    expect(mp3[0]).toBe(0xff)
    expect(mp3[1] & 0xe0).toBe(0xe0)
    // 48 kbps ≈ 6 KB per second
    expect(mp3.length).toBeGreaterThan(4000)
    expect(mp3.length).toBeLessThan(9000)
  })
})
