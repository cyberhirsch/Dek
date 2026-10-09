// Talking to Dek Live, the voting server (services/dek-live, on the Pi behind
// dek.sebhirsch.com). No accounts: a session is a presentation on a date, its
// id derived from both, and whoever starts it holds a random secret key (sent
// as X-Dek-Key) that alone may add, open and close its polls and read votes.
import type { PollSpec } from '../core/types'

export let LIVE_API = 'https://dek.sebhirsch.com'
/** Point the client at another server (tests against a throwaway copy). */
export function useLiveApi(url: string) {
  LIVE_API = url
}
/** Where phones vote: the published Dek, never a local dev address. */
export const JOIN_BASE = 'https://cyberhirsch.github.io/Dek/'

export function joinUrl(sessionId: string): string {
  return `${JOIN_BASE}?join=${sessionId}`
}

/** Today in the presenter's own time zone, as YYYY-MM-DD. */
export function today(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** A session's id: 15 hex digits of SHA-256 over date + presentation name, so
 *  the same deck on the same day is always the same session. */
export async function sessionIdFor(day: string, deck: string): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}|${deck.trim()}`))
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 15)
}

function randomToken(chars: number): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(chars))
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
  return Array.from(bytes, (b) => abc[b % 64]).join('')
}

/** The phone's anonymous voter token (one vote per phone per poll). */
export function voterToken(): string {
  try {
    const have = localStorage.getItem('dek:voter')
    if (have && /^[A-Za-z0-9_-]{16,64}$/.test(have)) return have
    const t = randomToken(32)
    localStorage.setItem('dek:voter', t)
    return t
  } catch {
    return randomToken(32)
  }
}

/** PocketBase filter string literal. */
export function pbString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

async function api<T>(method: string, path: string, body?: unknown, key?: string): Promise<T> {
  const res = await fetch(LIVE_API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Dek-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { message?: string; data?: Record<string, { code?: string }> }
  if (!res.ok) throw Object.assign(new Error(data?.message || `Dek Live error ${res.status}`), { status: res.status, fields: data?.data ?? {} })
  return data
}

export interface LiveSession {
  id: string
  key: string
  deck: string
  day: string
}

const keyName = (id: string) => `dek:live-key:${id}`

/**
 * The session for this presentation today: reused when this browser started
 * it (it kept the key), created otherwise. Fails when someone else — another
 * browser without the key — already started a session for the same deck today.
 */
export async function ensureSession(deck: string, day = today()): Promise<LiveSession> {
  const id = await sessionIdFor(day, deck)
  let key: string | null = null
  try {
    key = localStorage.getItem(keyName(id))
  } catch {
    /* private mode: a fresh key each time */
  }
  if (key) {
    try {
      await api('GET', `/api/collections/sessions/records/${id}`)
      return { id, key, deck, day }
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e
    }
  }
  key = randomToken(40)
  try {
    await api('POST', '/api/collections/sessions/records', { id, title: deck, deck, day }, key)
  } catch (e) {
    if ((e as { status?: number }).status === 400) {
      throw new Error('This presentation already has a live session today, started in another browser. Open it there, or rename the deck.')
    }
    throw e
  }
  try {
    localStorage.setItem(keyName(id), key)
  } catch {
    /* not remembered: a reload can't resume this session */
  }
  return { id, key, deck, day }
}

export interface LivePoll {
  id: string
  question: string
  kind: PollSpec['kind']
  options: string[]
  open: boolean
}

/** The poll for this slide and question in the session: reused if it was
 *  already asked today, created otherwise. */
export async function ensurePoll(s: LiveSession, slide: number, question: string, spec: PollSpec): Promise<LivePoll> {
  const options = spec.kind === 'choice' ? (spec.options ?? []).map((o) => String(o).trim()).filter(Boolean) : []
  const filter = `session=${pbString(s.id)} && slide=${slide} && question=${pbString(question)}`
  const found = await api<{ items: LivePoll[] }>('GET', `/api/collections/polls/records?perPage=1&filter=${encodeURIComponent(filter)}`, undefined, s.key)
  if (found.items[0]) return found.items[0]
  return api<LivePoll>('POST', '/api/collections/polls/records', { session: s.id, slide, question, kind: spec.kind, options, open: false }, s.key)
}

export function setPollOpen(s: LiveSession, pollId: string, open: boolean): Promise<LivePoll> {
  return api<LivePoll>('PATCH', `/api/collections/polls/records/${pollId}`, { open }, s.key)
}

/** Every answer to a poll, as stored text (`label`). */
export async function pollAnswers(s: LiveSession, pollId: string): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page < 50; page++) {
    const r = await api<{ items: { label: string }[]; totalPages: number }>(
      'GET',
      `/api/collections/votes/records?perPage=500&page=${page}&sort=created&fields=label&filter=${encodeURIComponent(`poll=${pbString(pollId)}`)}`,
      undefined,
      s.key,
    )
    out.push(...r.items.map((v) => v.label))
    if (page >= r.totalPages) break
  }
  return out
}

/** Tally answers: for a choice poll in option order (zeros included), for a
 *  scale 1–5, for words by frequency with case and spacing folded. */
export function tally(kind: PollSpec['kind'], answers: string[], options: string[] = []): [string, number][] {
  if (kind === 'choice') return options.map((o) => [o, answers.filter((a) => a === o).length])
  if (kind === 'scale') return ['1', '2', '3', '4', '5'].map((n) => [n, answers.filter((a) => a === n).length])
  const counts = new Map<string, { label: string; n: number }>()
  for (const a of answers) {
    const label = a.trim().replace(/\s+/g, ' ')
    const k = label.toLowerCase()
    if (!k) continue
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { label, n: 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((c) => [c.label, c.n])
}

// ── phones ──

export interface PublicSession {
  id: string
  title: string
  deck: string
  day: string
}

export function getSession(id: string): Promise<PublicSession> {
  return api<PublicSession>('GET', `/api/collections/sessions/records/${id}`)
}

/** The session's currently open poll, if any (the newest when several). */
export async function openPoll(sessionId: string): Promise<LivePoll | null> {
  const filter = `session=${pbString(sessionId)} && open=true`
  const r = await api<{ items: LivePoll[] }>('GET', `/api/collections/polls/records?perPage=1&sort=-updated&filter=${encodeURIComponent(filter)}`)
  return r.items[0] ?? null
}

export type VoteResult = 'ok' | 'already' | 'closed' | { problem: string }

/** Cast a vote (a choice is sent as its option's number). Tells apart a
 *  second vote from this phone, a poll that has just closed, and an answer
 *  the server refused. */
export async function vote(pollId: string, answer: string): Promise<VoteResult> {
  try {
    await api('POST', '/api/collections/votes/records', { poll: pollId, voter: voterToken(), answer })
    return 'ok'
  } catch (e) {
    const err = e as Error & { status?: number; fields?: Record<string, { code?: string }> }
    if (err.fields?.voter?.code === 'validation_not_unique') return 'already'
    // A closed poll fails the table rule, which gives no reason at all.
    if (err.status === 400 && !Object.keys(err.fields ?? {}).length && /Failed to create/.test(err.message)) return 'closed'
    if (/closed/i.test(err.message)) return 'closed'
    return { problem: err.message }
  }
}

/** Remember on this phone what it answered, so a reload shows it. */
export function votedKey(pollId: string): string {
  return `dek:voted:${pollId}`
}
