# Dek

A minimal, single-file presentation editor. One Markdown file is the source of truth,
and you edit it three interchangeable ways: **in code**, **by handing the `.md` to any
LLM**, and
**visually (WYSIWYG) in the browser**.


## Status
**v0.1 — running.** Vite + Vue 3 + TS app that renders a `deck.md` through 10 named
layouts with the cinematic house theme, keyboard navigation, and a dev-server API that
round-trips edits back to the Markdown file (the shared write path for code / LLM /
WYSIWYG). Verified: parse ⇄ serialize is lossless, all layouts render, save API works,
typecheck clean.

### Run
```bash
npm install
npm run dev        # http://localhost:5173  — edits deck.md, hot-reloads
```

### Hosting (static, e.g. GitHub Pages)
**Live: https://cyberhirsch.github.io/Dek/**

Dek also runs with **no server**. `npm run build` produces a static `dist/` deployed on
every push to `main` by the GitHub Actions workflow in `.github/workflows/deploy.yml`
(Pages source: *GitHub Actions*). Persistence is pluggable (`src/storage/`): the dev server backend
writes real files during `npm run dev`; the **browser backend** (IndexedDB) powers the
hosted build, seeded from `deck.example.md`, with edits autosaved in-browser. Works in
Chromium browsers including Brave. A cloud-drive backend is planned, behind the same
interface.

**Open / Save As / New** live in the deck menu (the deck-name dropdown, top-left in
present mode and in the editor top bar):
- **Open file…** — pick a real local `.md` via the OS dialog (File System Access API,
  Chrome/Edge/Brave); edits autosave straight back to that file.
- **Save As…** — write the current deck to a new local file (or, where FS isn't
  available, a named copy in browser storage).
- **New deck…** and a list of in-app decks to switch between.
Arrow keys / Space / PageUp-Down / Home / End navigate. Press **Ctrl+E** (or ✎) to edit.
In present mode: **F** fullscreen · **O** overview grid · **P** presenter view (notes + next
slide + timer). Add speaker notes per slide from the notes strip under the editor.

On first run, `deck.md` is seeded from `deck.example.md`. **Your slide content stays local:**
`deck.md` and `public/Assets/` are gitignored — this repo ships the *tool*, not anyone's
lectures. The committed `deck.example.md` is the runnable starting point.

### Project structure
```
deck.md              active deck (source of truth, edited by all 3 paths)
template.md          layout reference library (one slide per layout)
vite.config.ts       dev-server API: GET/PUT /api/deck, PUT /api/slide, POST /api/upload
src/core/            types.ts (schema) + deck.ts (parser/serializer)
src/components/       Deck.vue (stage+nav), SlideView.vue (layout dispatcher), FramedImage.vue
src/styles/           base.css (tokens) + slide.css (per-layout styles)
src/api.ts            client over the dev API
```

### Built vs. next
- **Done:** format + parser/serializer; 11 layout renderers; theme tokens; scaled 16:9
  stage; keyboard nav; running header/footer/pagination; save API + image upload.
- **Done — WYSIWYG editor (`Ctrl+E` or ✎):** Keynote-style chrome — a **top bar**
  (layout picker, per-layout controls [image side, caption position, gallery columns],
  **undo/redo**, add / **add-as-layout** / duplicate / delete, group, autosave + save
  status, Done) and a **left sidebar slide navigator** with live thumbnails,
  click/shift/ctrl-select, **multi-select drag-to-reorder**, and **collapsible groups**
  (select → Group, drag a slide onto a header to join, rename via double-click, ungroup).
  In-place `contenteditable` text on every layout; bullet list add/remove (Enter /
  Backspace); image pan, scroll-zoom & drag-&-drop replace; **undo/redo** (`Ctrl+Z` /
  `Ctrl+Shift+Z`, coalesces typing); debounced autosave + manual save. Groups persist as a
  `group:` field per slide; all edits round-trip straight to `deck.md`.
- **Done — presenting:** fullscreen (F), an **overview grid** (O) with click-to-jump and
  group labels, and a **presenter view** (P) showing the current slide, next slide, speaker
  notes, and an elapsed timer. Notes are editable per slide (the strip below the editor) and
  persist as a `notes:` field.
- **Done — export (⤓):** a print view renders every slide as a 16:9 page →
  **Print / Save as PDF** (dependency-free), plus **Download HTML** — a self-contained
  `.html` (slides + inlined CSS) you can open or host anywhere.
- **Done — hardening:** Vitest parser round-trip suite (`npm test`), clean production
  build (`npm run build`), LF line-ending normalization.
- **Done — PDF import (`scripts/import_pdf.py`):** extracts text + images per page,
  classifies each into a layout, maps content to fields, folds typographic ligatures
  (ﬀ→ff), detects large YouTube/Vimeo links → `video-embed`, and emits `deck.md`.
  Imported the full **350-page** M7 source (gallery 59 · bullets 59 · image-full 55 ·
  bullets-image 53 · video-embed 51 · image-caption 40 · section 28 · statement 4 · cover 1).
  Heuristic-based — fix the odd slide in the editor.
  ```bash
  python scripts/import_pdf.py "path/to/source.pdf"   # → writes deck.md
  ```
- **No LLM UI by design** — hand the `.md` to any external LLM; the named-field schema is
  LLM-native, so its edits drop back in and coexist with WYSIWYG edits.

## Two versions
Dek runs as a **local dev** app (real files via a small server) and as a **hosted static**
app (browser storage + File System Access, on GitHub Pages). See **[docs/](./docs/)**:
- [docs/local-version.md](./docs/local-version.md) · [docs/hosted-version.md](./docs/hosted-version.md) · [docs/storage.md](./docs/storage.md)

## Read these first
- **[BRIEFING.md](./BRIEFING.md)** — vision, takeaways from Marp & Slidev, the three
  editing paths, the layout catalog (grounded in a 350-page classification of the M7
  PDF), and the conversion plan.
- **[FEATURES.md](./FEATURES.md)** — prioritized desirable-features list (P0/P1/P2).
- **[template.md](./template.md)** — the canonical layout library: one live, filled-in
  example per default layout. This file is the schema contract shared by code, LLM, and
  WYSIWYG.

## The default layouts
`cover` · `section` · `statement` · `speaker` · `bullets` · `bullets-image` ·
`image-full` · `image-caption` · `video-embed` · `gallery` · `diagram` · `freeform`

`diagram` renders a **Mermaid** flowchart from a `code` field — edit the text in the
editor's bottom panel (or hand it to an LLM) and the chart updates live.

(See `template.md` for each one's fields.)
