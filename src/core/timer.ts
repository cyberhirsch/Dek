// The timer widget's arithmetic, apart from the component so it can be tested.

export const TIMER_DEFAULT = 300
export const TIMER_MAX = 99 * 60 + 59

/** A stored duration made safe: whole seconds, 1 s … 99:59, default 5 min. */
export function timerDuration(d: unknown): number {
  const n = Math.round(Number(d))
  return Number.isFinite(n) && n > 0 ? Math.min(TIMER_MAX, n) : TIMER_DEFAULT
}

/** Seconds as the timer shows them: `m:ss`, or `mm:ss` from ten minutes. */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** `running` normally, `late` in the last 10 % (at most the last minute,
 *  at least the last 5 s) so the room sees it coming, `done` at zero. */
export function timerPhase(remaining: number, duration: number): 'running' | 'late' | 'done' {
  if (remaining <= 0) return 'done'
  const warn = Math.min(60, Math.max(5, duration * 0.1))
  return remaining <= warn ? 'late' : 'running'
}

/** "5:30", "90", "1:05:00" or "2m30s" → seconds; undefined when unreadable. */
export function parseTimerInput(text: string): number | undefined {
  const t = text.trim().toLowerCase()
  let m: RegExpExecArray | null
  if ((m = /^(\d+):(\d{1,2})$/.exec(t))) return Number(m[1]) * 60 + Number(m[2])
  if ((m = /^(\d+)$/.exec(t))) return Number(m[1]) * 60 // a bare number means minutes
  if ((m = /^(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/.exec(t)) && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)
  return undefined
}
