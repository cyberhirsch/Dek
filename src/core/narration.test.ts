import { describe, expect, it } from 'vitest'
import { deckSpokenLines, lineId, looksGerman, narrationBeats, slideBeats, speechChunks, spokenLines } from './narration'

describe('spokenLines', () => {
  it('starts a passage at each >, marker removed', () => {
    expect(spokenLines('> Who has used Blender?\n>No wrong answers.')).toEqual(['Who has used Blender?', 'No wrong answers.'])
  })

  it('keeps the lines after a > in its passage, up to the next >', () => {
    const notes = '> First point.\nIt goes on here.\n\nAnd here.\n> Second point.\nMore.'
    expect(spokenLines(notes)).toEqual(['First point. It goes on here. And here.', 'Second point. More.'])
  })

  it('keeps notes before the first > private', () => {
    expect(spokenLines('delete? cut for time\nAsk for hands.\n> Spoken.')).toEqual(['Spoken.'])
  })

  it('is empty without notes or without any >', () => {
    expect(spokenLines(undefined)).toEqual([])
    expect(spokenLines('just private notes')).toEqual([])
    expect(spokenLines('>   ')).toEqual([])
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

  it('gives each row its share of one long spoken paragraph', () => {
    // the reported case: one > line, three rows — each row gets a sentence
    const beats = narrationBeats(['Names reveal purpose. Parenting reveals dependency. Collections group things.'], 3)
    expect(beats).toEqual([
      { reveal: 1, text: 'Names reveal purpose.' },
      { reveal: 2, text: 'Parenting reveals dependency.' },
      { reveal: 3, text: 'Collections group things.' },
    ])
  })

  it('hands sentences to the row they talk about', () => {
    const rows = ['Names reveal purpose', 'Parenting reveals dependency']
    const beats = narrationBeats(
      ['A good name says what an object is for. Nobody should have to guess. Parenting shows what depends on what.'],
      2,
      rows,
    )
    expect(beats).toEqual([
      { reveal: 1, text: 'A good name says what an object is for. Nobody should have to guess.' },
      { reveal: 2, text: 'Parenting shows what depends on what.' },
    ])
  })

  it('splits a list said as one sentence at its commas, matching the rows', () => {
    const rows = ['Proximity', 'Similarity', 'Closure']
    const beats = narrationBeats(["Here's the checklist: proximity, similarity, and closure."], 3, rows)
    expect(beats.map((b) => b.text)).toEqual(["Here's the checklist: proximity,", 'similarity,', 'and closure.'])
  })

  it('keeps numbers with commas whole', () => {
    expect(narrationBeats(['It costs 1,000 euros, then more.'], 2).map((b) => b.text)).toEqual(['It costs 1,000 euros,', 'then more.'])
  })

  it('still reveals every row when there are fewer sentences, starting at the first', () => {
    expect(narrationBeats(['Only one.'], 3)).toEqual([{ reveal: 1, text: 'Only one.' }, { reveal: 2 }, { reveal: 3 }])
  })

  it('spreads extra lines over the rows instead of piling them on the last', () => {
    expect(narrationBeats(['Aaa one.', 'Bbb two.', 'Ccc three.', 'Ddd four.'], 2)).toEqual([
      { reveal: 1, text: 'Aaa one. Bbb two.' },
      { reveal: 2, text: 'Ccc three. Ddd four.' },
    ])
  })
})

describe('slideBeats', () => {
  it('reads the build rows from the slide itself', () => {
    const beats = slideBeats({ steps: true, content: '- Alpha\n- Beta', notes: '> First sentence. Second sentence.' })
    expect(beats.map((b) => b.reveal)).toEqual([1, 2])
    expect(beats.map((b) => b.text)).toEqual(['First sentence.', 'Second sentence.'])
  })

  it('has no reveals on a slide without steps', () => {
    expect(slideBeats({ content: '- Alpha\n- Beta', notes: '> Hi.' })).toEqual([{ text: 'Hi.' }])
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
    const lines = await deckSpokenLines([{ notes: 'private\n> One.' }, {}, { notes: '> Two.\n> One.' }])
    expect(lines.map((l) => l.text)).toEqual(['One.', 'Two.'])
    expect(lines[0].id).toBe(await lineId('One.'))
  })
})

describe('looksGerman', () => {
  it('tells German narration from English', () => {
    expect(looksGerman(['Das ist die erste Folie, und wir schauen uns die Gestaltgesetze an.'])).toBe(true)
    expect(looksGerman(['This is the first slide, and we look at the Gestalt laws.'])).toBe(false)
  })

  it('counts nothing as English', () => {
    expect(looksGerman([])).toBe(false)
  })
})
