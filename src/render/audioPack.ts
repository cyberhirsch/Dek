// Packing narration audio into a standalone HTML export.
//
// The generated voice files are 24 kHz WAVs, ~48 KB per second of speech; a
// lecture's worth embedded as data URLs would make the file enormous. Each is
// re-encoded as mono MP3 at 48 kbps (~6 KB per second, an eighth of the size),
// which is plenty for speech and plays in every browser. Browsers can't encode
// MP3 themselves, so the encoder (LAME, via @breezystack/lamejs) is loaded
// only when this export runs.

export const PACK_RATE = 24_000
export const PACK_KBPS = 48

/** Float samples in [-1, 1] → 16-bit PCM, as the encoder wants them. */
export function toPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** Encode mono 16-bit PCM as MP3 bytes. */
export async function encodeMp3(pcm: Int16Array, sampleRate: number, kbps = PACK_KBPS): Promise<Uint8Array> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const enc = new Mp3Encoder(1, sampleRate, kbps)
  const parts: Uint8Array[] = []
  const BLOCK = 1152 * 8
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const out = enc.encodeBuffer(pcm.subarray(i, i + BLOCK))
    if (out.length) parts.push(new Uint8Array(out))
  }
  const tail = enc.flush()
  if (tail.length) parts.push(new Uint8Array(tail))
  const bytes = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    bytes.set(p, at)
    at += p.length
  }
  return bytes
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  return btoa(bin)
}

/** A voice file (WAV) as a compact `data:audio/mpeg` URL. */
export async function packVoice(wav: Blob): Promise<string> {
  const decoded = await new OfflineAudioContext(1, 1, PACK_RATE).decodeAudioData(await wav.arrayBuffer())
  const mp3 = await encodeMp3(toPcm16(decoded.getChannelData(0)), decoded.sampleRate)
  return 'data:audio/mpeg;base64,' + toBase64(mp3)
}
