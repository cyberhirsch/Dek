import { describe, expect, it } from 'vitest'
import { TIMER_DEFAULT, TIMER_MAX, formatTimer, parseTimerInput, timerDuration, timerPhase } from './timer'

describe('timerDuration', () => {
  it('keeps whole seconds within 1 s … 99:59', () => {
    expect(timerDuration(90.4)).toBe(90)
    expect(timerDuration(999999)).toBe(TIMER_MAX)
  })

  it('falls back to five minutes for nonsense', () => {
    expect(timerDuration(undefined)).toBe(TIMER_DEFAULT)
    expect(timerDuration(-5)).toBe(TIMER_DEFAULT)
    expect(timerDuration('abc')).toBe(TIMER_DEFAULT)
  })
})

describe('formatTimer', () => {
  it('shows minutes and seconds, rounding a running count up', () => {
    expect(formatTimer(300)).toBe('5:00')
    expect(formatTimer(59.2)).toBe('1:00')
    expect(formatTimer(605)).toBe('10:05')
    expect(formatTimer(-3)).toBe('0:00')
  })
})

describe('timerPhase', () => {
  it('turns late in the last 10 %, between 5 s and a minute', () => {
    expect(timerPhase(200, 300)).toBe('running')
    expect(timerPhase(30, 300)).toBe('late')
    expect(timerPhase(70, 3600)).toBe('running')
    expect(timerPhase(60, 3600)).toBe('late')
    expect(timerPhase(5, 20)).toBe('late')
    expect(timerPhase(0, 300)).toBe('done')
  })
})

describe('parseTimerInput', () => {
  it('reads m:ss, a bare number of minutes, and 2m30s', () => {
    expect(parseTimerInput('5:30')).toBe(330)
    expect(parseTimerInput('10')).toBe(600)
    expect(parseTimerInput('2m30s')).toBe(150)
    expect(parseTimerInput('45s')).toBe(45)
    expect(parseTimerInput('3 min')).toBe(180)
    expect(parseTimerInput('soon')).toBeUndefined()
  })
})
