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
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- **Top bar** — layout, canvas tools, and live style controls for the selection\n- **Sidebar** — drag to reorder; drop one slide onto another to **group** them\n- **Stage** — click any text to edit it in place\n- **Notes** — speaker notes, shown later in Presenter view\n- The dot by *saved* tracks every autosaved change", font: "body", size: 21 }
---
layout: text
title: Edit and Present
group: Editing & Presenting
content: |
  - **Ctrl+E** toggles between editing and presenting
  - Move with the arrow keys, space, or just **scroll**
  - **F** fullscreen · **O** overview · **P** presenter view
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
caption: "Click to play — YouTube, Vimeo, or a direct .mp4 file"
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
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- Press **P** for a **separate window** — drag it to another monitor\n- See the current slide, what's **next**, your notes, and a timer\n- Advancing in either window moves both\n- Drag the divider to give notes more room", font: "body", size: 21 }
---
layout: freeform
group: "Present & Share"
elements:
  - { type: "box", x: 110, y: 54, w: 1060, h: 72, rotation: 0, content: "Open & Save Real Files", font: "heading", italic: true, weight: 300, size: 44 }
  - { type: "box", x: 110, y: 172, w: 726, h: 468, rotation: 0, src: "Assets/tutorial/deck-menu.png", fit: "contain", fill: "#0c0e12", stroke: "#283041", strokeWidth: 1, radius: 10 }
  - { type: "box", x: 868, y: 176, w: 302, h: 460, rotation: 0, content: "- **Open file** or **Open folder** (deck + an Assets folder)\n- **Save As** writes the .md plus every image beside it\n- Switch between decks from the same menu\n- **Export** to PDF or a standalone HTML file", font: "body", size: 21 }
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
