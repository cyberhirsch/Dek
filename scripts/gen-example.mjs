// Generates deck.example.md — the explanatory showcase deck that ships with Dek
// and seeds a fresh install. Run: `node scripts/gen-example.mjs`
//
// Sample images are inline SVG data-URIs so the deck is fully self-contained
// (no external files, works offline, survives Save As).

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '..', 'deck.example.md')

// ── inline SVG sample images ────────────────────────────────────────────────
function img(c1, c2, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="1600" height="900" fill="url(#g)"/>
<circle cx="1180" cy="250" r="230" fill="#ffffff" opacity="0.10"/>
<circle cx="320" cy="720" r="320" fill="#000000" opacity="0.12"/>
<text x="800" y="480" font-family="Cormorant Garamond, serif" font-size="120" fill="#ffffff" opacity="0.9" text-anchor="middle">${label}</text>
</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\n/g, ''))
}
function portrait(c1, c2, initials) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#g)"/>
<circle cx="200" cy="160" r="80" fill="#ffffff" opacity="0.85"/>
<rect x="90" y="250" width="220" height="160" rx="110" fill="#ffffff" opacity="0.85"/>
<text x="200" y="380" font-family="JetBrains Mono, monospace" font-size="42" fill="${c1}" text-anchor="middle">${initials}</text>
</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\n/g, ''))
}

const IMG = {
  ridge: img('#0b2447', '#7fc7ff', 'image-full'),
  still: img('#1a1333', '#ffb474', 'image-caption'),
  g1: img('#0b2447', '#19a974', 'A'),
  g2: img('#33122b', '#ffb474', 'B'),
  g3: img('#102a2a', '#7fc7ff', 'C'),
  panel: img('#231533', '#7fc7ff', 'pan / zoom me'),
  freeform: img('#0b2447', '#ffb474', ''),
}
const P1 = portrait('#0b2447', '#7fc7ff', 'AB')
const P2 = portrait('#33122b', '#ffb474', 'CD')

// ── deck ────────────────────────────────────────────────────────────────────
// Written by hand (not via the YAML lib) so the file stays human-friendly with
// comments and block scalars — exactly what an author or LLM would edit.

const slides = []
const S = (block) => slides.push(block.trimEnd())

S(`# ─────────────────────────────────────────────────────────────────────────────
# Dek — a presentation is ONE Markdown file. This first block is the global
# config + theme. Every following \`---\` block is a slide: a \`layout:\` plus that
# layout's named fields. Edit here in code, hand the file to an LLM, or use the
# in-browser WYSIWYG editor — all three read & write these same fields.
# ─────────────────────────────────────────────────────────────────────────────
deck: Dek — A Guided Tour
ratio: "16:9"                       # 1280×720 stage
paginate: true                      # page numbers, bottom-right
header: "Dek · a guided tour"       # running header on every slide
footer: "Press → or scroll · Ctrl+E toggles edit / present"
theme:
  bg: "#070809"
  text: "#e6ecf2"
  accent: "#7fc7ff"                 # blue  — headings / links / bullets
  accent2: "#ffb474"               # amber — secondary accent
  glow: true                        # soft background glow
  fontHeading: "Cormorant Garamond"
  fontBody: "JetBrains Mono"`)

S(`# 1 — cover: the title slide (oversized mark + subtitle + byline)
layout: cover
title: Dek
subtitle: A minimal presentation editor
byline: "One Markdown file · edit in code, with an LLM, or WYSIWYG"`)

S(`# 2 — section: a full-screen divider between parts of the talk
layout: section
title: The Basics`)

S(`# 3 — statement: one large centered line. Great for a thesis or quote.
#      \`cite\` is optional.
layout: statement
text: >
  A deck is just text. Because the source is Markdown, anything that edits
  text — you, your editor, or an LLM — can build the slides.
cite: "the whole idea"`)

S(`# 4 — text: a heading + a Markdown body. Lines starting with "- " are bullets;
#      other lines are paragraphs. Inline: **bold**, *italic*, <u>underline</u>,
#      ~~strikethrough~~ and \`code\`. Select text + the B / I / U / S buttons (or
#      Ctrl+B etc.) format in place — no need to leave the layout.
layout: text
title: Text & Formatting
content: |
  This is a plain paragraph. The lines below it are bullets:

  - **Bold** for emphasis, *italic* for nuance
  - <u>Underline</u> and ~~strikethrough~~ too
  - Inline \`code\` for keys like \`Ctrl+E\`
  - Toggle any line between bullet and paragraph with the list button`)

S(`# 5 — text-image: text on one side, an image on the other. \`side: left|right\`
#      moves the image. Click the image to pan; scroll to zoom (focus is saved).
layout: text-image
title: Text + Image
side: right
image: "${IMG.panel}"
content: |
  Put talking points beside a visual.

  - Flip the image to the **left** or **right** in the top bar
  - Drag the image to **pan**, scroll to **zoom**
  - Drop a new image on the frame to replace it`)

S(`# 6 — section divider (start of a group — see the sidebar)
layout: section
title: Images & Media
group: Images & Media`)

S(`# 7 — image-full: edge-to-edge image with an optional title/caption overlay.
layout: image-full
image: "${IMG.ridge}"
title: Full-bleed imagery
caption: "Overlay a title and caption on a gradient scrim"
focus: { x: 0, y: 0, scale: 1 }
group: Images & Media`)

S(`# 8 — image-caption: a framed image with a small credit. \`captionPos\` picks the
#      corner (bottom-right / bottom-left / top-right / top-left).
layout: image-caption
image: "${IMG.still}"
caption: "A framed still — captionPos sets the corner"
captionPos: bottom-right
focus: { x: 0, y: 0, scale: 1 }
group: Images & Media`)

S(`# 9 — gallery: 2–4 images in a grid. \`columns: auto\` fits to the count, or set
#      2 / 3 / 4. Each item is { image, label }.
layout: gallery
title: Gallery
columns: auto
items:
  - { image: "${IMG.g1}", label: "Before" }
  - { image: "${IMG.g2}", label: "After" }
  - { image: "${IMG.g3}", label: "Final" }
group: Images & Media`)

S(`# 10 — video-embed: click-to-play YouTube / Vimeo / .mp4. The poster falls back
#       to the video's own thumbnail when omitted.
layout: video-embed
video: https://www.youtube.com/watch?v=qyZy-6VuSy4
poster: ""
caption: "Click to play — YouTube, Vimeo, or a direct .mp4"
group: Images & Media`)

S(`# 11 — section divider
layout: section
title: Diagrams & Canvas
group: Diagrams & Canvas`)

S(`# 12 — diagram: a Mermaid flowchart from text. Edit the \`code\` and it re-renders
#       live, themed to the deck.
layout: diagram
title: Pipelines as Text
code: |
  flowchart LR
    A[Idea] --> B[Outline]
    B --> C[Draft]
    C --> D{Review}
    D -- yes --> E[Present]
    D -- no --> B
group: Diagrams & Canvas`)

S(`# 13 — speaker: a bio slide — 1–2 portraits + name + role.
layout: speaker
name: "Your Name"
role: "Lecturer · Designer · Enthusiast"
portraits:
  - "${P1}"
  - "${P2}"
group: Diagrams & Canvas`)

S(`# 14 — freeform: a free canvas of movable, rotatable elements, all stored right
#       here in the .md so an LLM can place them too. Element types:
#         box   — text AND shape in one (a text box = transparent fill/stroke;
#                 a rectangle = fill/stroke, no text)
#         arrow — a line with an arrowhead
#         image / video / diagram — positioned media
#       Tip: add a text box or shape to ANY layout and it converts to freeform,
#       baking the existing content into elements so nothing is lost.
layout: freeform
group: Diagrams & Canvas
elements:
  - { type: box, x: 90, y: 70, w: 760, h: 90, rotation: 0, content: "Freeform Canvas", font: heading, size: 64, bold: true, fill: transparent, stroke: transparent }
  - { type: box, x: 90, y: 190, w: 560, h: 230, rotation: 0, content: "Move, resize and rotate anything. A box is **text and shape** at once — give it a fill, a stroke, a corner radius, or leave it transparent for a pure text box.", font: body, size: 26, fill: transparent, stroke: transparent }
  - { type: box, x: 720, y: 250, w: 440, h: 260, rotation: -4, content: "I'm a rounded box\\nwith a fill", font: body, size: 28, align: center, color: "#07223a", fill: "#7fc7ff", stroke: "#cfe8ff", strokeWidth: 2, radius: 28 }
  - { type: arrow, x: 600, y: 340, w: 150, h: 0, rotation: 0, stroke: "#ffb474", strokeWidth: 4 }
  - { type: image, x: 90, y: 460, w: 360, h: 180, rotation: 3, src: "${IMG.freeform}", fit: cover }
  - { type: box, x: 480, y: 520, w: 360, h: 120, rotation: 0, content: "<u>Drag the handles</u> · the rotate dot is on top", font: body, size: 22, color: "#ffb474", fill: transparent, stroke: transparent }`)

S(`# 15 — back to a text slide to wrap up: presenting & saving
layout: text
title: Present & Save
content: |
  - **Present:** click ▶ Present (or Ctrl+E). Arrows, space, or **scroll** to move; **F** fullscreen, **O** overview, **P** presenter view
  - **Save / Open:** the deck is one .md — *Open file…*, *Open folder…* (deck + an Assets folder), or *Save As…* via the File System Access API
  - **Organize:** reorder and **group** slides in the sidebar, Keynote-style (see the groups in this deck)
  - **Export:** to PDF or a standalone HTML file`)

S(`# 16 — closing
layout: statement
text: >
  That's the whole tool. Delete these slides, or hand this file to an LLM and
  say what you want — then present.
cite: "now make it yours"`)

writeFileSync(OUT, slides.join('\n---\n') + '\n', 'utf8')
console.log(`wrote ${OUT} (${slides.length} blocks)`)
