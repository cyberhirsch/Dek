# Hosted version (static, GitHub Pages)

The version that runs in the browser with **no server**, deployed to GitHub Pages.

**Live:** https://cyberhirsch.github.io/Dek/

## How it's deployed
Every push to `main` triggers `.github/workflows/deploy.yml`, which runs `npm run build`
and publishes the static `dist/` to Pages (Pages source: *GitHub Actions*). The build uses
a relative `base` so it works under `/<repo>/`.

## What it shows by default
The committed **example deck** (`deck.example.md`), seeded into the browser on first visit.
The **M7 deck is not here** — `deck.md` and `public/Assets/` (~40 MB) are gitignored, so
they aren't deployed. To work with M7 on the hosted app, open its folder (below).

## Storage: two ways

### 1. Browser storage (default, every browser)
With no dev server, the app uses the **browser/IndexedDB backend**:
- The working deck lives in IndexedDB (seeded from the example).
- Edits **autosave to IndexedDB** as you type.
- Uploaded images are inlined as data URLs (kept inside the deck).
- *New deck…* and the deck list create/switch decks stored in the browser.

This always works, but the deck lives **inside the browser**, not as a file on disk.

### 2. Real local files (File System Access API)
The deck menu (deck-name dropdown, top-left / top bar) offers:
- **📁 Open folder…** — read a deck's `.md` **and its images** from a folder, and write
  back. Images live in a sibling `<deck> Assets/` folder.
- **📄 Open file…** — open a single `.md`; edits autosave straight back to that file.
- **⤓ Save As… (folder + images)** — pick a destination folder; Dek writes
  `<deck>.md` + a `<deck> Assets/` folder containing every image, then keeps editing there.

These require the **File System Access API**:
- **Chrome / Edge:** works out of the box.
- **Brave:** open `brave://flags`, search **File System Access API**, set **Enabled**,
  relaunch. (Until then, Open/Save As are hidden and only browser storage is available.)
- **Firefox / Safari:** not supported — browser storage only.

## Putting the M7 deck on the hosted app
Use **Open folder…** and pick the folder containing `deck.md` + its images
(e.g. the `Dek` repo folder, where images are under `public/Assets/`). The loader finds the
`.md` and resolves images (tries `<deck> Assets/`, then `Assets/`, then `public/Assets/`).
Then **Save As…** to a clean folder to get a portable `<deck>.md` + `<deck> Assets/`.

## Caveats
- The example deck seeds **once** per browser. After we update `deck.example.md`, an
  existing visitor won't see changes unless they clear the site's storage; new visitors do.
- Autosave to a File System Access file re-writes the whole `.md` on each (debounced) edit.
- Object URLs for folder-loaded images are per-session; reopen the folder after a reload.
