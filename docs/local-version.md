# Local version (dev server)

The version you run on your machine with `npm run dev`. It edits **real files in the
repo** through a small Vite dev-server API, which is the best setup for authoring and for
working with the large M7 deck.

## Run
```bash
cd Dek
npm install
npm run dev          # http://localhost:5173
```
Open http://localhost:5173. It loads `deck.md` automatically.

## What it edits
- **`deck.md`** (repo root) — the active deck. This is the **350-slide M7 import**.
  It is **gitignored** (your content stays local).
- **`public/Assets/`** — images, served at `/Assets/…`. Also gitignored (~40 MB).
- **`decks/*.md`** — extra decks created via *New deck…* / *Save As…* (gitignored).
- **`deck.example.md`** — the committed example (offered as "Example" in the deck menu).

On first run, if `deck.md` is missing it's seeded from `deck.example.md`.

## How storage works here
The app detects a running dev server (the `/api/decks` endpoint returns JSON) and uses the
**server backend**. All edits go straight to disk via the API in `vite.config.ts`:

- `GET /api/decks` — list decks (`deck.md`, `decks/*.md`, `deck.example.md`)
- `GET /api/deck?file=…` — load a deck
- `PUT /api/slide?file=…` — save one slide (autosave)
- `PUT /api/deck?file=…` — save the whole deck (reorder / add / delete)
- `POST /api/save-as` — write a copy to `decks/<name>.md`
- `POST /api/new` — create `decks/<name>.md`
- `POST /api/upload` — write an uploaded image into `public/Assets/`

So **every edit autosaves into the actual `deck.md`** as you type (debounced). Add /
duplicate / delete / reorder / group write the whole file.

> File System Access (Open folder… / Open file… / Save As…) also works here in a Chromium
> browser, and will switch the app to that picked file/folder. But the default workflow is
> the server-backed `deck.md`.

## Re-importing the M7 PDF
The deck is generated from the source PDF by `scripts/import_pdf.py`:
```bash
python scripts/import_pdf.py "path/to/M7 … .pdf"   # writes deck.md
```
It extracts text + images per page, classifies each into a layout, drops fully-occluded
images, folds ligatures, and routes large YouTube/Vimeo links to `video-embed`. Images are
expected pre-extracted in `public/Assets/` as `M7_pNNN_imgM.jpeg`. See
[`../BRIEFING.md`](../BRIEFING.md) for the layout catalog.

## Notes
- Autosave rewrites the whole `deck.md` for structural changes; for 350 slides that's a
  large file but fine in practice.
- Because content is gitignored, the M7 deck is **not** on the hosted site — see
  [hosted-version.md](./hosted-version.md).
