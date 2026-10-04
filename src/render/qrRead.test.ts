import { describe, expect, it } from 'vitest'
import { linkFromPixels } from './qrRead'
import { qrMatrix, QUIET_ZONE } from './qr'

/** A QR code drawn as RGBA pixels (scale px per module, white quiet zone). */
async function pixels(text: string, scale = 6) {
  const m = await qrMatrix(text)
  const n = m.length + QUIET_ZONE * 2
  const size = n * scale
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let y = 0; y < m.length; y++)
    for (let x = 0; x < m.length; x++)
      if (m[y][x])
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const i = (((y + QUIET_ZONE) * scale + dy) * size + (x + QUIET_ZONE) * scale + dx) * 4
            data[i] = data[i + 1] = data[i + 2] = 0
          }
  return { data, size }
}

describe('linkFromPixels', () => {
  it('reads the link from a QR code', async () => {
    const { data, size } = await pixels('https://cyberhirsch.github.io/Dek/')
    expect(await linkFromPixels(data, size, size)).toBe('https://cyberhirsch.github.io/Dek/')
  })

  it('ignores a QR code that holds no web link', async () => {
    const { data, size } = await pixels('WIFI:S:campus;T:WPA;P:secret;;')
    expect(await linkFromPixels(data, size, size)).toBeUndefined()
  })

  it('finds nothing in a blank picture', async () => {
    const data = new Uint8ClampedArray(100 * 100 * 4).fill(255)
    expect(await linkFromPixels(data, 100, 100)).toBeUndefined()
  })
})
