import { describe, it, expect } from 'vitest'
import { parseVideo, autoplaySrc, parseTimestamp } from './video'

const ID = 'QeT7eydBrJ4'

describe('parseTimestamp', () => {
  it('reads plain seconds and the h/m/s forms YouTube and Vimeo use', () => {
    expect(parseTimestamp('130')).toBe(130)
    expect(parseTimestamp('130s')).toBe(130)
    expect(parseTimestamp('2m10s')).toBe(130)
    expect(parseTimestamp('1h2m10s')).toBe(3730)
    expect(parseTimestamp('4m')).toBe(240)
  })

  it('rejects anything else', () => {
    expect(parseTimestamp('')).toBeUndefined()
    expect(parseTimestamp(null)).toBeUndefined()
    expect(parseTimestamp('2:10')).toBeUndefined()
    expect(parseTimestamp('soon')).toBeUndefined()
  })
})

describe('parseVideo — YouTube', () => {
  it('embeds a plain watch URL without a time window', () => {
    const p = parseVideo(`https://www.youtube.com/watch?v=${ID}`)!
    expect(p.provider).toBe('youtube')
    expect(p.embedUrl).toBe(`https://www.youtube.com/embed/${ID}`)
    expect(p.start).toBeUndefined()
  })

  it('keeps the start time from t= in any of its forms', () => {
    expect(parseVideo(`https://www.youtube.com/watch?v=${ID}&t=130`)!.embedUrl).toBe(`https://www.youtube.com/embed/${ID}?start=130`)
    expect(parseVideo(`https://www.youtube.com/watch?v=${ID}&t=2m10s`)!.start).toBe(130)
    expect(parseVideo(`https://youtu.be/${ID}?t=90`)!.start).toBe(90)
  })

  it('plays a segment with start= and end=', () => {
    const p = parseVideo(`https://www.youtube.com/watch?v=${ID}&start=100&end=145`)!
    expect(p.embedUrl).toBe(`https://www.youtube.com/embed/${ID}?start=100&end=145`)
    expect([p.start, p.end]).toEqual([100, 145])
  })

  it('ignores an end that is not after the start', () => {
    const p = parseVideo(`https://www.youtube.com/watch?v=${ID}&start=100&end=40`)!
    expect(p.end).toBeUndefined()
    expect(p.embedUrl).toBe(`https://www.youtube.com/embed/${ID}?start=100`)
  })

  it('finds the id when v is not the first parameter', () => {
    const p = parseVideo(`https://www.youtube.com/watch?t=45&v=${ID}`)!
    expect(p.id).toBe(ID)
    expect(p.start).toBe(45)
  })

  it('recognises shorts, live and embed URLs', () => {
    expect(parseVideo(`https://www.youtube.com/shorts/${ID}`)!.id).toBe(ID)
    expect(parseVideo(`https://www.youtube.com/live/${ID}`)!.id).toBe(ID)
    expect(parseVideo(`https://www.youtube.com/embed/${ID}?start=10`)!.start).toBe(10)
  })

  it('adds autoplay after the time window', () => {
    const p = parseVideo(`https://www.youtube.com/watch?v=${ID}&t=130`)!
    expect(autoplaySrc(p)).toBe(`https://www.youtube.com/embed/${ID}?start=130&autoplay=1&rel=0`)
    expect(autoplaySrc(parseVideo(`https://www.youtube.com/watch?v=${ID}`)!)).toBe(
      `https://www.youtube.com/embed/${ID}?autoplay=1&rel=0`,
    )
  })
})

describe('parseVideo — Vimeo and files', () => {
  it('passes a Vimeo start time as a fragment, after the query', () => {
    const p = parseVideo('https://vimeo.com/22439234#t=75s')!
    expect(p.embedUrl).toBe('https://player.vimeo.com/video/22439234#t=75s')
    expect(autoplaySrc(p)).toBe('https://player.vimeo.com/video/22439234?autoplay=1#t=75s')
  })

  it('leaves a plain Vimeo URL unchanged', () => {
    const p = parseVideo('https://vimeo.com/22439234')!
    expect(autoplaySrc(p)).toBe('https://player.vimeo.com/video/22439234?autoplay=1')
  })

  it('keeps a media fragment on a video file', () => {
    const p = parseVideo('Assets/clip.mp4#t=30,95')!
    expect(p.provider).toBe('file')
    expect(p.embedUrl).toBe('Assets/clip.mp4#t=30,95')
  })
})
