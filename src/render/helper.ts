// Talking to the Dek Helper (helper/dek-helper.mjs): a small server the user
// runs on their own machine for what a web page can't do — for now, voicing
// narration with the local voice model.
//
// It listens on 127.0.0.1 only and answers only Dek, and only with the
// pairing code it prints at startup (entered once in ⚙, kept per browser).
// Everything here degrades to "not running": the helper is optional.
import { ref } from 'vue'

const BASE = 'http://127.0.0.1:7880'
const TOKEN_KEY = 'dek:helper-code'

export interface HelperStatus {
  running: boolean
  paired: boolean
  voiceTool: boolean
  busy: boolean
}
export interface HelperJob {
  id: string
  state: 'loading' | 'running' | 'done' | 'error' | 'cancelled'
  total: number
  ready: { id: string; seconds: number }[]
  error?: string
}

function readCode(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
export const helperCode = ref(readCode())
export function setHelperCode(code: string) {
  helperCode.value = code.trim()
  try {
    localStorage.setItem(TOKEN_KEY, helperCode.value)
  } catch {
    /* private mode: re-enter next time */
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(BASE + path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${helperCode.value}`, 'Content-Type': 'application/json' },
  })
}
async function errorOf(r: Response): Promise<string> {
  try {
    return ((await r.json()) as { error?: string }).error ?? `Helper error ${r.status}`
  } catch {
    return `Helper error ${r.status}`
  }
}

export async function helperStatus(): Promise<HelperStatus> {
  try {
    const r = await call('/status', { signal: AbortSignal.timeout(1500) })
    const s = (await r.json()) as { paired?: boolean; voiceTool?: boolean; busy?: boolean }
    return { running: true, paired: !!s.paired, voiceTool: !!s.voiceTool, busy: !!s.busy }
  } catch {
    return { running: false, paired: false, voiceTool: false, busy: false }
  }
}

export async function startVoiceJob(items: { id: string; text: string }[], opts: { voice?: string; cpuOffload?: boolean } = {}): Promise<HelperJob> {
  const r = await call('/jobs', { method: 'POST', body: JSON.stringify({ items, ...opts }) })
  if (!r.ok) throw new Error(await errorOf(r))
  return (await r.json()) as HelperJob
}
export async function voiceJob(id: string): Promise<HelperJob> {
  const r = await call(`/jobs/${id}`)
  if (!r.ok) throw new Error(await errorOf(r))
  return (await r.json()) as HelperJob
}
export async function voiceJobAudio(job: string, item: string): Promise<Blob> {
  const r = await call(`/jobs/${job}/audio/${item}`)
  if (!r.ok) throw new Error(await errorOf(r))
  return r.blob()
}
export async function cancelVoiceJob(id: string): Promise<void> {
  await call(`/jobs/${id}`, { method: 'DELETE' }).catch(() => {})
}
