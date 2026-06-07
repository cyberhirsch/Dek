// Capture real screenshots of Dek for the tutorial deck.
// Requires the dev server running (npm run dev) on :5173, then: node scripts/shots.mjs
//
// Drives the live UI into each feature state and saves PNGs to
// public/Assets/tutorial/. Those are committed and referenced by deck.example.md.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '..', 'public', 'Assets', 'tutorial')
mkdirSync(OUT, { recursive: true })

const URL = 'http://localhost:5173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 }, deviceScaleFactor: 1.5 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('.bar')
await sleep(600)

const done = []
async function shot(name, fn) {
  try {
    if (fn) await fn()
    await sleep(450)
    await page.screenshot({ path: resolve(OUT, name + '.png') })
    done.push(name)
  } catch (e) {
    console.error('FAILED', name, e.message)
  }
}

// Navigate to slide index n by keyboard (Home, then ArrowRight*n), with focus on
// a neutral element so the window key handler — not a field — receives the keys.
async function goto(n) {
  await page.click('.brand')
  await page.keyboard.press('Home')
  await sleep(120)
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('ArrowRight')
    await sleep(70)
  }
  await sleep(350)
}

// 1 — the editor overview (toolbar, sidebar, stage, notes) on a formatted text slide
await goto(3)
await shot('editor')

// 2 — the two-way Markdown source pane
await shot('source-pane', async () => {
  await page.click('.topbtn:has-text("Source")')
})
await page.click('.topbtn:has-text("Source")') // close it
await sleep(200)

// 3 — freeform canvas: a selected box showing transform handles + the rotate dot,
//     plus the per-element style controls that appear in the top bar
await goto(13)
await shot('canvas-handles', async () => {
  await page.evaluate(() => {
    const el = document.querySelector('.dek-frame .canvas-layer .el-box')
    if (!el) return
    const r = el.getBoundingClientRect()
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 8, clientY: r.top + 8 }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
})

// 4 — the Insert menu (video / diagram / table) next to the canvas tools
await shot('insert-menu', async () => {
  await page.click('.ins')
})
await page.click('.ins').catch(() => {})
await sleep(200)

// 5 — text+image aspect ratios: a 9:16 frame with the text reflowed wider
await goto(4)
await shot('text-image-ratio', async () => {
  await page.click('.center .seg button:has-text("9:16")')
})

// 6 — gallery hover controls (the replace / remove buttons that only show on hover)
await goto(8)
await shot('gallery-controls', async () => {
  await page.hover('.dek-frame .gallery-cell .frame')
})

// 7 — the deck file menu (Open file / Open folder / Save As / New)
await shot('deck-menu', async () => {
  await page.click('.dm-trigger')
})
await page.click('.dm-backdrop').catch(() => {})
await sleep(200)

// 8 — the standalone presenter window (separate page)
{
  const p2 = await ctx.newPage()
  try {
    await p2.goto(URL + '?view=presenter', { waitUntil: 'networkidle' })
    await p2.waitForSelector('.pres', { timeout: 5000 })
    await sleep(700)
    await p2.screenshot({ path: resolve(OUT, 'presenter.png') })
    done.push('presenter')
  } catch (e) {
    console.error('FAILED presenter', e.message)
  }
  await p2.close()
}

await browser.close()
console.log('captured:', done.join(', '))
