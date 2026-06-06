---
# ──────────────────────────────────────────────────────────────────────────────
# Dek — TEMPLATE / LAYOUT LIBRARY
# ──────────────────────────────────────────────────────────────────────────────
# This file is the canonical reference deck: one slide per default layout, each
# with its full field schema filled in with example content. Copy a slide, change
# the fields, and you have a new slide. The same fields are what the WYSIWYG editor
# and the LLM read/write — so this file IS the contract between all three paths.
#
# Format: Markdown, slides separated by `---`. Each slide opens with a YAML
# front-matter block declaring `layout:` + that layout's named fields. The body
# below the front-matter is only used by `freeform`.
#
# Global deck config + design tokens live in this first front-matter block.
# ──────────────────────────────────────────────────────────────────────────────
deck: M7 Film- und Postproduktion
ratio: "16:9"            # 1280×720
paginate: true
header: "HMKW – GDVK – M7 Film- und Postproduktion"   # persistent running header
footer: "Prof. Seb Hirsch · M7 Film- und Postproduktion"
theme:
  bg: "#070809"
  text: "#e6ecf2"
  accent: "#7fc7ff"      # H2 / links — blue
  accent2: "#ffb474"     # H3 — amber
  glow: true             # subtle dual radial-gradient background glow
  fontHeading: "Cormorant Garamond"   # italic, light
  fontBody: "JetBrains Mono"
---

# ============================================================================
# 1. cover — title slide. Oversized module mark, optional subtitle.
# ============================================================================
layout: cover
title: "M7"
subtitle: "Film- und Postproduktion"
byline: "Seb Hirsch · Lecturer, Visual Effects Artist & Motion Designer"

---

# ============================================================================
# 2. section — section divider. One large centered word/phrase.
# ============================================================================
layout: section
title: "WELCOME!"

---

# ============================================================================
# 3. statement — large centered statement / quote / definition.
#    `cite` is optional (source / attribution).
# ============================================================================
layout: statement
text: >
  Motion Graphics Design wendet die Prinzipien des Grafikdesigns
  in einem filmischen oder zeitbasierten Kontext an.
cite: ""

---

# ============================================================================
# 4. speaker — bio slide. 1–2 portraits + name + role line.
# ============================================================================
layout: speaker
name: "Seb Hirsch"
role: "Lecturer, Consultant, Designer, Director, Artist, Enthusiast"
portraits:
  - Assets/M7_p003_img1.jpeg
  - Assets/M7_p003_img2.jpeg

---

# ============================================================================
# 5. text — ALL-CAPS heading + a Markdown content block. No image.
#    `content` is plain Markdown: a line starting with `- ` is a bullet, any
#    other non-empty line is a paragraph. Inline: **bold**, *italic*,
#    <u>underline</u>, `code`.
# ============================================================================
layout: text
title: "ABLAUF HEUTE"
content: |
  - Questionnaire
  - Anwesenheitsliste

  Plain paragraph between bullet groups

  - Semesterablauf
  - Rechnercheck

---

# ============================================================================
# 6. text-image — heading + content on one side, image on the other.
#    `side: left | right` controls which side the image sits on.
# ============================================================================
layout: text-image
title: "BOKEH"
side: left
image: Assets/M7_p081_img1.jpeg
content: |
  - **Sensorgröße (Filmback)** — je größer, desto unschärfer
  - **Brennweite (Focal length)** — je länger, desto unschärfer
  - **Blende (Aperture)** — je offener, desto unschärfer

---

# ============================================================================
# 7. image-full — full-bleed image. Optional overlaid title/caption on a
#    bottom gradient scrim. Image pan/zoom stored as fields (set by WYSIWYG).
# ============================================================================
layout: image-full
image: Assets/M7_p005_img1.jpeg
title: ""              # optional overlay heading
caption: ""            # optional overlay caption
focus: { x: 0, y: 0, scale: 1.0 }   # pan/zoom from the visual editor

---

# ============================================================================
# 8. image-caption — single framed image + small caption / credit.
#    `captionPos` defaults to bottom-right (film-still credit style).
# ============================================================================
layout: image-caption
image: Assets/M7_p201_img1.jpeg
caption: "The Lord of the Rings: The Two Towers (2002)"
captionPos: bottom-right
focus: { x: 0, y: 0, scale: 1.0 }

---

# ============================================================================
# 8b. video-embed — click-to-play video (YouTube / Vimeo / .mp4 file).
#     `poster` is the still shown before play (the PDF baked these in as JPEGs);
#     falls back to the YouTube thumbnail if omitted. Many "image" pages in the
#     source M7 PDF are actually linked videos — this is the layout for them.
# ============================================================================
layout: video-embed
video: https://www.youtube.com/watch?v=qyZy-6VuSy4
poster: Assets/M7_p201_img1.jpeg
caption: "The Lord of the Rings: The Two Towers (2002)"

---

# ============================================================================
# 9. gallery — 2–4 images in a grid / comparison. Each item: image + label.
#    `columns: auto` lays out based on count; or set 2/3/4.
# ============================================================================
layout: gallery
title: "How to screenshot"
columns: auto
items:
  - { image: Assets/M7_p008_img2.jpeg, label: "Win" }
  - { image: Assets/M7_p008_img3.jpeg, label: "Mac" }

---

# ============================================================================
# 9b. diagram — a Mermaid flowchart from text. Write/generate the `code`; it
#     renders live (themed to the deck). Great for processes & pipelines.
#     Edit the code in the editor's bottom panel, or hand it to an LLM.
# ============================================================================
layout: diagram
title: "Post-Production Pipeline"
code: |
  flowchart LR
    A[Shoot] --> B[Editorial]
    B --> C[VFX]
    B --> D[Color Grade]
    C --> E[Online]
    D --> E
    E --> F[Deliver]

---

# ============================================================================
# 10. freeform — a free canvas of positioned, rotatable `elements`. This is
#     where the visual editor's text boxes, shapes and arrows live, and an LLM
#     can author them too. Any layout that is edited freely becomes `freeform`.
#
#     Each element: { type, x, y, w, h, rotation } in 1280×720 stage pixels
#     (top-left origin). Types so far:
#       text   — { content (inline Markdown), align, size, color, bold }
#       rect   — { fill, stroke, strokeWidth, radius }
#       arrow  — { stroke, strokeWidth }  (drawn left→right inside its box)
#
#     A `body:` of raw HTML is still supported as a legacy escape hatch.
# ============================================================================
layout: freeform
elements:
  - { type: rect, x: 120, y: 160, w: 420, h: 220, rotation: 0, fill: "#7fc7ff22", stroke: "#7fc7ff", strokeWidth: 2, radius: 12 }
  - { type: text, x: 150, y: 200, w: 360, h: 80, content: "**A free text box** you can move & rotate", size: 32 }
  - { type: arrow, x: 560, y: 270, w: 260, h: 0, rotation: 0, stroke: "#ffb474", strokeWidth: 3 }
  - { type: text, x: 840, y: 240, w: 300, h: 80, content: "<u>pointing here</u>", size: 28, color: "#ffb474" }
