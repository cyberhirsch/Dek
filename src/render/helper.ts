// Talking to the Dek Helper (helper/dek-helper.mjs): a small server the user
// runs on their own machine for what a web page can't do — for now, voicing
// narration with the local voice model.
//
// It listens on 127.0.0.1 only and answers only Dek's own pages. Everything
// here degrades to "not running": the helper is optional.

const BASE = 'http://127.0.0.1:7880'

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

/** A pairing code from before the helper stopped needing one — dropped. */
try {
  localStorage.removeItem('dek:helper-code')
} catch {
  /* nothing stored */
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(BASE + path, {
    ...init,
    headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json' },
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

/** The voice tool's respellings (word to how it's said), or null when the
 *  helper can't be reached: then nothing is judged outdated. */
export async function helperRespellings(): Promise<Record<string, string> | null> {
  try {
    const r = await call('/pronunciations', { signal: AbortSignal.timeout(1500) })
    return r.ok ? ((await r.json()) as Record<string, string>) : null
  } catch {
    return null
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
