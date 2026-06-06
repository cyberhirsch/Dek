# ─────────────────────────────────────────────────────────────────────────────
# Dek — a presentation is ONE Markdown file. This first block is the global
# config + theme. Every following `---` block is a slide: a `layout:` plus that
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
  fontBody: "JetBrains Mono"
---
# 1 — cover: the title slide (oversized mark + subtitle + byline)
layout: cover
title: Dek
subtitle: A minimal presentation editor
byline: "One Markdown file · edit in code, with an LLM, or WYSIWYG"
---
# 2 — section: a full-screen divider between parts of the talk
layout: section
title: THE BASICS
---
# 3 — statement: one large centered line. Great for a thesis or quote.
#      `cite` is optional.
layout: statement
text: >
  A deck is just text. Because the source is Markdown, anything that edits
  text — you, your editor, or an LLM — can build the slides.
cite: "the whole idea"
---
# 4 — text: a heading + a Markdown body. Lines starting with "- " are bullets;
#      other lines are paragraphs. Inline: **bold**, *italic*, <u>underline</u>,
#      ~~strikethrough~~ and `code`. Select text + the B / I / U / S buttons (or
#      Ctrl+B etc.) format in place — no need to leave the layout.
layout: text
title: TEXT & FORMATTING
content: |
  This is a plain paragraph. The lines below it are bullets:

  - **Bold** for emphasis, *italic* for nuance
  - <u>Underline</u> and ~~strikethrough~~ too
  - Inline `code` for keys like `Ctrl+E`
  - Toggle any line between bullet and paragraph with the list button
---
# 5 — text-image: text on one side, an image on the other. `side: left|right`
#      moves the image. Click the image to pan; scroll to zoom (focus is saved).
layout: text-image
title: TEXT + IMAGE
side: right
image: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23231533%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%237fc7ff%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%221180%22%20cy%3D%22250%22%20r%3D%22230%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.10%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22720%22%20r%3D%22320%22%20fill%3D%22%23000000%22%20opacity%3D%220.12%22%2F%3E%3Ctext%20x%3D%22800%22%20y%3D%22480%22%20font-family%3D%22Cormorant%20Garamond%2C%20serif%22%20font-size%3D%22120%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.9%22%20text-anchor%3D%22middle%22%3Epan%20%2F%20zoom%20me%3C%2Ftext%3E%3C%2Fsvg%3E"
content: |
  Put talking points beside a visual.

  - Flip the image to the **left** or **right** in the top bar
  - Drag the image to **pan**, scroll to **zoom**
  - Drop a new image on the frame to replace it
---
# 6 — section divider (start of a group — see the sidebar)
layout: section
title: IMAGES & MEDIA
group: Images & Media
---
# 7 — image-full: edge-to-edge image with an optional title/caption overlay.
layout: image-full
image: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%230b2447%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%237fc7ff%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%221180%22%20cy%3D%22250%22%20r%3D%22230%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.10%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22720%22%20r%3D%22320%22%20fill%3D%22%23000000%22%20opacity%3D%220.12%22%2F%3E%3Ctext%20x%3D%22800%22%20y%3D%22480%22%20font-family%3D%22Cormorant%20Garamond%2C%20serif%22%20font-size%3D%22120%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.9%22%20text-anchor%3D%22middle%22%3Eimage-full%3C%2Ftext%3E%3C%2Fsvg%3E"
title: Full-bleed imagery
caption: "Overlay a title and caption on a gradient scrim"
focus: { x: 0, y: 0, scale: 1 }
group: Images & Media
---
# 8 — image-caption: a framed image with a small credit. `captionPos` picks the
#      corner (bottom-right / bottom-left / top-right / top-left).
layout: image-caption
image: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%231a1333%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffb474%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%221180%22%20cy%3D%22250%22%20r%3D%22230%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.10%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22720%22%20r%3D%22320%22%20fill%3D%22%23000000%22%20opacity%3D%220.12%22%2F%3E%3Ctext%20x%3D%22800%22%20y%3D%22480%22%20font-family%3D%22Cormorant%20Garamond%2C%20serif%22%20font-size%3D%22120%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.9%22%20text-anchor%3D%22middle%22%3Eimage-caption%3C%2Ftext%3E%3C%2Fsvg%3E"
caption: "A framed still — captionPos sets the corner"
captionPos: bottom-right
focus: { x: 0, y: 0, scale: 1 }
group: Images & Media
---
# 9 — gallery: 2–4 images in a grid. `columns: auto` fits to the count, or set
#      2 / 3 / 4. Each item is { image, label }.
layout: gallery
title: GALLERY
columns: auto
items:
  - { image: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%230b2447%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2319a974%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%221180%22%20cy%3D%22250%22%20r%3D%22230%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.10%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22720%22%20r%3D%22320%22%20fill%3D%22%23000000%22%20opacity%3D%220.12%22%2F%3E%3Ctext%20x%3D%22800%22%20y%3D%22480%22%20font-family%3D%22Cormorant%20Garamond%2C%20serif%22%20font-size%3D%22120%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.9%22%20text-anchor%3D%22middle%22%3EA%3C%2Ftext%3E%3C%2Fsvg%3E", label: "Before" }
  - { image: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2333122b%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffb474%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%221180%22%20cy%3D%22250%22%20r%3D%22230%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.10%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22720%22%20r%3D%22320%22%20fill%3D%22%23000000%22%20opacity%3D%220.12%22%2F%3E%3Ctext%20x%3D%22800%22%20y%3D%22480%22%20font-family%3D%22Cormorant%20Garamond%2C%20serif%22%20font-size%3D%22120%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.9%22%20text-anchor%3D%22middle%22%3EB%3C%2Ftext%3E%3C%2Fsvg%3E", label: "After" }
  - { image: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23102a2a%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%237fc7ff%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%221180%22%20cy%3D%22250%22%20r%3D%22230%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.10%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22720%22%20r%3D%22320%22%20fill%3D%22%23000000%22%20opacity%3D%220.12%22%2F%3E%3Ctext%20x%3D%22800%22%20y%3D%22480%22%20font-family%3D%22Cormorant%20Garamond%2C%20serif%22%20font-size%3D%22120%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.9%22%20text-anchor%3D%22middle%22%3EC%3C%2Ftext%3E%3C%2Fsvg%3E", label: "Final" }
group: Images & Media
---
# 10 — video-embed: click-to-play YouTube / Vimeo / .mp4. The poster falls back
#       to the video's own thumbnail when omitted.
layout: video-embed
video: https://www.youtube.com/watch?v=qyZy-6VuSy4
poster: ""
caption: "Click to play — YouTube, Vimeo, or a direct .mp4"
group: Images & Media
---
# 11 — section divider
layout: section
title: DIAGRAMS & CANVAS
group: Diagrams & Canvas
---
# 12 — diagram: a Mermaid flowchart from text. Edit the `code` and it re-renders
#       live, themed to the deck.
layout: diagram
title: PIPELINES AS TEXT
code: |
  flowchart LR
    A[Idea] --> B[Outline]
    B --> C[Draft]
    C --> D{Review}
    D -- yes --> E[Present]
    D -- no --> B
group: Diagrams & Canvas
---
# 13 — speaker: a bio slide — 1–2 portraits + name + role.
layout: speaker
name: "Your Name"
role: "Lecturer · Designer · Enthusiast"
portraits:
  - "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20400%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%230b2447%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%237fc7ff%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%22200%22%20cy%3D%22160%22%20r%3D%2280%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.85%22%2F%3E%3Crect%20x%3D%2290%22%20y%3D%22250%22%20width%3D%22220%22%20height%3D%22160%22%20rx%3D%22110%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.85%22%2F%3E%3Ctext%20x%3D%22200%22%20y%3D%22380%22%20font-family%3D%22JetBrains%20Mono%2C%20monospace%22%20font-size%3D%2242%22%20fill%3D%22%230b2447%22%20text-anchor%3D%22middle%22%3EAB%3C%2Ftext%3E%3C%2Fsvg%3E"
  - "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20400%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%2333122b%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffb474%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22400%22%20height%3D%22400%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%22200%22%20cy%3D%22160%22%20r%3D%2280%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.85%22%2F%3E%3Crect%20x%3D%2290%22%20y%3D%22250%22%20width%3D%22220%22%20height%3D%22160%22%20rx%3D%22110%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.85%22%2F%3E%3Ctext%20x%3D%22200%22%20y%3D%22380%22%20font-family%3D%22JetBrains%20Mono%2C%20monospace%22%20font-size%3D%2242%22%20fill%3D%22%2333122b%22%20text-anchor%3D%22middle%22%3ECD%3C%2Ftext%3E%3C%2Fsvg%3E"
group: Diagrams & Canvas
---
# 14 — freeform: a free canvas of movable, rotatable elements, all stored right
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
  - { type: box, x: 90, y: 70, w: 760, h: 90, rotation: 0, content: "FREEFORM CANVAS", font: heading, size: 64, bold: true, fill: transparent, stroke: transparent }
  - { type: box, x: 90, y: 190, w: 560, h: 230, rotation: 0, content: "Move, resize and rotate anything. A box is **text and shape** at once — give it a fill, a stroke, a corner radius, or leave it transparent for a pure text box.", font: body, size: 26, fill: transparent, stroke: transparent }
  - { type: box, x: 720, y: 250, w: 440, h: 260, rotation: -4, content: "I'm a rounded box\nwith a fill", font: body, size: 28, align: center, color: "#07223a", fill: "#7fc7ff", stroke: "#cfe8ff", strokeWidth: 2, radius: 28 }
  - { type: arrow, x: 600, y: 340, w: 150, h: 0, rotation: 0, stroke: "#ffb474", strokeWidth: 4 }
  - { type: image, x: 90, y: 460, w: 360, h: 180, rotation: 3, src: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%230b2447%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23ffb474%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%221600%22%20height%3D%22900%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%221180%22%20cy%3D%22250%22%20r%3D%22230%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.10%22%2F%3E%3Ccircle%20cx%3D%22320%22%20cy%3D%22720%22%20r%3D%22320%22%20fill%3D%22%23000000%22%20opacity%3D%220.12%22%2F%3E%3Ctext%20x%3D%22800%22%20y%3D%22480%22%20font-family%3D%22Cormorant%20Garamond%2C%20serif%22%20font-size%3D%22120%22%20fill%3D%22%23ffffff%22%20opacity%3D%220.9%22%20text-anchor%3D%22middle%22%3E%3C%2Ftext%3E%3C%2Fsvg%3E", fit: cover }
  - { type: box, x: 480, y: 520, w: 360, h: 120, rotation: 0, content: "<u>Drag the handles</u> · the rotate dot is on top", font: body, size: 22, color: "#ffb474", fill: transparent, stroke: transparent }
---
# 15 — back to a text slide to wrap up: presenting & saving
layout: text
title: PRESENT & SAVE
content: |
  - **Present:** click ▶ Present (or Ctrl+E). Arrows, space, or **scroll** to move; **F** fullscreen, **O** overview, **P** presenter view
  - **Save / Open:** the deck is one .md — *Open file…*, *Open folder…* (deck + an Assets folder), or *Save As…* via the File System Access API
  - **Organize:** reorder and **group** slides in the sidebar, Keynote-style (see the groups in this deck)
  - **Export:** to PDF or a standalone HTML file
---
# 16 — closing
layout: statement
text: >
  That's the whole tool. Delete these slides, or hand this file to an LLM and
  say what you want — then present.
cite: "now make it yours"
