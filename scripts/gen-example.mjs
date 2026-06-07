// Generates deck.example.md — the "Dek — A Guided Tour" tutorial that ships with
// Dek and seeds a fresh install (browser build) / deck.md (dev server).
//
// Feature screenshots live in public/Assets/tutorial/ (captured by
// scripts/shots.mjs) and are referenced by RELATIVE path so they resolve both in
// dev ('/') and on the GitHub Pages project site ('/Dek/'). Run after changing
// either file: `node scripts/gen-example.mjs`.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '..', 'deck.example.md')

// ── YAML flow helpers: unquoted keys, JSON-quoted values (safe for newlines,
//    quotes, and markdown inside box content) ───────────────────────────────────
const val = (v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v))
const flow = (o) => '{ ' + Object.entries(o).map(([k, v]) => `${k}: ${val(v)}`).join(', ') + ' }'

const slides = []
const S = (block) => slides.push(block.trimEnd())

// A freeform "annotated screenshot" slide: a heading, the (uncropped, contained)
// screenshot in a framed box, and a column of bullet notes beside it.
function shot(title, src, bullets, group) {
  const els = [
    { type: 'box', x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: title, font: 'heading', italic: true, weight: 300, size: 44 },
    { type: 'box', x: 110, y: 172, w: 726, h: 468, rotation: 0, src: `Assets/tutorial/${src}`, fit: 'contain', fill: '#0c0e12', stroke: '#283041', strokeWidth: 1, radius: 10 },
    { type: 'box', x: 868, y: 176, w: 302, h: 460, rotation: 0, content: bullets.map((b) => `- ${b}`).join('\n'), font: 'body', size: 21 },
  ]
  S(`layout: freeform
group: ${JSON.stringify(group)}
elements:
${els.map((e) => '  - ' + flow(e)).join('\n')}`)
}

// ── global config + theme ─────────────────────────────────────────────────────
S(`# ─────────────────────────────────────────────────────────────────────────────
# Dek — a presentation is ONE Markdown file. This first block is the global
# config + theme; every following \`---\` block is a slide (a \`layout:\` plus that
# layout's fields). Edit here in code, hand the file to an LLM, or use the
# in-browser WYSIWYG editor — all three read & write these same fields.
# ─────────────────────────────────────────────────────────────────────────────
deck: Dek — A Guided Tour
ratio: "16:9"
paginate: true
header: "Dek · a guided tour"
footer: "Press → or scroll · Ctrl+E toggles edit / present"
theme:
  bg: "#070809"
  text: "#e6ecf2"
  accent: "#7fc7ff"
  accent2: "#ffb474"
  glow: true
  fontHeading: "Cormorant Garamond"
  fontBody: "JetBrains Mono"`)

// 1 — cover
S(`layout: cover
title: Dek
subtitle: A Guided Tour
byline: "One Markdown file · edit in code, with an LLM, or WYSIWYG"`)

// 2 — thesis
S(`layout: statement
text: >
  A deck is just text. Because the source is Markdown, anything that edits
  text — you, your editor, or an LLM — can build the slides.
cite: "the whole idea"`)

// 3 — section
S(`layout: section
title: Editing & Presenting
group: Editing & Presenting`)

// 4 — editor overview (screenshot)
shot(
  'The Editor at a Glance',
  'editor.png',
  [
    '**Top bar** — layout, canvas tools, and live style controls for the selection',
    '**Sidebar** — drag to reorder; drop one slide onto another to **group** them',
    '**Stage** — click any text to edit it in place',
    '**Notes** — speaker notes, shown later in Presenter view',
    'The dot by *saved* tracks every autosaved change',
  ],
  'Editing & Presenting',
)

// 5 — edit vs present
S(`layout: text
title: Edit and Present
group: Editing & Presenting
content: |
  - **Ctrl+E** toggles between editing and presenting
  - Move with the arrow keys, space, or just **scroll**
  - **F** fullscreen · **O** overview · **P** presenter view
  - Click straight onto a heading or bullet to rewrite it`)

// 6 — source pane (screenshot)
shot(
  'See the Markdown Live',
  'source-pane.png',
  [
    'Toggle **</> Source** to see the exact file the deck saves to',
    'Edit on **either** side — slide and text stay in sync',
    'Broken YAML is caught and shown, never silently saved',
    "Drag the pane's edge to resize it",
  ],
  'Editing & Presenting',
)

// 7 — section
S(`layout: section
title: The Canvas
group: The Canvas`)

// 8 — freeform canvas (screenshot)
shot(
  'Freeform: a Free Canvas',
  'canvas-handles.png',
  [
    'Select anything to **move, resize, and rotate** it',
    'The dot on top spins it — hold **Shift** to snap to 15°',
    'A **box** is text, shape, and image in one object',
    'Add a text box, rectangle, arrow, or image from the top bar',
  ],
  'The Canvas',
)

// 9 — conversion + stash
S(`layout: text
title: Layouts Convert Into Each Other
group: The Canvas
content: |
  - Pick any layout from the dropdown — shared content carries across
  - A statement becomes body text; a heading stays a heading
  - Add an element to any slide and it **bakes** into a freeform canvas
  - Nothing is lost: hidden fields are parked under \`stash:\` in the file`)

// 10 — text + image ratios (screenshot)
shot(
  'Text + Image, Your Way',
  'text-image-ratio.png',
  [
    'Choose the image shape: **16:9**, **1:1**, or **9:16**',
    'The text column grows as the image gets narrower',
    'Flip the image to the **left** or **right**',
    'Drag the image to **pan**, scroll to **zoom**',
  ],
  'The Canvas',
)

// 11 — section
S(`layout: section
title: Media
group: Media`)

// 12 — gallery controls (screenshot)
shot(
  'Galleries & Images',
  'gallery-controls.png',
  [
    'Hover a tile for **replace** and **remove**',
    'Drop an image straight onto a frame to swap it',
    'Set columns to **auto** or a fixed 2–4',
    'Every image is stored with the deck',
  ],
  'Media',
)

// 13 — live diagram
S(`# A real, editable diagram — change the \`code\` and it re-renders, themed.
layout: diagram
title: Diagrams From Text
group: Media
code: |
  flowchart LR
    A[Idea] --> B[Outline]
    B --> C[Draft]
    C --> D{Review}
    D -- yes --> E[Present]
    D -- no --> B`)

// 14 — live video
S(`layout: video-embed
group: Media
video: https://www.youtube.com/watch?v=qyZy-6VuSy4
poster: ""
caption: "Click to play — YouTube, Vimeo, or a direct .mp4 file"`)

// 15 — section
S(`layout: section
title: Present & Share
group: Present & Share`)

// 16 — presenter window (screenshot)
shot(
  'Presenter View on a Second Screen',
  'presenter.png',
  [
    'Press **P** for a **separate window** — drag it to another monitor',
    "See the current slide, what's **next**, your notes, and a timer",
    'Advancing in either window moves both',
    'Drag the divider to give notes more room',
  ],
  'Present & Share',
)

// 17 — files (screenshot)
shot(
  'Open & Save Real Files',
  'deck-menu.png',
  [
    '**Open file** or **Open folder** (deck + an Assets folder)',
    '**Save As** writes the .md plus every image beside it',
    'Switch between decks from the same menu',
    '**Export** to PDF or a standalone HTML file',
  ],
  'Present & Share',
)

// 18 — LLMs
S(`layout: text
title: Made for LLMs, Too
group: Present & Share
content: |
  - The whole deck is plain text — hand the .md to an LLM
  - Say what you want changed and let it edit the file
  - Even canvas elements are simple data an LLM can author
  - You stay in control: review, then present when ready`)

// 19 — closing
S(`layout: statement
group: Present & Share
text: >
  That's the tour. Delete these slides, or hand the file to an LLM and say
  what you want — then present.
cite: "now make it yours"`)

writeFileSync(OUT, slides.join('\n---\n') + '\n', 'utf8')
console.log(`wrote ${OUT} (${slides.length} blocks)`)
