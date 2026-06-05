# Dek — Briefing

> A minimal, single-file presentation editor where the **same deck** can be edited
> three ways: by hand in code, by an LLM, and visually (WYSIWYG) in the browser —
> with one Markdown file as the single source of truth.

*Working name. Repo lives next to its two reference projects in `lectures/Repos/`.*

---

## 1. Why this exists

The M7 *Film- und Postproduktion* course deck is **350 slides** currently trapped in a
PDF (exported from PowerPoint/Keynote). It has already been semi-converted to Marp
(`Film und Postproduktion/Slides/Week 01–13.md`) using absolute-positioned `<div>`s
auto-generated from the PDF geometry — which is brittle, ugly to hand-edit, and not
LLM-friendly.

We want a tool that lets us:

1. **Re-author** that PDF into a clean, layout-based format (no absolute-pixel soup).
2. **Maintain** it long-term by editing prose in code *or* nudging an LLM *or* dragging
   things around in the browser — interchangeably, against the **same file**.
3. Keep the result **portable and exportable** (HTML / PDF / PPTX), like Marp.

---

## 2. Takeaways from the two reference repos

We are deliberately stealing the best of both and dropping their pain points.

### Marp (`lectures/Repos/marp`, `marp themes`)
**Take:**
- One **plain-Markdown file = the whole deck**. Diff-able, git-able, LLM-pasteable.
- **Themes are just CSS.** Design tokens live in one place; slides stay clean.
- First-class **export to PDF / PPTX / HTML**, CLI-driven.
- `---` as the universal slide separator; YAML front-matter for global config.

**Leave:**
- No real interactivity, no components, no in-browser editing.
- Per-slide layout control is awkward (you fight CSS per slide).
- The auto-generated absolute-`<div>` Marp slides we already have are unmaintainable.

### Slidev (`lectures/Repos/slidev-repo`, `Slidev-Slides`)
**Take:**
- **Named layouts** (`layout: two-cols`, etc.) + structured front-matter per slide.
- Vue components, so a slide can be *interactive* (the editor itself ships as a component).
- The **WYSIWYG editor we already prototyped** in `Slidev-Slides/global-bottom.vue`:
  - Floating edit button + `Ctrl+E`, full-screen overlay, left control panel + live preview.
  - **Layout picker**, title/subtitle/body fields, **contenteditable** direct text edit.
  - **Image pan / zoom / drag-to-reposition**, scroll-to-zoom, **drag-&-drop upload**.
  - **Autosave** (debounced) back to `slides.md` through a tiny Vite middleware API
    (`/api/get-slides`, `/api/save-slide`, `/api/upload-image` in `vite.config.ts`),
    using `@slidev/parser` `parseSync`/`stringify` so edits round-trip to Markdown.

**Leave:**
- Heavy toolchain (pnpm monorepo, many deps) and a busy default UI/navbar.
- The prototype's parser is fragile: it reverse-engineers fields out of raw HTML with
  regexes and strips `<div>`s heuristically. We want **structured front-matter fields**
  as the source of truth so parse/serialize is lossless.

### Net design decisions
- **Source of truth:** one Markdown file, `---`-separated slides, **YAML front-matter
  per slide** carrying `layout` + named content fields (not raw positioned HTML).
- **Layouts are a closed, named set** (see §4) rendered by the runtime — the editor and
  the LLM both target the *same* field schema, so all three editing paths converge.
- **Freeform escape hatch** for the rare custom slide (raw HTML/CSS body), but it is the
  exception, not the default.
- **Minimal UI:** the deck *is* the UI. One floating button reveals the editor; an LLM
  prompt box and a code drawer hang off the same overlay.

---

## 3. The three editing paths (must stay in sync)

```
                 ┌──────────────────────────┐
   code  ───────▶│                          │
   (editor /     │   deck.md  (1 file)      │◀─────── WYSIWYG overlay
    any IDE)     │   front-matter + body    │         (drag / type / drop)
   LLM   ───────▶│                          │
   (prompt box)  └──────────────────────────┘
                       parse ⇄ serialize
                    (lossless, field-based)
```

- **Code:** edit `deck.md` directly. Hot-reload reflects it.
- **LLM:** a prompt box sends the *current slide(s)* + schema to the model; the model
  returns updated front-matter fields (a constrained JSON/YAML patch), which is written
  back through the same save API. The LLM never invents layouts outside the closed set.
- **WYSIWYG:** the overlay reads/writes the *same* structured fields. Contenteditable text,
  image pan/zoom/upload, and layout switching all serialize to front-matter.

The non-negotiable invariant: **all three paths read and write the identical field
schema**, so none of them clobbers the others.

---

## 4. Default layouts (identified in the M7 PDF)

Classified automatically over all **350 pages** of
`Input/M7 Film- und Postproduktion 2026 (1).pdf` (720×405, 16:9). Raw counts:

| Count | Raw bucket            | → Template layout(s)                |
|------:|-----------------------|-------------------------------------|
|  113  | full-bleed image      | `image-full`                        |
|   52  | title + bullets + img | `bullets-image` (image left/right)  |
|   42  | image + caption       | `image-caption`                     |
|   39  | image grid / gallery  | `gallery`                           |
|   36  | text-heavy / table    | `bullets` / `freeform`              |
|   25  | big centered statement| `statement`                         |
|   23  | title + bullets       | `bullets`                           |
|   14  | mixed / custom        | `freeform`                          |
|    6  | single big word       | `section`                           |

Consolidated into the **canonical layout set** the tool ships with (defined with live
examples in [`template.md`](./template.md)):

1. **`cover`** — Title slide. Oversized module title (e.g. giant "M7"), optional subtitle.
   *Persistent top-left running header on every slide:* `HMKW – GDVK – M7 Film- und Postproduktion`.
2. **`section`** — Section divider. One large word/phrase centered (`WELCOME!`, `GEN AI`).
3. **`statement`** — Large centered statement / quote / definition (the Cormorant-italic
   "Motion Graphics Design wendet die Prinzipien…" pages).
4. **`speaker`** — Bio slide: one or two portrait images + name + role line.
5. **`bullets`** — Heading (top-left, ALL-CAPS) + bullet list (the `■`-marker lists like
   `ABLAUF HEUTE`, `RECHNERCHECK`). No image.
6. **`bullets-image`** — Heading + bullets on one side, image on the other
   (`side: left | right`). The most common content layout (e.g. `BOKEH`).
7. **`image-full`** — Full-bleed image covering the slide, with an **optional** overlaid
   title/caption on a bottom gradient scrim.
8. **`image-caption`** — A single framed image with a small caption/credit
   (e.g. film stills: *"The Lord of the Rings: The Two Towers (2002)"*, bottom-right).
9. **`gallery`** — 2–4 images in a grid / side-by-side comparison, each with optional
   label (e.g. the `Win` / `Mac` "How to screenshot" slide).
10. **`freeform`** — Escape hatch: raw HTML/CSS body for tables, quizzes, and the handful
    of bespoke slides that don't fit a named layout.

### Design tokens (the deck's "house style", from the existing slides)
- Background `#070809` with subtle dual radial-gradient glow (blue `#7fc7ff`, amber `#ffb474`).
- Body / mono font: **JetBrains Mono**. Headings: **Cormorant Garamond**, italic, light.
- Text `#e6ecf2`; H2 accent blue `#7fc7ff`; H3 accent amber `#ffb474`.
- 16:9, paginated, persistent footer/header line.

These live as CSS variables in the theme so a single edit re-skins all 350 slides.

---

## 5. Conversion plan for the M7 PDF

1. **Extract** text blocks + images per page with PyMuPDF (`fitz`) — scripts already exist
   in `Film und Postproduktion/scratch/` and the `Assets/` images are already dumped
   (`M7_pNNN_imgM.jpeg`).
2. **Classify** each page into one of the 10 canonical layouts (the §4 classifier is the
   starting heuristic — see counts above).
3. **Emit** a clean `deck.md` slide per page: pick the layout, fill its named fields
   (title, bullets, image, caption…), **discard absolute pixel positions**.
4. **Human/LLM pass** to fix misclassifications and tidy prose — fast, because every slide
   is now a handful of readable fields instead of positioned `<div>`s.
5. **Export** to PDF/PPTX for distribution; keep `deck.md` as the maintained master.

---

## 6. Out of scope (for v1)
- Real-time multi-user collaboration.
- Animations/transitions beyond simple build steps.
- A custom theme designer UI (themes stay as hand-edited CSS variables).
- Cloud hosting / auth.

See [`FEATURES.md`](./FEATURES.md) for the prioritized feature list and
[`template.md`](./template.md) for the live layout library.
