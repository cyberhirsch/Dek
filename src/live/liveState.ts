// Live voting while presenting. When the presentation reaches a poll slide,
// Dek makes sure today's session and this slide's poll exist on Dek Live, opens
// the poll, and fetches its answers every 1.5 s; leaving the slide closes it.
// The state is module-level and reactive, so the poll slide (PollView) can show
// the join code and the results wherever it's rendered.
import { reactive } from 'vue'
import type { PollSpec, Slide } from '../core/types'
import { ensurePoll, ensureSession, pollAnswers, setPollOpen, tally, today, type LiveSession } from './client'

export interface LivePollState {
  pollId: string
  results: [string, number][]
  total: number
}

export const liveState = reactive({
  /** The running session (for the QR code), once one exists. */
  session: null as LiveSession | null,
  /** What went wrong, in words for the slide. Empty when all is well. */
  error: '',
  /** Connecting / live, per slide index. */
  polls: {} as Record<number, LivePollState>,
  connecting: -1,
})

const REFRESH_MS = 1500
const RETRY_MS = 5000
const sessions = new Map<string, Promise<LiveSession>>()
function sessionFor(deck: string): Promise<LiveSession> {
  const k = `${today()}|${deck}`
  let p = sessions.get(k)
  if (!p) {
    p = ensureSession(deck)
    sessions.set(k, p)
    p.catch(() => sessions.delete(k)) // let a later attempt try again
  }
  return p
}

let run = 0
let openPoll: { session: LiveSession; pollId: string } | null = null
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function closeCurrent() {
  const o = openPoll
  openPoll = null
  if (o) void setPollOpen(o.session, o.pollId, false).catch(() => {})
}

/** Called whenever the presented slide changes; `slide` undefined = stop. */
export function presentSlide(deckName: string, index: number, slide: Slide | undefined) {
  const token = ++run
  closeCurrent()
  liveState.connecting = -1
  if (!slide || slide.layout !== 'poll' || !slide.poll || !slide.title?.trim()) return
  void livePoll(token, deckName || 'Untitled', index, slide.title.trim(), slide.poll)
}

async function livePoll(token: number, deck: string, index: number, question: string, spec: PollSpec) {
  liveState.connecting = index
  while (token === run) {
    try {
      const session = await sessionFor(deck)
      if (token !== run) return
      liveState.session = session
      const poll = await ensurePoll(session, index, question, spec)
      if (token !== run) return
      await setPollOpen(session, poll.id, true)
      if (token !== run) {
        void setPollOpen(session, poll.id, false).catch(() => {})
        return
      }
      openPoll = { session, pollId: poll.id }
      liveState.error = ''
      liveState.connecting = -1
      while (token === run) {
        const answers = await pollAnswers(session, poll.id)
        if (token !== run) return
        const results = tally(spec.kind, answers, poll.options ?? [])
        liveState.polls[index] = { pollId: poll.id, results, total: answers.length }
        await sleep(REFRESH_MS)
      }
      return
    } catch (e) {
      if (token !== run) return
      liveState.error = (e as Error).message.includes('Failed to fetch')
        ? 'Live voting is unreachable right now (no connection to dek.sebhirsch.com).'
        : (e as Error).message
      // A session taken by another browser won't fix itself.
      if (/another browser/.test(liveState.error)) return
      await sleep(RETRY_MS)
    }
  }
}
