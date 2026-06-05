import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import fs from 'node:fs'
import { parseDeck, serializeDeck } from './src/core/deck'
import type { Slide, DeckConfig } from './src/core/types'

const ROOT = __dirname
const DECK_PATH = path.resolve(ROOT, 'deck.md')
const EXAMPLE_PATH = path.resolve(ROOT, 'deck.example.md')
const ASSETS_DIR = path.resolve(ROOT, 'public/Assets')

/** On a fresh clone deck.md is gitignored/absent — seed it from the example. */
function ensureDeck() {
  if (!fs.existsSync(DECK_PATH) && fs.existsSync(EXAMPLE_PATH)) {
    fs.copyFileSync(EXAMPLE_PATH, DECK_PATH)
  }
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

/** Dev-only API: round-trips the deck file and handles image uploads. */
function dekApi() {
  return {
    name: 'dek-api',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0]
        try {
          if (url === '/api/deck' && req.method === 'GET') {
            ensureDeck()
            const raw = fs.readFileSync(DECK_PATH, 'utf-8')
            return json(res, 200, parseDeck(raw))
          }

          // Replace one slide by index.
          if (url === '/api/slide' && req.method === 'PUT') {
            const { index, slide } = JSON.parse(await readBody(req)) as {
              index: number
              slide: Slide
            }
            const deck = parseDeck(fs.readFileSync(DECK_PATH, 'utf-8'))
            if (index < 0 || index >= deck.slides.length)
              return json(res, 400, { error: `bad index ${index}` })
            deck.slides[index] = slide
            fs.writeFileSync(DECK_PATH, serializeDeck(deck), 'utf-8')
            return json(res, 200, { ok: true })
          }

          // Replace the whole deck (config + slides). Used for reorder/add/delete
          // and LLM whole-deck edits.
          if (url === '/api/deck' && req.method === 'PUT') {
            const { config, slides } = JSON.parse(await readBody(req)) as {
              config: DeckConfig
              slides: Slide[]
            }
            fs.writeFileSync(DECK_PATH, serializeDeck({ config, slides }), 'utf-8')
            return json(res, 200, { ok: true })
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

export default defineConfig({
  plugins: [vue(), dekApi()],
})
