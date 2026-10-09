import { describe, expect, it } from 'vitest'
import { joinUrl, pbString, sessionIdFor, tally, today } from './client'

describe('sessionIdFor', () => {
  it('is the same for the same deck on the same day, and 15 hex digits', async () => {
    const a = await sessionIdFor('2026-10-09', 'Week 01 - Gestalt Principles')
    expect(a).toMatch(/^[0-9a-f]{15}$/)
    expect(await sessionIdFor('2026-10-09', '  Week 01 - Gestalt Principles ')).toBe(a)
  })

  it('differs by day and by deck', async () => {
    const a = await sessionIdFor('2026-10-09', 'Week 01')
    expect(await sessionIdFor('2026-10-10', 'Week 01')).not.toBe(a)
    expect(await sessionIdFor('2026-10-09', 'Week 02')).not.toBe(a)
  })
})

describe('today', () => {
  it('is the local date as YYYY-MM-DD', () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})

describe('pbString', () => {
  it('quotes a filter value, escaping quotes and backslashes', () => {
    expect(pbString('Which "outliner"?')).toBe('"Which \\"outliner\\"?"')
    expect(pbString('a\\b')).toBe('"a\\\\b"')
  })
})

describe('tally', () => {
  it('counts a choice poll in option order, zeros included', () => {
    expect(tally('choice', ['B', 'A', 'B'], ['A', 'B', 'C'])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 0],
    ])
  })

  it('counts a scale 1–5', () => {
    expect(tally('scale', ['5', '5', '3']).map(([, n]) => n)).toEqual([0, 0, 1, 0, 2])
  })

  it('groups words regardless of case and spacing, most frequent first', () => {
    expect(tally('words', ['Gestalt', 'gestalt ', 'Proximity', '  '])).toEqual([
      ['Gestalt', 2],
      ['Proximity', 1],
    ])
  })
})

describe('joinUrl', () => {
  it('points phones at the published Dek', () => {
    expect(joinUrl('abc123')).toBe('https://cyberhirsch.github.io/Dek/?join=abc123')
  })
})
