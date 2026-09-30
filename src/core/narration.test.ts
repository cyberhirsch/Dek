import { describe, expect, it } from 'vitest'
import { deckSpokenLines, lineId, narrationBeats, speechChunks, spokenLines } from './narration'

describe('spokenLines', () => {
  it('takes only the > lines, marker removed', () => {
    const notes = 'Ask for hands first.\n> Who has used Blender?\ndelete? cut for time\n>No wrong answers.\n>   '
    expect(spokenLines(notes)).toEqual(['Who has used Blender?', 'No wrong answers.'])
  })

  it('is empty without notes', () => {
    expect(spokenLines(undefined)).toEqual([])
    expect(spokenLines('just private notes')).toEqual([])
  })
})

describe('narrationBeats', () => {
  it('one beat per line on a plain slide', () => {
    expect(narrationBeats(['a', 'b'])).toEqual([{ text: 'a' }, { text: 'b' }])
  })

  it('pairs each line with the row it reveals', () => {
    expect(narrationBeats(['a', 'b'], 2)).toEqual([
      { reveal: 1, text: 'a' },
      { reveal: 2, text: 'b' },
    ])
  })

  it('still reveals every row when there are fewer lines', () => {
    expect(narrationBeats(['a'], 3)).toEqual([{ reveal: 1, text: 'a' }, { reveal: 2 }, { reveal: 3 }])
  })

  it('says extra lines with everything shown', () => {
    expect(narrationBeats(['a', 'b', 'c'], 2)).toEqual([
      { reveal: 1, text: 'a' },
      { reveal: 2, text: 'b' },
      { reveal: 2, text: 'c' },
    ])
  })
})

describe('speechChunks', () => {
  it('keeps short text whole', () => {
    expect(speechChunks('One. Two.')).toEqual(['One. Two.'])
  })

  it('splits long text at sentence ends', () => {
    const s = 'A'.repeat(150) + '. ' + 'B'.repeat(150) + '.'
    expect(speechChunks(s)).toEqual(['A'.repeat(150) + '.', 'B'.repeat(150) + '.'])
  })
})

describe('lineId', () => {
  it('is the first 12 hex digits of SHA-1 over the spoken text', async () => {
    // sha1("hello") = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
    expect(await lineId('hello')).toBe('aaf4c61ddcc5')
  })

  it('changes when the line is edited, so stale audio is never played', async () => {
    expect(await lineId('Who has used Blender?')).not.toBe(await lineId('Who has used Maya?'))
  })
})

describe('deckSpokenLines', () => {
  it('lists every spoken line once, in deck order, with its id', async () => {
    const lines = await deckSpokenLines([{ notes: '> One.\nprivate' }, {}, { notes: '> Two.\n> One.' }])
    expect(lines.map((l) => l.text)).toEqual(['One.', 'Two.'])
    expect(lines[0].id).toBe(await lineId('One.'))
  })
})
