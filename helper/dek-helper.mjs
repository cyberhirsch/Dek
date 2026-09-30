// Dek Helper — a small local server that does for Dek what a web page can't:
// run the local voice model. Start it with `npm run helper` and leave it
// running; Dek's ⚙ menu finds it on http://127.0.0.1:7880.
//
// What it does: Dek sends the spoken lines that have no audio yet; the helper
// voices them with the local voice tool (speak.py, `batch` mode — the model is
// loaded once per job and the GPU is free again when the job ends) and hands
// each finished WAV back as soon as it's ready. Dek writes the files into the
// deck's own `voice/` folder, so the helper never needs to know where decks
// live and never writes into them.
//
// Who may talk to it: only Dek's own pages (the published site and the dev
// server) — a browser always tells the helper which page is asking, and a page
// can't fake that — so no other website can use your GPU or voice. It listens
// on 127.0.0.1 only, so nothing on the network can reach it. No other packages
// needed.

import { spawn, execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VERSION = 1
const PORT = Number(process.env.DEK_HELPER_PORT ?? 7880)
const PYTHON = process.env.DEK_TTS_PYTHON ?? 'G:\\AI\\_TTS\\AuK\\venv\\Scripts\\python.exe'
const SPEAK = process.env.DEK_TTS_SCRIPT ?? 'G:\\AI\\_TTS\\AuK\\speak.py'
/** Free VRAM the voice model needs, in MB (with --cpu-offload: ~10 GB). */
const VRAM_NEEDED = 18000
const VRAM_NEEDED_OFFLOAD = 10000
const ORIGINS = new Set(['https://cyberhirsch.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173'])

const voiceTool = existsSync(PYTHON) && existsSync(SPEAK)

/** Free VRAM on the first GPU in MB, or null when nvidia-smi isn't there. */
function freeVram() {
  return new Promise((resolve) => {
    execFile('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], (err, out) => {
      const mb = err ? NaN : parseInt(String(out).split('\n')[0], 10)
      resolve(Number.isFinite(mb) ? mb : null)
    })
  })
}

// ── the one job at a time ──
/** @type {null | {id:string, state:'loading'|'running'|'done'|'error'|'cancelled', total:number, items:Map<string,{seconds:number,file:string}>, error?:string, proc?:import('node:child_process').ChildProcess, dir:string, log:string[]}} */
let job = null

function startJob(items, voice, cpuOffload) {
  const id = randomBytes(6).toString('hex')
  const dir = join(tmpdir(), 'dek-helper', id)
  mkdirSync(dir, { recursive: true })
  const itemsFile = join(dir, 'items.json')
  writeFileSync(itemsFile, JSON.stringify(items))
  const args = [SPEAK, 'batch', '--in', itemsFile, '--out', dir, '--voice', voice]
  if (cpuOffload) args.push('--cpu-offload')
  const proc = spawn(PYTHON, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  const j = { id, state: 'loading', total: items.length, items: new Map(), proc, dir, log: [] }
  job = j
  let buf = ''
  proc.stdout.on('data', (d) => {
    buf += d
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      try {
        const r = JSON.parse(line)
        if (r.id && r.file) {
          j.state = 'running'
          j.items.set(r.id, { seconds: r.seconds ?? 0, file: r.file })
          console.log(`  [${j.items.size}/${j.total}] ${r.cached ? 'cached' : `${Number(r.took ?? 0).toFixed(1)} s`}  ${r.id}`)
        }
      } catch {
        if (line) j.log.push(line)
      }
    }
  })
  proc.stderr.on('data', (d) => {
    for (const l of String(d).split('\n')) if (l.trim()) j.log.push(l.trim())
    j.log = j.log.slice(-40)
  })
  proc.on('close', (code) => {
    j.proc = undefined
    if (j.state === 'cancelled') return
    if (code === 0) j.state = 'done'
    else {
      j.state = 'error'
      j.error = /out of memory|CUDA out/i.test(j.log.join('\n'))
        ? 'The GPU ran out of memory. Close ComfyUI and other GPU apps, or try CPU offload.'
        : `The voice tool stopped (code ${code}). ${j.log.slice(-3).join(' ')}`
    }
    console.log(`Job ${id}: ${j.state}${j.error ? ` — ${j.error}` : ''}`)
  })
  console.log(`Job ${id}: ${items.length} lines, voice ${voice}${cpuOffload ? ', CPU offload' : ''}`)
  return j
}

function jobView(j) {
  return {
    id: j.id,
    state: j.state,
    total: j.total,
    ready: [...j.items.entries()].map(([id, v]) => ({ id, seconds: v.seconds })),
    ...(j.error ? { error: j.error } : {}),
  }
}

// ── HTTP ──
function send(res, code, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body)
  res.writeHead(code, { 'Content-Type': isBuf ? 'audio/wav' : 'application/json', ...headers })
  res.end(isBuf ? body : JSON.stringify(body))
}

function readJson(req) {
  return new Promise((resolve) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(b || '{}'))
      } catch {
        resolve(null)
      }
    })
  })
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin
  const cors = origin && ORIGINS.has(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        // Chrome's Private/Local Network Access: a public page asking a local one.
        'Access-Control-Allow-Private-Network': 'true',
        Vary: 'Origin',
      }
    : {}
  if (origin && !ORIGINS.has(origin)) return send(res, 403, { error: 'Only Dek may use the Dek Helper.' })
  if (req.method === 'OPTIONS') return send(res, 204, {}, cors)

  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/status' && req.method === 'GET') {
    return send(
      res,
      200,
      {
        helper: 'dek-helper',
        version: VERSION,
        // Kept for Dek builds that still ask for a pairing code.
        paired: true,
        voiceTool,
        voices: voiceTool ? ['Seb'] : [],
        busy: !!job && (job.state === 'loading' || job.state === 'running'),
      },
      cors,
    )
  }

  // POST /jobs {items:[{id,text}], voice?, cpuOffload?}
  if (url.pathname === '/jobs' && req.method === 'POST') {
    if (!voiceTool) return send(res, 503, { error: `Voice tool not found (${SPEAK}).` }, cors)
    if (job && (job.state === 'loading' || job.state === 'running'))
      return send(res, 409, { error: 'Already voicing another set of lines.', job: jobView(job) }, cors)
    const body = await readJson(req)
    const items = Array.isArray(body?.items)
      ? body.items.filter((it) => it && /^[0-9a-f]{12}$/.test(it.id) && typeof it.text === 'string' && it.text.trim())
      : []
    if (!items.length) return send(res, 400, { error: 'No lines to voice.' }, cors)
    const cpuOffload = !!body.cpuOffload
    const free = await freeVram()
    const need = cpuOffload ? VRAM_NEEDED_OFFLOAD : VRAM_NEEDED
    if (free != null && free < need)
      return send(
        res,
        409,
        {
          error: `Only ${(free / 1024).toFixed(1)} GB free on the GPU; the voice needs ${need / 1000} GB. Close ComfyUI and other GPU apps${cpuOffload ? '' : ', or use CPU offload (slower)'}.`,
          vram: free,
        },
        cors,
      )
    if (job) rmSync(job.dir, { recursive: true, force: true })
    const voice = typeof body.voice === 'string' && /^[\w-]+$/.test(body.voice) ? body.voice : 'Seb'
    return send(res, 200, jobView(startJob(items, voice, cpuOffload)), cors)
  }

  const m = /^\/jobs\/([0-9a-f]+)(?:\/audio\/([0-9a-f]{12}))?$/.exec(url.pathname)
  if (m) {
    if (!job || job.id !== m[1]) return send(res, 404, { error: 'No such job.' }, cors)
    if (m[2] && req.method === 'GET') {
      const it = job.items.get(m[2])
      if (!it || !existsSync(it.file)) return send(res, 404, { error: 'Not voiced yet.' }, cors)
      return send(res, 200, readFileSync(it.file), cors)
    }
    if (req.method === 'GET') return send(res, 200, jobView(job), cors)
    if (req.method === 'DELETE') {
      job.state = 'cancelled'
      job.proc?.kill()
      return send(res, 200, jobView(job), cors)
    }
  }
  send(res, 404, { error: 'Unknown request.' }, cors)
})

// Loopback only: nothing on the network can reach it.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dek Helper ${VERSION} on http://127.0.0.1:${PORT}`)
  console.log('Dek finds it by itself: present → ⚙ → Local voice.')
  console.log(voiceTool ? `Voice tool: ${SPEAK}` : `Voice tool NOT found: ${SPEAK} — set DEK_TTS_PYTHON / DEK_TTS_SCRIPT`)
})
