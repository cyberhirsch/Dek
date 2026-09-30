// Voice a deck's narration with the local voice model.
//
//   npm run narrate:audio -- "<path to deck.md or My Talk.dek>" [--voice Seb] [--pace 1.0] [--cpu-offload] [--prune]
//
// Reads the deck with Dek's own parser, takes every speaker-notes line that
// starts with `>` (core/narration.ts), and hands them to the voice tool, which
// writes one `<lineId>.wav` per line into `voice/` next to deck.md. Narrate
// mode plays those files when ⚙ → Voice is set to the local voice; a line
// without a file (new, or edited since) falls back to the browser voice.
//
// Unchanged lines are skipped by the tool's cache, so re-running after editing
// a few notes only voices those. The ids are content hashes: edit a line and it
// gets a new file; `--prune` deletes wavs no line uses any more.
//
// The tool: G:\AI\_TTS\AuK\speak.py in its own venv (override with
// DEK_TTS_PYTHON / DEK_TTS_SCRIPT). It needs ~18 GB of free VRAM: close
// ComfyUI and other GPU apps first (or pass --cpu-offload: ~10 GB, ~3× slower).
// English only.

import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PYTHON = process.env.DEK_TTS_PYTHON ?? 'G:\\AI\\_TTS\\AuK\\venv\\Scripts\\python.exe'
const SPEAK = process.env.DEK_TTS_SCRIPT ?? 'G:\\AI\\_TTS\\AuK\\speak.py'
/** The voice tool's respellings; a line whose respellings changed is voiced again. */
const PRONUNCIATIONS = process.env.DEK_TTS_PRONUNCIATIONS ?? join(dirname(SPEAK), 'pronunciations.json')

function usage(msg) {
  if (msg) console.error(msg)
  console.error('usage: npm run narrate:audio -- "<deck.md | Talk.dek>" [--voice Seb] [--pace 1.0] [--cpu-offload] [--prune] [--english-only]')
  process.exit(1)
}

// ── arguments ──
const args = process.argv.slice(2)
let target
let voice = 'Seb'
let prune = false
let englishOnly = false
const passThrough = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--voice') voice = args[++i]
  else if (a === '--pace') passThrough.push('--pace', args[++i])
  else if (a === '--cpu-offload') passThrough.push('--cpu-offload')
  else if (a === '--prune') prune = true
  else if (a === '--english-only') englishOnly = true
  else if (a.startsWith('--')) usage(`unknown option ${a}`)
  else target = a
}
if (!target) usage()
let deckPath = resolve(target)
if (existsSync(deckPath) && statSync(deckPath).isDirectory()) deckPath = join(deckPath, 'deck.md')
if (!existsSync(deckPath)) usage(`no deck at ${deckPath}`)
if (!existsSync(PYTHON) || !existsSync(SPEAK)) usage(`voice tool not found: ${PYTHON} / ${SPEAK}`)
const outDir = join(dirname(deckPath), 'voice')

// ── Dek's own parser, bundled on the fly (the sources are TypeScript). The
//    bundle goes inside the repo so its package imports (yaml) resolve from
//    node_modules. ──
const bundlePath = join(ROOT, 'node_modules', '.cache', 'dek-narration.mjs')
mkdirSync(dirname(bundlePath), { recursive: true })
await build({
  stdin: {
    contents:
      "export { parseDeck } from './src/core/deck'\nexport { deckSpokenLines, looksGerman, respellingStamp, respellingOutdated, unknownVoiceTags, VOICE_MANIFEST } from './src/core/narration'\n",
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  outfile: bundlePath,
  logLevel: 'silent',
})
const { parseDeck, deckSpokenLines, looksGerman, respellingStamp, respellingOutdated, unknownVoiceTags, VOICE_MANIFEST } = await import(
  pathToFileURL(bundlePath).href
)

const deck = parseDeck(readFileSync(deckPath, 'utf8'))
const items = await deckSpokenLines(deck.slides)
if (!items.length) {
  console.log('No spoken lines: add notes lines starting with "> " to the slides you want narrated.')
  process.exit(0)
}

// Direction tags the voice tool drops (it knows calm, happy, slower/slow, breath).
for (const it of items) {
  const bad = unknownVoiceTags(it.text)
  if (bad.length) console.warn(`Ignored by the voice: ${bad.map((t) => `[${t}]`).join(' ')} in "${it.text.slice(0, 60)}"`)
}

// The voice model speaks English only.
if (englishOnly && looksGerman(items.map((it) => it.text))) {
  console.log(`${deck.config.deck ?? deckPath}: German narration — left to the browser voice.`)
  process.exit(0)
}

mkdirSync(outDir, { recursive: true })
const wanted = new Set(items.map((it) => `${it.id}.wav`))
const staleFiles = () => readdirSync(outDir).filter((f) => /^[0-9a-f]{12}\.wav$/.test(f) && !wanted.has(f))
// Which respellings each file was voiced with (voice/voiced.json, shared with
// Dek). A line whose respellings changed since is voiced again.
const manifestPath = join(outDir, VOICE_MANIFEST)
let stored = null
try {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (m && typeof m.lines === 'object') stored = { version: 1, lines: { ...m.lines } }
} catch {
  /* none yet */
}
const manifest = stored ?? { version: 1, lines: {} }
let respell = {}
try {
  respell = JSON.parse(readFileSync(PRONUNCIATIONS, 'utf8'))
} catch {
  /* no respellings file */
}
const stamps = new Map()
for (const it of items) stamps.set(it.id, await respellingStamp(it.text, respell))
function saveManifest() {
  for (const id of Object.keys(manifest.lines)) if (!stamps.has(id) && prune) delete manifest.lines[id]
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 1))
}

// Only lines without an up-to-date file go to the voice tool, so a fully
// voiced deck never loads the model at all.
const missing = items.filter(
  (it) => !existsSync(join(outDir, `${it.id}.wav`)) || respellingOutdated(stored, it.id, stamps.get(it.id)),
)
if (!missing.length) {
  const stale = staleFiles()
  if (prune) {
    for (const f of stale) rmSync(join(outDir, f))
    if (existsSync(manifestPath)) saveManifest()
  }
  console.log(
    `${deck.config.deck ?? deckPath}: all ${items.length} lines have audio.` +
      (stale.length ? (prune ? ` Removed ${stale.length} unused files.` : ` ${stale.length} files are no longer used (--prune removes them).`) : ''),
  )
  process.exit(0)
}
const itemsFile = join(tmpdir(), `dek-narration-${process.pid}.json`)
writeFileSync(itemsFile, JSON.stringify(missing, null, 2))

console.log(`${deck.config.deck ?? deckPath}: ${missing.length} of ${items.length} spoken lines need audio → ${outDir}`)
console.log('The voice model needs ~18 GB of free VRAM: close ComfyUI and other GPU apps. First line takes ~45 s to load.')

// ── run the voice tool, one JSON progress line per item ──
let done = 0
let fresh = 0
let seconds = 0
const code = await new Promise((ok) => {
  const p = spawn(PYTHON, [SPEAK, 'batch', '--in', itemsFile, '--out', outDir, '--voice', voice, ...passThrough], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  let buf = ''
  p.stdout.on('data', (d) => {
    buf += d
    let nl
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      let r
      try {
        r = JSON.parse(line)
      } catch {
        if (line) console.log(line)
        continue
      }
      done++
      if (r.id && stamps.has(r.id)) {
        manifest.lines[r.id] = stamps.get(r.id)
        saveManifest()
      }
      seconds += r.seconds ?? 0
      if (!r.cached) fresh++
      const text = items.find((it) => it.id === r.id)?.text ?? ''
      console.log(
        `[${done}/${missing.length}] ${r.cached ? 'cached' : `${Number(r.took ?? 0).toFixed(1)} s`}  ${Number(r.seconds ?? 0).toFixed(1)} s  ${text.slice(0, 70)}`,
      )
    }
  })
  p.on('close', ok)
})
rmSync(itemsFile, { force: true })
if (code !== 0) {
  console.error(`voice tool exited with code ${code}`)
  process.exit(code ?? 1)
}

// ── stale files: lines edited or removed since they were voiced. Pruned only
//    now that every line has audio (the run succeeded). ──
const stale = staleFiles()
if (stale.length && prune) for (const f of stale) rmSync(join(outDir, f))

const min = Math.floor(seconds / 60)
console.log(
  `Done: ${done} lines, ${fresh} newly voiced, ${min}:${String(Math.round(seconds % 60)).padStart(2, '0')} of narration.` +
    (stale.length ? (prune ? ` Removed ${stale.length} unused files.` : ` ${stale.length} files are no longer used (--prune removes them).`) : ''),
)
