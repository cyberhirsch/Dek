import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import fs from 'node:fs'
import { parseDeck, serializeDeck } from './src/core/deck'
import type { Slide, DeckConfig } from './src/core/types'

const ROOT = __dirname
const DECK_PATH = path.resolve(ROOT, 'deck.md')
const EXAMPLE_PATH = path.resolve(ROOT, 'deck.example.md')
const DECKS_DIR = path.resolve(ROOT, 'decks')
const ASSETS_DIR = path.resolve(ROOT, 'public/Assets')

/** On a fresh clone deck.md is gitignored/absent — seed it from the example. */
function ensureDeck() {
  if (!fs.existsSync(DECK_PATH) && fs.existsSync(EXAMPLE_PATH)) {
    fs.copyFileSync(EXAMPLE_PATH, DECK_PATH)
  }
}

/** Map a client `file` id to a safe absolute path (no traversal). */
function resolveDeck(file: string | null): string {
  if (!file || file === 'deck.md') return DECK_PATH
  if (file === 'deck.example.md') return EXAMPLE_PATH
  const m = /^decks\/([a-zA-Z0-9_-]+)\.md$/.exec(file)
  if (m) return path.join(DECKS_DIR, `${m[1]}.md`)
  throw new Error(`invalid deck file: ${file}`)
}

function slug(name: string): string {
  return (
    (name || 'deck')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'deck'
  )
}

function deckTitle(p: string): string | undefined {
  try {
    return parseDeck(fs.readFileSync(p, 'utf-8')).config.deck
  } catch {
    return undefined
  }
}

function listDecks() {
  const out: Array<{ file: string; name: string }> = []
  ensureDeck()
  if (fs.existsSync(DECK_PATH)) out.push({ file: 'deck.md', name: deckTitle(DECK_PATH) ?? 'deck.md' })
  if (fs.existsSync(DECKS_DIR)) {
    for (const f of fs.readdirSync(DECKS_DIR).sort()) {
      if (f.endsWith('.md')) {
        const p = path.join(DECKS_DIR, f)
        out.push({ file: `decks/${f}`, name: deckTitle(p) ?? f.replace(/\.md$/, '') })
      }
    }
  }
  if (fs.existsSync(EXAMPLE_PATH)) out.push({ file: 'deck.example.md', name: 'Example' })
  return out
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let b = ''
    req.on('data', (c) => (b += c))
    req.on('end', () => resolve(b))
  })
}

function json(res: import('node:http').ServerResponse, code: number, data: unknown) {
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

/** Dev-only API: lists/round-trips deck files and handles image uploads. */
function dekApi() {
  return {
    name: 'dek-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const u = new URL(req.url ?? '', 'http://localhost')
        const url = u.pathname
        const file = u.searchParams.get('file')
        try {
          if (url === '/api/decks' && req.method === 'GET') {
            return json(res, 200, { decks: listDecks() })
          }

          if (url === '/api/deck' && req.method === 'GET') {
            const p = resolveDeck(file)
            if (p === DECK_PATH) ensureDeck()
            if (!fs.existsSync(p)) return json(res, 404, { error: 'deck not found' })
            return json(res, 200, parseDeck(fs.readFileSync(p, 'utf-8')))
          }

          // Replace one slide by index.
          if (url === '/api/slide' && req.method === 'PUT') {
            const p = resolveDeck(file)
            const { index, slide } = JSON.parse(await readBody(req)) as { index: number; slide: Slide }
            const deck = parseDeck(fs.readFileSync(p, 'utf-8'))
            if (index < 0 || index >= deck.slides.length)
              return json(res, 400, { error: `bad index ${index}` })
            deck.slides[index] = slide
            fs.writeFileSync(p, serializeDeck(deck), 'utf-8')
            return json(res, 200, { ok: true })
          }

          // Replace the whole deck (reorder/add/delete, whole-deck edits).
          if (url === '/api/deck' && req.method === 'PUT') {
            const p = resolveDeck(file)
            const { config, slides } = JSON.parse(await readBody(req)) as {
              config: DeckConfig
              slides: Slide[]
            }
            fs.writeFileSync(p, serializeDeck({ config, slides }), 'utf-8')
            return json(res, 200, { ok: true })
          }

          // Save the current deck under a new name in decks/.
          if (url === '/api/save-as' && req.method === 'POST') {
            const { name, config, slides } = JSON.parse(await readBody(req)) as {
              name: string
              config: DeckConfig
              slides: Slide[]
            }
            fs.mkdirSync(DECKS_DIR, { recursive: true })
            const fileName = `${slug(name)}.md`
            const dest = path.join(DECKS_DIR, fileName)
            const cfg = { ...config, deck: name || config.deck }
            fs.writeFileSync(dest, serializeDeck({ config: cfg, slides }), 'utf-8')
            return json(res, 200, { ok: true, file: `decks/${fileName}` })
          }

          // Create a new empty deck (seeded from the example) in decks/.
          if (url === '/api/new' && req.method === 'POST') {
            const { name } = JSON.parse(await readBody(req)) as { name: string }
            fs.mkdirSync(DECKS_DIR, { recursive: true })
            const fileName = `${slug(name)}.md`
            const dest = path.join(DECKS_DIR, fileName)
            const base = fs.existsSync(EXAMPLE_PATH)
              ? parseDeck(fs.readFileSync(EXAMPLE_PATH, 'utf-8'))
              : { config: {}, slides: [] }
            base.config = { ...base.config, deck: name || 'Untitled' }
            fs.writeFileSync(dest, serializeDeck(base), 'utf-8')
            return json(res, 200, { ok: true, file: `decks/${fileName}` })
          }

          if (url === '/api/upload' && req.method === 'POST') {
            const { filename, dataUrl } = JSON.parse(await readBody(req)) as {
              filename: string
              dataUrl: string
            }
            const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
            fs.mkdirSync(ASSETS_DIR, { recursive: true })
            const ext = path.extname(filename) || '.png'
            const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_')
            const name = `${base}_${Date.now()}${ext}`
            fs.writeFileSync(path.join(ASSETS_DIR, name), Buffer.from(b64, 'base64'))
            return json(res, 200, { ok: true, url: `/Assets/${name}` })
          }
        } catch (e) {
          return json(res, 500, { error: (e as Error).message })
        }
        next()
      })
    },
  }
}

export default defineConfig(({ command }) => ({
  // Relative base so the static build works under any path (e.g. GitHub Pages
  // project site at /<repo>/). Dev stays at '/'.
  base: command === 'build' ? './' : '/',
  plugins: [vue(), dekApi()],
  server: {
    // Autosave writes deck files (and uploaded images) into the project root via
    // the dev API. deck.example.md is also pulled into the module graph by a
    // `?raw` import (browser-build seeding), so a save would otherwise trigger a
    // full HMR page reload — a visible flicker mid-edit. Keep these out of the
    // watcher: their content is owned by the app, not by source HMR.
    watch: {
      ignored: ['**/deck.md', '**/deck.example.md', '**/decks/**', '**/public/Assets/**'],
    },
  },
}))
