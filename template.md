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
# 5. bullets — ALL-CAPS heading + bullet list. No image.
#    Use real "- " list items; nesting allowed.
# ============================================================================
layout: bullets
title: "ABLAUF HEUTE"
items:
  - Questionnaire
  - Anwesenheitsliste
  - Semesterablauf
  - Rechnercheck

---

# ============================================================================
# 6. bullets-image — heading + bullets on one side, image on the other.
#    `side: left | right` controls which side the image sits on.
# ============================================================================
layout: bullets-image
title: "BOKEH"
side: left
image: Assets/M7_p081_img1.jpeg
items:
  - "**Sensorgröße (Filmback)** — je größer, desto unschärfer"
  - "**Brennweite (Focal length)** — je länger, desto unschärfer"
  - "**Blende (Aperture)** — je offener, desto unschärfer"

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
# 10. freeform — escape hatch. Raw HTML/CSS body for tables, quizzes, and
#     bespoke slides. Only here is hand-written markup expected. Keep rare.
# ============================================================================
layout: freeform
title: "Bewertungskriterien"
body: |
  <table style="width:100%; border-collapse:collapse; font-size:1.1rem;">
    <tr><td>1. Umsetzung und Präsentation</td><td style="text-align:right;">50 Punkte</td></tr>
    <tr><td>2. Organisatorische Kompetenz</td><td style="text-align:right;">25 Punkte</td></tr>
    <tr><td>3. Dokumentation</td><td style="text-align:right;">25 Punkte</td></tr>
  </table>
