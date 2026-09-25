import { describe, expect, it } from 'vitest'
import { imageSize } from './imageSize'

const u8 = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le16 = (n: number) => [n & 255, (n >>> 8) & 255]
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255]
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]

describe('imageSize', () => {
  it('reads PNG from the IHDR chunk', () => {
    const png = u8([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(1600), be32(900), [8, 6, 0, 0, 0])
    expect(imageSize(png)).toEqual({ w: 1600, h: 900 })
  })

  it('reads PNG from base64 too, as the exporter holds it', () => {
    const png = u8([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(640), be32(480), [8, 6, 0, 0, 0])
    expect(imageSize(Buffer.from(png).toString('base64'))).toEqual({ w: 640, h: 480 })
  })

  it('reads GIF', () => {
    expect(imageSize(u8('GIF89a', le16(320), le16(200), [0, 0, 0, 0]))).toEqual({ w: 320, h: 200 })
  })

  it('reads JPEG past an EXIF segment to the start-of-frame', () => {
    const app1 = [0xff, 0xe1, 0x00, 0x10, ...new Array(14).fill(0)]
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 8, ...[0x03, 0x84], ...[0x05, 0x00], 3, ...new Array(9).fill(0)]
    // height 0x0384 = 900, width 0x0500 = 1280
    expect(imageSize(u8([0xff, 0xd8], app1, sof0))).toEqual({ w: 1280, h: 900 })
  })

  it('reads the three WebP flavours', () => {
    const riff = (chunk: string, body: number[]) => u8('RIFF', le32(0), 'WEBP', chunk, le32(0), body)
    expect(imageSize(riff('VP8X', [0, 0, 0, 0, ...le24(799), ...le24(599)]))).toEqual({ w: 800, h: 600 })
    // lossy: 3-byte frame tag, the 9d 01 2a start code, then 14-bit sizes
    expect(imageSize(riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(400), ...le16(300), 0, 0]))).toEqual({ w: 400, h: 300 })
    // VP8L: 14-bit width-1 and height-1 packed after a signature byte
    const bits = (99 & 0x3fff) | ((49 & 0x3fff) << 14)
    expect(imageSize(riff('VP8L', [0x2f, ...le32(bits), 0, 0, 0, 0]))).toEqual({ w: 100, h: 50 })
  })

  it('reads BMP, including a top-down (negative) height', () => {
    const bmp = (h: number) => u8('BM', new Array(16).fill(0), le32(256), le32(h >>> 0), [0, 0])
    expect(imageSize(bmp(128))).toEqual({ w: 256, h: 128 })
    expect(imageSize(bmp(-128))).toEqual({ w: 256, h: 128 })
  })

  it('reads SVG from width/height, else its viewBox', () => {
    const enc = (s: string) => new TextEncoder().encode(s)
    expect(imageSize(enc('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="700">'))).toEqual({ w: 1200, h: 700 })
    expect(imageSize(enc('<svg viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">'))).toEqual({ w: 1600, h: 900 })
  })

  it('is null for anything it does not recognise', () => {
    expect(imageSize(u8('not an image at all'))).toBeNull()
    expect(imageSize(u8([1, 2]))).toBeNull()
  })
})
