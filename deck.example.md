# ─────────────────────────────────────────────────────────────────────────────
# Dek — a presentation is ONE Markdown file. This first block is the global
# config + theme; every following `---` block is a slide (a `layout:` plus that
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
  fontBody: "JetBrains Mono"
---
layout: cover
title: Dek
subtitle: A Guided Tour
byline: "One Markdown file · edit in code, with an LLM, or WYSIWYG"
---
layout: statement
text: >
  A deck is just text. Because the source is Markdown, anything that edits
  text — you, your editor, or an LLM — can build the slides.
cite: "the whole idea"
---
layout: section
title: Editing & Presenting
group: Editing & Presenting
---
layout: freeform
group: "Editing & Presenting"
elements:
  - { type: "box", x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: "The Editor at a Glance", font: "heading", italic: true, weight: 300, size: 44 }
  - { type: "box", x: 110, y: 172, w: 726, h: 468, rotation: 0, src: "Assets/tutorial/editor.png", fit: "contain", fill: "#0c0e12", stroke: "#283041", strokeWidth: 1, radius: 10 }
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- **Top bar** — layout, canvas tools, and live style controls for the selection\n- **Sidebar** — drag to reorder; drop one slide onto another to **group** them\n- **Stage** — click any text to edit it in place\n- **Notes** — speaker notes, shown later in Presenter view\n- The **disk icon** is the save state — a slash means autosave is off", font: "body", size: 21 }
---
layout: text
title: Edit and Present
group: Editing & Presenting
content: |
  - **Ctrl+E** presents — fullscreen — and **Esc** comes back
  - Move with the arrow keys, space, or just **scroll**
  - **F** fullscreen · **O** overview · **P** presenter view
  - **D** draws on the slide — press it again to wipe the ink
  - Click straight onto a heading or bullet to rewrite it
---
layout: freeform
group: "Editing & Presenting"
elements:
  - { type: "box", x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: "See the Markdown Live", font: "heading", italic: true, weight: 300, size: 44 }
  - { type: "box", x: 110, y: 172, w: 726, h: 468, rotation: 0, src: "Assets/tutorial/source-pane.png", fit: "contain", fill: "#0c0e12", stroke: "#283041", strokeWidth: 1, radius: 10 }
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- Toggle **</> Source** to see the exact file the deck saves to\n- Edit on **either** side — slide and text stay in sync\n- Broken YAML is caught and shown, never silently saved\n- Drag the pane's edge to resize it", font: "body", size: 21 }
---
layout: section
title: The Canvas
group: The Canvas
---
layout: freeform
group: "The Canvas"
elements:
  - { type: "box", x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: "Freeform: a Free Canvas", font: "heading", italic: true, weight: 300, size: 44 }
  - { type: "box", x: 110, y: 172, w: 726, h: 468, rotation: 0, src: "Assets/tutorial/canvas-handles.png", fit: "contain", fill: "#0c0e12", stroke: "#283041", strokeWidth: 1, radius: 10 }
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- Select anything to **move, resize, and rotate** it\n- The dot on top spins it — hold **Shift** to snap to 15°\n- A **box** is text, shape, and image in one object\n- Add a text box, rectangle, arrow, or image from the top bar", font: "body", size: 21 }
---
layout: text
title: Layouts Convert Into Each Other
group: The Canvas
content: |
  - Pick any layout from the dropdown — shared content carries across
  - A statement becomes body text; a heading stays a heading
  - Add an element to any slide and it **bakes** into a freeform canvas
  - Nothing is lost: hidden fields are parked under `stash:` in the file
---
layout: freeform
group: "The Canvas"
elements:
  - { type: "box", x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: "Text + Image, Your Way", font: "heading", italic: true, weight: 300, size: 44 }
  - { type: "box", x: 110, y: 172, w: 726, h: 468, rotation: 0, src: "Assets/tutorial/text-image-ratio.png", fit: "contain", fill: "#0c0e12", stroke: "#283041", strokeWidth: 1, radius: 10 }
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- Choose the image shape: **16:9**, **1:1**, or **9:16**\n- The text column grows as the image gets narrower\n- Flip the image to the **left** or **right**\n- Drag the image to **pan**, scroll to **zoom**", font: "body", size: 21 }
---
layout: section
title: Media
group: Media
---
layout: freeform
group: "Media"
elements:
  - { type: "box", x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: "Galleries & Images", font: "heading", italic: true, weight: 300, size: 44 }
  - { type: "box", x: 110, y: 172, w: 726, h: 468, rotation: 0, src: "Assets/tutorial/gallery-controls.png", fit: "contain", fill: "#0c0e12", stroke: "#283041", strokeWidth: 1, radius: 10 }
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- Hover a tile for **replace** and **remove**\n- Drop an image straight onto a frame to swap it\n- Set columns to **auto** or a fixed 2–4\n- Every image is stored with the deck", font: "body", size: 21 }
---
# A real, editable diagram — change the `code` and it re-renders, themed.
layout: diagram
title: Diagrams From Text
group: Media
code: |
  flowchart LR
    A[Idea] --> B[Outline]
    B --> C[Draft]
    C --> D{Review}
    D -- yes --> E[Present]
    D -- no --> B
---
layout: video-embed
group: Media
video: https://www.youtube.com/watch?v=qyZy-6VuSy4
poster: ""
caption: "Click to play — YouTube, Vimeo, or an .mp4 · framed or fullscreen from the top bar"
---
layout: section
title: Tables & Charts
group: Tables & Charts
---
# A table is rows — one line each, readable right here in the file.
layout: table
title: Which Layout When
group: Tables & Charts
table:
  header: true
  colWidths: [0.3, 0.7]
  rows:
    - [Layout, Reach for it when]
    - [Cover, the talk begins]
    - [Statement, one idea deserves the whole slide]
    - [Text + Image, a point needs its evidence beside it]
    - [Gallery, visuals are being compared]
    - [Table, the content has rows and columns — or numbers to chart]
    - [Freeform, nothing else fits]
---
layout: text
title: One Table, Three Views
group: Tables & Charts
content: |
  - The rows are the source — **table · pie · cloud** is only how they're shown
  - A pie reads labels from the first column, values from the first numeric one
  - In a chart, **Edit data** flips to the rows in place, and back
  - Paste a Markdown table into a Text slide, then switch its layout to **Table**
---
# The same kind of table, shown as a pie (view: pie).
layout: table
title: This Tour, by Section
group: Tables & Charts
table:
  view: pie
  header: true
  rows:
    - [Section, Slides]
    - ["Editing & Presenting", 4]
    - ["The Canvas", 4]
    - ["Media", 4]
    - ["Tables & Charts", 5]
    - ["Present & Share", 7]
---
# Words and weights, shown as a cloud (view: cloud).
layout: table
title: Layouts Used in This Tour
group: Tables & Charts
table:
  view: cloud
  header: true
  rows:
    - [Layout, Slides]
    - ["Cover", 1]
    - ["Statement", 2]
    - ["Section", 5]
    - ["Freeform", 7]
    - ["Text", 5]
    - ["Diagram", 1]
    - ["Video", 1]
    - ["Table", 3]
    - ["Poll", 1]
---
layout: section
title: Present & Share
group: Present & Share
---
layout: freeform
group: "Present & Share"
elements:
  - { type: "box", x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: "Presenter View on a Second Screen", font: "heading", italic: true, weight: 300, size: 44 }
  - { type: "box", x: 110, y: 172, w: 726, h: 468, rotation: 0, src: "Assets/tutorial/presenter.png", fit: "contain", fill: "#0c0e12", stroke: "#283041", strokeWidth: 1, radius: 10 }
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- Press **P**: this tab becomes your **presenter view**, the slides open in a **new window**\n- Drag that window to the projector — click it or press **F** for fullscreen\n- See the current slide, what's **next**, your notes, a timer, and build steps\n- Arrows in **either** window move both", font: "body", size: 21 }
---
# A live poll — present this slide and scan the code with your phone.
layout: poll
title: Which part of Dek will you try first?
group: Present & Share
poll:
  kind: choice
  options: [Live polls, Narration, The canvas, Tables and charts]
notes: |
  Present this slide: the poll opens, the QR code appears, and every phone
  that scans it can vote. Leaving the slide closes the poll.
  > Grab your phone and scan the code. Which part of Dek will you try first?
---
layout: text
title: Let Dek Present Itself
group: Present & Share
content: |
  - Notes lines starting with **>** are what you'd say out loud
  - Press **Enter** while presenting: Dek speaks them and moves on by itself
  - **●** records the whole thing as an MP4
  - Export **HTML with Narration** to share a deck that presents itself
notes: |
  Only what follows a > is spoken; the rest of the notes stay private.
  > Press Enter while presenting, and Dek reads lines like this one aloud, then turns the page by itself.
  > Record it with the dot button, or export it as HTML with narration for anyone who missed the lecture.
---
layout: freeform
group: "Present & Share"
elements:
  - { type: "box", x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: "Open & Save Real Files", font: "heading", italic: true, weight: 300, size: 44 }
  - { type: "box", x: 110, y: 172, w: 726, h: 468, rotation: 0, src: "Assets/tutorial/deck-menu.png", fit: "contain", fill: "#0c0e12", stroke: "#283041", strokeWidth: 1, radius: 10 }
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- Grant a **decks folder** once — **Open** and **Save As** are Dek's own panels\n- Each deck is a **.dek** bundle: the .md plus an Assets folder\n- Browse into **subfolders** to keep decks by course or topic\n- **Export** to PDF, PowerPoint, or a standalone HTML file", font: "body", size: 21 }
---
layout: text
title: Made for LLMs, Too
group: Present & Share
content: |
  - The whole deck is plain text — hand the .md to an LLM
  - Say what you want changed and let it edit the file
  - Even canvas elements are simple data an LLM can author
  - You stay in control: review, then present when ready
---
layout: statement
group: Present & Share
text: >
  That's the tour. Delete these slides, or hand the file to an LLM and say
  what you want — then present.
cite: "now make it yours"
