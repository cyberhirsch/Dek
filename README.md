# Dek

A minimal, single-file presentation editor. **One Markdown file is the whole deck**, and
you can edit it three interchangeable ways:

1. **In code** — open `deck.md` in any text editor.
2. **By LLM** — hand the `.md` to any model; the schema is named-field and LLM-native, so
   its edits drop straight back in.
3. **WYSIWYG** — edit visually in the browser (`Ctrl+E`), including a free-positioning
   canvas.

All three read and write the *same* fields, so you can move between them freely without
losing anything.

**Live demo:** https://cyberhirsch.github.io/Dek/

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 — edits ./deck.md, hot-reloads
```

On first run `deck.md` is seeded from `deck.example.md` (the guided-tour deck). Your slide
content stays local: **`deck.md` and `public/Assets/` are gitignored** — this repo ships the
*tool*, not anyone's slides.

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server with the file-backed deck API (real `deck.md` reads/writes). |
| `npm run build` | Typecheck (`vue-tsc -b`) + build a static `dist/`. |
| `npm run preview` | Serve the built `dist/` locally. |
| `npm test` | Vitest — parser round-trip (`parse ⇄ serialize` is lossless). |

Requires Node 18+. WYSIWYG works in any modern browser; the **local-file** features
(Open file / Save As to disk) use the File System Access API (Chrome / Edge / Brave).

---

## The file format

A deck is a stream of `---`-delimited **YAML blocks**:

- The **first block** is the global deck config (theme, header/footer, ratio…).
- **Every following block is one slide:** a `layout:` plus that layout's named fields.

```markdown
---
deck: My Talk
ratio: "16:9"
paginate: true
header: My Talk · 2025
footer: "Press → or scroll · Ctrl+E toggles edit / present"
theme:
  bg: "#070809"
  text: "#e6ecf2"
  accent: "#7fc7ff"
  accent2: "#ffb474"
  glow: true
  fontHeading: Cormorant Garamond
  fontBody: JetBrains Mono
---
layout: cover
title: My Talk
subtitle: A subtitle
byline: One Markdown file
---
layout: text
title: The Point
content: |
  - First point
  - Second point
  A plain paragraph (no leading dash).
---
```

Parser/serializer details (`src/core/`):

- **Lossless round-trip.** Unknown fields are preserved verbatim, so the schema can grow
  without breaking older decks. Verified by the Vitest suite.
- **Reversible layout switching.** Fields that the current layout doesn't render are parked
  under `stash:` instead of being dropped, so switching `text → statement → text` is
  non-destructive.
- **Legacy aliases.** Old layout names load transparently (`bullets → text`,
  `bullets-image → text-image`), as do legacy `items` lists (migrated into Markdown
  `content`).
- The config block is optional; a deck whose first block already declares a `layout:` is
  treated as all-slides.

---

## Layouts

Twelve built-in layouts. Each slide also accepts `notes:` (speaker notes) and `group:`
(sidebar section), and inherits the deck's running `header` / `footer` / pagination.

| Layout | Purpose | Key fields |
|--------|---------|-----------|
| `cover` | Title slide | `title`, `subtitle`, `byline` |
| `section` | Divider | `title` |
| `statement` | One bold line | `text`, `cite` |
| `speaker` | Bio / portraits | `name`, `role`, `portraits[]` |
| `text` | Heading + body | `title`, `content` (Markdown: `- ` = bullet, else paragraph) |
| `text-image` | Body beside a picture | `title`, `content`, `image`, `side` (left/right), `imageRatio` (16:9/1:1/9:16) |
| `image-full` | Full-bleed image | `image`, `title`, `caption`, `focus` |
| `image-caption` | Framed image + credit | `image`, `caption`, `captionPos` |
| `video-embed` | Embedded video | `video` (YouTube/Vimeo/file), `poster`, `caption` |
| `gallery` | Image grid | `title`, `items[]` ({image,label}), `columns` (auto/2–4) |
| `diagram` | Mermaid chart | `title`, `code` (live Mermaid source) |
| `freeform` | Blank canvas | `body` (HTML) and/or `elements[]` |

Images use a `focus: {x, y, scale}` for pan/zoom inside their frame (set by dragging /
scrolling in the editor). See **[template.md](./template.md)** for one filled-in example
of every layout — it's the canonical schema contract shared by code, LLM, and WYSIWYG.

---

## The freeform canvas

Any slide can carry an `elements[]` array of free-positioned objects drawn over the layout
(Google-Slides style). Coordinates are in **1280×720 stage pixels** (top-left origin), so
they scale with the slide.

- **One unified `box`** backs both text and shapes: a rectangle is a box with a fill/stroke;
  a text box is a box with transparent fill/stroke and `content`; an image is a box with a
  `src`. A box can have all three at once. Boxes also support `arrow`, `video`, and
  `diagram` element types.
- **Auto-shrink text.** A box's configured `size` is the *maximum*; if text overflows, the
  font scales down to fit instead of being clipped.
- **Drag-to-create.** Pick a tool (text / box / arrow / image) and **click the top-left
  corner, then drag out the size** — a live ghost previews the result. Arrows drag tail →
  head. Images: pick the file, then drag to place it.
- **Baking.** The moment you edit a semantic slide freely (add or move an element), its
  `layout` flips to `freeform` and the layout's content is "baked" into editable elements —
  nothing is lost, the slide just becomes a canvas. Heading boxes keep the light-italic
  Cormorant look.

---

## The editor (`Ctrl+E`)

A Keynote-style editing surface:

**Top bar** — deck menu (New / Open / Save As / Export / switch decks), autosave toggle +
save status, undo/redo, a **layout picker**, per-layout controls (image side, ratio,
caption position, gallery columns), **canvas tools** (select / text / box / arrow / insert
image) and an **Insert** menu (video / diagram / table). When an element is selected, its
style controls appear: fill / stroke / radius colour pickers, font, size, weight, text
colour, bold/italic/underline, alignment.

**Sidebar navigator** — live slide thumbnails with click / shift / ⌘-ctrl multi-select,
**drag-to-reorder** (multi-select aware), and **collapsible groups** (drag a slide onto a
header to join; double-click a header to rename). A pinned, non-scrolling action header
holds: add slide (press-and-hold to pick a layout), duplicate, delete, group, **autogroup**
(group each section + the slides under it, named after the section), and **collapse/expand
all**.

**Source pane** (`</>`) — edit the raw Markdown live, side-by-side; it auto-scrolls to the
selected slide.

**Notes strip** — speaker notes per slide (persist as `notes:`), shown later in Presenter
view.

### Keyboard

| Key | Action |
|-----|--------|
| `Ctrl/⌘ + E` | Toggle edit / present |
| `Ctrl/⌘ + Z` · `Ctrl/⌘ + Shift + Z` (or `Ctrl + Y`) | Undo / redo (coalesces typing) |
| `Ctrl/⌘ + Shift + 8` | Toggle bullets on the selection |
| `V` / `T` | Select tool / text tool (in edit mode) |
| `Delete` / `Backspace` | Delete selected element, or selected slide (when the navigator has focus) |
| `Esc` | Blur field → deselect element → exit edit mode |
| `→ ← ↑ ↓` `Space` `PgUp/PgDn` `Home` `End` | Navigate slides (present mode) |
| `F` / `O` / `P` | Fullscreen / overview grid / presenter view |

### Presenting & export

- **Overview grid** (`O`) — all slides with group labels, click to jump.
- **Presenter view** (`P`) — current slide, next slide, notes, and an elapsed timer (opens
  a second window so the audience screen stays clean).
- **Export** (deck menu) — a print view renders every slide as a 16:9 page →
  **Print / Save as PDF** (dependency-free), plus **Download HTML**: a self-contained
  `.html` (slides + inlined CSS) you can open or host anywhere.

---

## Storage & hosting

Persistence is pluggable behind one interface (`src/storage/`):

| Backend | Used when | Writes to |
|---------|-----------|-----------|
| `server.ts` | `npm run dev` | real files via the dev API (`deck.md`, `public/Assets/`) |
| `browser.ts` | hosted static build | IndexedDB (`idb.ts`), seeded from `deck.example.md` |
| `fs.ts` | "Open file…" | a real local `.md` (File System Access API) |
| `fsdir.ts` | "Open folder…" / "Save As… (folder + images)" | a folder with the `.md` + an assets subfolder |

**Dev API** (in `vite.config.ts`): `GET /api/decks`, `GET|PUT /api/deck`,
`PUT /api/slide`, `POST /api/save-as`, `POST /api/new`, `POST /api/upload`. The dev server
ignores deck/asset writes in its file watcher so autosave doesn't trigger a reload.

**Hosting:** `npm run build` emits a static `dist/` (built with a relative `base` so it
works under a sub-path). `.github/workflows/deploy.yml` deploys it to GitHub Pages on every
push to `main`. The hosted app needs no server — it runs entirely on the browser backend.

More detail in **[docs/](./docs/)**:
[local-version.md](./docs/local-version.md) ·
[hosted-version.md](./docs/hosted-version.md) ·
[storage.md](./docs/storage.md).

---

## Project structure

```
deck.md              your working deck (source of truth; gitignored)
deck.example.md      seed / guided-tour deck (tracked; gen by scripts/gen-example.mjs)
template.md          layout reference — one filled-in slide per layout (tracked)
public/Assets/       deck images (gitignored)

vite.config.ts       Vite config + the dev-server deck API

src/
  core/
    types.ts         the shared schema (layouts, slide fields, canvas elements)
    deck.ts          parser / serializer (parseDeck, serializeDeck, blankSlide, emptyDeck)
    bake.ts          semantic layout → freeform elements; new-element builders
  render/
    inline.ts        inline-Markdown → HTML; content ⇄ rows
    theme.ts         deck theme → CSS custom properties
    video.ts         YouTube / Vimeo / file URL parsing
  storage/           pluggable backends (server, browser+idb, fs, fsdir)
  components/
    Deck.vue         scaled 16:9 stage + keyboard/wheel navigation
    SlideView.vue    layout dispatcher (renders each layout)
    CanvasElements.vue / BoxText.vue   freeform canvas + auto-shrink text
    TopBar.vue, SlideNavigator.vue, SlideActions.vue, SourcePane.vue   editor chrome
    Overview.vue, Presenter.vue, PresenterWindow.vue, ExportView.vue   present / export
    DeckMenu, ColorPicker, EditableText(List), FramedImage, MermaidDiagram, SlideThumb, ReviewPanel
  styles/
    base.css         design tokens / app chrome
    slide.css        per-layout slide styles
  api.ts             client over the active storage backend
  App.vue            top-level: state, undo/redo, keyboard, edit/present orchestration

scripts/
  gen-example.mjs    regenerate deck.example.md (run after the app reformats it)
  import_pdf.py      PDF → deck.md (text + images per page, classified into layouts)
  shots.mjs          Playwright screenshots of the deck
```

---

## Design language

Editorial calm: a near-black canvas, an elegant light serif (**Cormorant Garamond**,
italic 300) paired with a technical monospace (**JetBrains Mono**), generous space, and one
disciplined accent (`#7fc7ff` blue, with `#ffb474` amber used sparingly). The cardinal rule:
**no ALL-CAPS headings** with the serif theme — Title Case headings, sentence-case body. A
soft radial `glow` sits behind each slide.

## Further reading

- **[BRIEFING.md](./BRIEFING.md)** — vision, the three editing paths, the layout catalog,
  and the conversion plan.
- **[FEATURES.md](./FEATURES.md)** — prioritized feature list (P0/P1/P2).
- **[template.md](./template.md)** — the canonical layout library / schema contract.

## Design notes

- **No in-app LLM** by design — hand the `.md` to any external model; its edits coexist with
  WYSIWYG edits because both speak the same named-field schema.
- Saving is filesystem-backed (dev API or File System Access) — no silent download fallback.
