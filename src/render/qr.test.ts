import { describe, it, expect } from 'vitest'
import { matrixToPath, safeLink, urlFromDataTransfer, QUIET_ZONE, type QrMatrix } from './qr'

describe('matrixToPath', () => {
  it('sizes the viewBox to the module count plus a quiet zone on each side', () => {
    const m: QrMatrix = [
      [false, false],
      [false, false],
    ]
    const { viewBox, size } = matrixToPath(m)
    expect(size).toBe(2 + QUIET_ZONE * 2)
    expect(viewBox).toBe(`0 0 ${size} ${size}`)
  })

  it('offsets dark modules by the quiet zone', () => {
    const { d } = matrixToPath([[true]], 4)
    // single module at grid (0,0) → drawn at (4,4)
    expect(d).toBe('M4 4h1v1h-1z')
  })

  it('merges a horizontal run of dark modules into one rectangle', () => {
    const { d } = matrixToPath([[true, true, true]], 0)
    // three-wide run becomes a single width-3 rect, not three rects
    expect(d).toBe('M0 0h3v1h-3z')
    expect(d.match(/h3/g)).toHaveLength(1)
  })

  it('breaks a run at a light gap', () => {
    const { d } = matrixToPath([[true, false, true]], 0)
    expect(d).toBe('M0 0h1v1h-1zM2 0h1v1h-1z')
  })

  it('emits nothing for an all-light matrix', () => {
    expect(matrixToPath([[false, false]], 0).d).toBe('')
  })
})

describe('safeLink', () => {
  it('passes http(s) and mailto', () => {
    expect(safeLink('https://example.com')).toBe('https://example.com')
    expect(safeLink('http://x.io')).toBe('http://x.io')
    expect(safeLink('mailto:a@b.de')).toBe('mailto:a@b.de')
  })
  it('rejects dangerous or unknown schemes', () => {
    expect(safeLink('javascript:alert(1)')).toBeUndefined()
    expect(safeLink('data:text/html,x')).toBeUndefined()
    expect(safeLink('/relative')).toBeUndefined()
    expect(safeLink(undefined)).toBeUndefined()
  })
  it('trims surrounding whitespace', () => {
    expect(safeLink('  https://x.io  ')).toBe('https://x.io')
  })
})

describe('urlFromDataTransfer', () => {
  const dt = (data: Record<string, string>) =>
    ({ getData: (t: string) => data[t] ?? '' }) as unknown as DataTransfer

  it('prefers text/uri-list', () => {
    expect(urlFromDataTransfer(dt({ 'text/uri-list': 'https://a.io', 'text/plain': 'https://b.io' }))).toBe('https://a.io')
  })
  it('falls back to text/plain', () => {
    expect(urlFromDataTransfer(dt({ 'text/plain': 'https://b.io' }))).toBe('https://b.io')
  })
  it('skips uri-list comment lines', () => {
    expect(urlFromDataTransfer(dt({ 'text/uri-list': '# a comment\r\nhttps://c.io\r\n' }))).toBe('https://c.io')
  })
  it('returns undefined for plain text that is not a safe URL', () => {
    expect(urlFromDataTransfer(dt({ 'text/plain': 'just some words' }))).toBeUndefined()
    expect(urlFromDataTransfer(null)).toBeUndefined()
  })
})
