// Keep every deck under a folder voiced, whether or not it's open in Dek.
//
//   npm run narrate:watch -- "D:\Google Drive\THRO\Lectures"
//
// Looks for `*.dek/deck.md` under the folder, and whenever one changes (and
// once for each at startup) voices its missing spoken lines with the local
// voice model, ~30 s after the last change so a burst of edits is one job.
// Runs one deck at a time, through scripts/narration-audio.mjs:
// - German decks are skipped (the voice model is English only);
// - the graphics card is checked first — if ComfyUI or a render holds it, the
//   deck waits and is retried every few minutes;
// - stale files are pruned only once every line of a deck has audio.
//
// Polls file times instead of relying on change events, which Google Drive's
// virtual folders don't deliver reliably. Stop with Ctrl+C.

import { execFile, spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_EVERY = 30_000
const SETTLE = 30_000
const BUSY_RETRY = 3 * 60_000
const ERROR_RETRY = 10 * 60_000
const VRAM_NEEDED = 18_000

const folder = process.argv[2] && resolve(process.argv[2])
if (!folder || !existsSync(folder)) {
  console.error('usage: npm run narrate:watch -- "<folder with .dek decks>"')
  process.exit(1)
}

/** deck.md path → { mtime seen, when it's due (ms), running } */
const decks = new Map()

function findDecks(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (/\.dek$/i.test(e.name)) {
      const md = join(p, 'deck.md')
      if (existsSync(md)) out.push(md)
    } else findDecks(p, out)
  }
  return out
}

function freeVram() {
  return new Promise((ok) => {
    execFile('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], (err, out) => {
      const mb = err ? NaN : parseInt(String(out).split('\n')[0], 10)
      ok(Number.isFinite(mb) ? mb : null)
    })
  })
}

const stamp = () => new Date().toLocaleTimeString()
const name = (md) => dirname(md).split(/[\\/]/).pop()

function scan() {
  const now = Date.now()
  for (const md of findDecks(folder)) {
    let mtime
    try {
      mtime = statSync(md).mtimeMs
    } catch {
      continue
    }
    const d = decks.get(md)
    if (!d) decks.set(md, { mtime, due: now, running: false })
    else if (d.mtime !== mtime) {
      d.mtime = mtime
      d.due = now + SETTLE
    }
  }
}

function voice(md) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [join(ROOT, 'scripts', 'narration-audio.mjs'), dirname(md), '--english-only', '--prune'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const tail = []
    const keep = (d) => {
      for (const l of String(d).split('\n')) if (l.trim()) tail.push(l.trim())
      tail.splice(0, Math.max(0, tail.length - 6))
    }
    p.stdout.on('data', keep)
    p.stderr.on('data', keep)
    p.on('close', (code) => ok({ code, tail }))
  })
}

let busy = false
async function tick() {
  scan()
  if (busy) return
  const now = Date.now()
  const next = [...decks.entries()].filter(([, d]) => d.due != null && d.due <= now).sort((a, b) => a[1].due - b[1].due)[0]
  if (!next) return
  const [md, d] = next
  const free = await freeVram()
  if (free != null && free < VRAM_NEEDED) {
    console.log(`${stamp()}  graphics card busy (${(free / 1024).toFixed(1)} GB free) — ${name(md)} waits`)
    for (const x of decks.values()) if (x.due != null) x.due = Math.max(x.due, now + BUSY_RETRY)
    return
  }
  busy = true
  d.due = null
  console.log(`${stamp()}  ${name(md)}`)
  const r = await voice(md)
  busy = false
  const summary = r.tail.at(-1) ?? ''
  if (r.code === 0) console.log(`${stamp()}    ${summary}`)
  else if (/out of memory|CUDA out/i.test(r.tail.join(' '))) {
    console.log(`${stamp()}    graphics card ran out of memory — retrying later`)
    d.due = Date.now() + BUSY_RETRY
  } else {
    console.log(`${stamp()}    failed: ${r.tail.slice(-2).join(' ')} — retrying in 10 min`)
    d.due = Date.now() + ERROR_RETRY
  }
  // A deck edited while it was being voiced gets another pass.
  try {
    const mtime = statSync(md).mtimeMs
    if (mtime !== d.mtime) {
      d.mtime = mtime
      d.due = Date.now() + SETTLE
    }
  } catch {
    decks.delete(md)
  }
  // Straight on to the next deck that's due, instead of waiting for the scan.
  setTimeout(() => void tick().catch((e) => console.error(e)), 0)
}

console.log(`Watching ${folder} for .dek decks (every ${SCAN_EVERY / 1000} s). Ctrl+C stops.`)
await tick()
setInterval(() => void tick().catch((e) => console.error(e)), SCAN_EVERY)
