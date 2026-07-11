# Dek — Changelog

---

## [Unreleased]

### Opening & saving

**Dek's own Open/Save panels — one folder grant, no more file dialogs** (#41)
Native file dialogs are gone from the everyday flow. You grant a **decks folder once** (the single unavoidable OS prompt, persisted and auto-reconnected), and after that Open and Save are Dek's own in-app panels over that folder: **Open** lists the `.dek` decks in it, click to open; **Save As** is a text field — type a name, and Dek creates `<name>.dek/` for you (uniquified, never clobbering a sibling). No folder to create by hand, no picker. This works because a *directory* grant gives full programmatic access — list, create, read, write — whereas the per-file pickers were the only thing forcing native dialogs. Images stay in each bundle's `Assets/`, so `deck.md` stays small and readable (a self-contained single file was the alternative, but inlining images as data URLs bloats it past what an LLM can hold). New `DeckBrowser.vue` + a workspace layer in `storage/fsdir.ts`; 4 tests cover listing, named creation, uniquification, and round-trip.

### Design system

**Themed links and a readable light theme** (#39)
Links in slide bodies had no CSS anchor rule at all, so they fell back to the browser's bright blue and — once clicked — purple. They now wear the deck's own accent; a visited link keeps that accent, just calmer, so "seen" reads without a jarring colour shift, and the underline (not colour alone) carries the affordance so a link isn't missed on a light background. Canvas box-links use the same tokens.

The light theme was partly unreadable because `slide.css` hardcoded the *dark* theme's off-white (`rgba(230,236,242,α)`) for all secondary text — header, footer, page number, byline, cite, captions, credits, hairlines — which vanished on a near-white ground. Those 17 literals collapse into three theme-derived tokens emitted by `theme.ts` from each theme's own text/accent: `--dek-dim` (prominent secondary), `--dek-faint` (chrome), `--dek-line` (hairlines), plus `--dek-link` / `--dek-link-visited`. On the light theme secondary text now clears WCAG AA (dim 6.2:1, faint 3.7:1, links 4.8:1) instead of the previous ~1:1.

### Canvas & editor

**Cut/Copy/Paste and cross-deck import in the slide context menu** (#42)
Right-clicking a slide thumbnail now offers **Cut/Copy/Paste Slide(s)**, mirroring the element-level clipboard (`Ctrl+C/X/V` work too, when the navigator has focus and no element is selected) — multi-selected thumbnails cut/copy as a set, and Paste always lands right after the slide you right-clicked. Also new: **Import Slides…**, which opens Dek's own deck browser in a picker mode over the granted workspace folder — pick another `.dek` bundle and its slides splice in at that point, with every referenced image copied into the current deck's own asset store (`api.ts`'s `importSlidesFromWorkspaceDeck`; works no matter which backend the *current* deck lives in, since only the source needs to be a listable workspace bundle). The source deck is never modified.

**Drop a link onto the canvas → QR code + clickable box** (#38)
Dragging a hyperlink onto a freeform slide now does the obvious thing. Onto empty canvas it creates a **QR code** the audience can scan from their seats; onto a box that already holds a photo it only adds a `link`, so the picture becomes clickable while presenting — a stray drop can never destroy an image. Two new `box` fields back this: `qr` renders a URL as a code (the *link* is stored, never a generated image, so `deck.md` stays readable and editing the URL redraws the code — the same contract as a `diagram`'s Mermaid source), and `link` makes any box clickable (`http(s)`/`mailto` only, never navigates while editing). Links are real `<a>` anchors, so they work in the exported standalone HTML with no script; QR codes export as rasterised PNGs into the `.pptx`. The encoder (`qrcode-generator`) is a lazy chunk, so slides without a QR pay nothing. New `src/render/qr.ts` + `QrCode.vue`, 14 tests covering the path builder, link-scheme safety, drag parsing, and PPTX embedding.

### Opening & saving

**Decks are bundles: `My Talk.dek/` = `deck.md` + `Assets/`** (#37)
A deck is now one folder you can move, copy or zip as a unit. "Save As bundle…" takes a single directory prompt — pick or create the deck's own folder — and writes `deck.md` plus an `Assets/` folder inside it; the folder name becomes the deck's name, so there's nothing to type and no second dialog (it used to cost a save dialog *and* a folder dialog). Because the name now lives on the folder, asset refs are plain `Assets/pic.png` instead of `/My Talk Assets/pic.png` — which fixes a real bug: renaming a deck used to orphan every image, since the path it pointed at no longer existed.

The legacy layout (several decks in one folder, each with a name-matched `<deck> Assets/`) is still read and written correctly — `resolveAssetsDirName` prefers an existing assets folder, and falls back to per-deck naming when a sibling `… Assets/` shows the folder is a shared workspace, so a plain `Assets/` can't collide between decks. Existing decks need no migration.

**Reopen the last deck automatically; one prompt to open a folder** (#36)
Dek used to throw away its file-system grant on every reload, so opening a deck cost a file dialog, a folder dialog, and a permission bubble *every session*. The handle (folder or lone `.md`) now lives in IndexedDB and is re-attached on startup: if the readwrite grant survived, the deck reopens with **zero dialogs**. When the browser has downgraded the grant to `prompt` — Chrome does this across sessions — a "Reopen …" banner re-grants it in one click, showing only a small allow bubble, never a picker.

"Open folder…" became the primary **"Open deck…"**: a single directory prompt covers the `.md`, its `Assets/`, and every subfolder, and the folder's other decks are now listed in the deck menu (`listDecks` reads the active folder backend), so switching decks inside a folder needs no picker and no re-grant. "Open a single .md…" is demoted — a lone file handle can't reach its images folder, which is a browser security boundary, not something the app can work around. Leaving a folder (New / Save As / picking an in-app deck) clears the remembered handle so a reload doesn't drag you back into it.

### Export

**PowerPoint (.pptx) export** (#35)
"Download PPTX" in the export panel writes a real `.pptx`. Every slide — semantic layout or freeform — is reduced to the same positioned stage-pixel elements the canvas uses (via `bakeToElements`), then each element is emitted as an absolutely-positioned OOXML shape: text boxes become `p:sp` with styled runs (bold/italic/underline and `[text](url)` links survive), images become embedded `p:pic` media, shapes carry fill/stroke/corner-radius, arrows become line connectors with an arrowhead, and the deck theme populates the presentation's colour/font scheme. The stage maps 1:1 to a 16:9 slide (9525 EMU/px), so shapes land where the layout rendered them. New `src/export/pptx.ts` builds the OPC package with the already-present JSZip. Video plays back as its poster still and Mermaid diagrams export as their source text (live rasterisation deferred). 12 tests cover package structure, XML well-formedness, OPC integrity (every part typed, every relationship resolves), image embedding, and the inline-run tokeniser.

### Reliability

**External-edit sync & conflict safety** (#27)
The three editing paths (code, LLM, WYSIWYG) are no longer only safe one-at-a-time. `GET /api/deck` now returns the file's mtime; every save sends the mtime it was based on, and the dev server refuses (409) a write that would clobber a change made on disk since. An idle browser polls the mtime and live-reloads a purely-external edit (so handing `deck.md` to an LLM updates the open tab), while a genuine both-sides conflict prompts to keep-yours-and-overwrite or load-from-disk. Adopted changes stay undoable. Server backend only; File System Access and browser storage are unaffected.

**Schema validation for the LLM path** (#28)
The Review panel and a new amber/red badge on each navigator thumbnail now surface three classes of silent breakage: a field the slide's layout won't render (a `titel:` typo or a `subtitle` on a `section` used to just vanish), a malformed `focus` that isn't `{x, y, scale}`, and a referenced local image missing from the deck folder. Universal fields (`notes`, `group`, `stash`, `elements`) are never flagged. Six new tests.

### Presenting

**Step / build reveals** (#32)
A `text` / `text-image` slide with `steps: true` reveals its content rows one at a time while presenting — arrow keys, space, and swipe step through the builds before advancing the slide (Page Up/Down still jump whole slides). Not-yet-revealed rows keep their layout box so the fitted font size and earlier rows don't shift as each appears. Presenter view shows the current slide's build count.

**Touch / swipe navigation** (#29)
Swiping left/right in present mode advances or rewinds (50px horizontal threshold; vertical drags are ignored so scrolling isn't hijacked). Present mode only — the edit-mode canvas keeps its pointer behaviour.

### Design system

**Light theme** (#31)
The previously-unused Editorial Light token set is now selectable: a Theme section in the deck menu (edit and present) toggles Editorial Dark / Light per deck via the existing `themePreset()`, with the active preset recorded in `theme.preset`. Editorial Dark stays the default.

### Performance

**Image compression on upload** (#30)
Images are downscaled (max 2560px, JPEG q0.85 / re-encoded PNG) before they reach `Assets/`, keeping whichever of the original and re-encoded is smaller. SVG and GIF pass through untouched. Stops full-resolution camera photos from bloating a deck; the duplicated upload FileReader boilerplate collapsed into one `fileToOptimizedDataUrl` helper.

### Under the hood

**Bake-fidelity geometry tests** (#33)
`bakeToElements` mirrors exact pixel numbers from `slide.css` (#18) and nothing caught drift between them. A new suite pins the load-bearing constants — heading 64/1.05, body 26/1.45, 280px portraits, the text-image column split, image-full full-bleed, freeform passthrough — plus a finite-geometry check across every layout. (App.vue's undo/redo is already covered by `useUndo.test.ts`.)

**Canvas selection extracted to a composable** (#34)
Active-tool / selected-element / pending-image state and the slide-change reset moved out of App.vue into `useCanvasSelection`, continuing the composable split from #6.

### Canvas & editor

**Inline hyperlinks + in-text right-click menu** (#26)
Text now supports `[label](url)` Markdown links. They render as accent-coloured anchors everywhere — editor, present mode, and HTML/ZIP export — and round-trip cleanly back to Markdown when a box is edited. Only `http(s)` and `mailto` URLs are emitted; anything else is neutralised so deck content can't smuggle script, and links don't navigate while editing (clicks select/move the box instead). Right-clicking inside a text box being edited adds two contexts to the menu: with text selected, Bold/Italic/Underline/Strikethrough and Add Link; with the caret in an existing link, Open / Edit / Remove Link. Menu items preserve the editing selection so these act on exactly what was highlighted.

**Context-sensitive right-click menu** (#23)
Right-clicking now opens a themed, keyboard-navigable menu whose contents match what was clicked. On a canvas element: Cut/Copy/Paste-In-Place/Duplicate/Delete plus the full z-order set (Bring Forward/to Front, Send Backward/to Back); image boxes additionally get a Cover/Contain fit toggle (with a checkmark on the current value), Replace Image, and Remove Image. A multi-selection gets the group operations. Empty canvas offers Paste / Add Text Box / Add Shape at the click point. Right-clicking a navigator thumbnail gives Duplicate, Insert Before/After, Delete, and Move to Top/Bottom. Every entry shows its keyboard shortcut and reuses the existing action, so the menu and shortcuts never drift apart. (In-text formatting and hyperlinks are tracked separately as #26.)

**Multi-select, copy/paste, z-order** (#1)
Selection is now an array. Shift-click toggles membership; dragging on empty canvas draws a marquee (rotation-aware hit test). Dragging any selected element moves the whole group. Ctrl+C/V copies elements across slides (with cascading offset when pasting back onto the same slide). Ctrl+D duplicates. Ctrl+]/[ and two new top-bar buttons move elements forward or backward in paint order.

**Snapping and alignment guides** (#2)
While dragging, the selection's union bounds snap (6 px threshold) to the stage edges and centre lines, and to every other element's edges and centres. Active snap lines render as pink hairlines across the stage. Hold Alt to disable snapping temporarily.

**In-frame image controls** (#11)
Image boxes on the freeform canvas now show Replace (⇄) and Remove (✕) buttons on hover, consistent with named-layout frames. The redundant "replace image" button was removed from the top bar.

**Drag-and-drop images onto canvas** (#20)
Image files dragged from the OS file manager can be dropped directly onto the canvas. Dropping onto an existing box replaces its image; dropping onto the background creates a new image box centred on the drop point and sized to the image's natural aspect ratio.

**Text auto-shrink fix** (#14)
`BoxText` now keeps the DOM authoritative for font size instead of clearing the inline style before each measurement, which previously caused a race with Vue's reactive `:style` patches. A zero-height guard prevents shrinking to the minimum before the element has been laid out.

**Default box appearance** (#15)
New boxes and shapes created on the canvas default to transparent fill, a `--dek-accent`-coloured stroke at 0.5 opacity, and 8 px corner radius, matching the overall editor chrome. The constants live in `src/core/defaults.ts` so both the creation path and any future "reset to defaults" action draw from one place.

**Gallery "add image" no longer reflows existing images** (#22)
The add-image affordance is now a small ＋ button positioned in the margin outside the grid, instead of being inserted as an extra grid cell. Existing images keep their size and position when edit mode is active.

**Number input spinners restyled** (#19)
The native OS-chrome number spinners (corner radius, stroke width) were replaced with custom ▲/▼ arrow buttons styled in `--dek-accent` blue on transparent backgrounds, matching the dark theme.

---

### Import

**PowerPoint picture crops are preserved** (#40)
A picture cropped in PowerPoint (via `<a:srcRect>`) used to import as the whole, uncropped image, so a different part of it showed. The crop is now read and **baked into the pixels** — the importer draws the selected sub-region to a canvas and stores that as the image. Baking (rather than mapping to Dek's `focus`) is what makes it faithful: `focus` is pan/zoom over an `object-fit: cover` base and can't un-crop a region the cover already discarded, whereas a baked image carries its crop into any layout the classifier picks. Only cropped pictures are re-encoded (PNG sources stay PNG, photos become JPEG q0.92); uncropped images pass through untouched. Negative "outset"/zoom-out crops, which can't be reproduced by trimming, keep the full image rather than guess.

**Import review step** (#3)
After parsing a PPTX or PDF, a full-screen review grid (`ImportReview.vue`) now appears before anything is saved. Each slide shows its thumbnail alongside a layout selector. Freeform slides are flagged in amber. Clicking Commit saves the deck; Cancel discards the parse result with no side effects.

**Improved import classifier** (#21)
- PDF block clustering is now column-aware: each text line matches its nearest overlapping block rather than the last one, so two-column slides no longer shatter into freeform.
- Reading order sorts left column before right column.
- Title detection adds a position-based signal: a text block in the top quarter of the page that is at least 1.25× the median body size is recognised as a heading even without a placeholder role (covers most PDF exports).
- Full-bleed threshold loosened from 60 % to 55 % of stage area.
- Statement layout accepts 2–5 lines (was 2–4) and up to 360 characters (was 300).
- New branch: heading + single picture with no body text → `text-image` (was freeform).
- New branch: 1–2 untitled bullet blocks → `text` with empty title (continuation slides).
- 4 new classifier tests added.

---

### Export

**ZIP export** (#8)
"Download ZIP" in the export panel bundles the standalone HTML file together with all referenced images and videos in an `assets/` subfolder. Asset URLs in the HTML are rewritten to relative paths. Uses JSZip loaded as a dynamic import so it doesn't affect initial bundle size.

**Speaker-notes handout PDF** (#9)
A "Print Handout (notes)" button in the export panel opens a print-ready view that places each slide thumbnail next to its speaker notes on a single landscape page, suitable for printing or saving as PDF directly from the browser.

---

### Performance

**Lazy thumbnail mounting** (#4)
`SlideThumb` now uses an `IntersectionObserver` (200 px root margin) to defer mounting the full `SlideView` DOM tree until the thumbnail scrolls near the viewport. On large decks this reduces initial DOM size from hundreds of full slide trees to only the visible handful.

---

### Review & cleanup

**Orphaned asset detection and deletion** (#25)
When editing a deck from a real folder, the Review panel's Assets tab now lists files sitting in the `<deck> Assets/` folder that no slide references anymore — images left behind after a replace or delete. Orphans are flagged in red with an "orphaned" count badge; each has a Delete button, and a "Delete all orphaned" action appears when there are two or more. Matching is by filename, and only the deck's own assets folder is touched. Folder backends only — browser storage skips the check since there's no folder to scan.

---

### Design system

**Autosave indicator restyle** (#24)
The save status no longer shifts the toolbar. The checkbox reads "autosave" (static width) with a bright-blue (`#7fc7ff`) native accent, followed by a fixed-size status LED — green saved, amber saving, red unsaved. The old text label that changed width on every save cycle (and pushed the rest of the bar around) is gone, along with the redundant manual Save button.

**Design token system** (#16)
A typed token layer lives in `src/tokens/`: `base.tokens.json` (stage geometry, padding, radii, type scale, element defaults), `theme.default.tokens.json` (Editorial Dark — `#070809` bg, `#e6ecf2` text, `#7fc7ff` accent), and a light-theme placeholder. `tokens/index.ts` derives exact TypeScript types directly from the JSON via `resolveJsonModule` — no codegen step. `core/defaults.ts` exports `BOX_DEFAULTS`, `TEXT_DEFAULTS`, `ARROW_DEFAULTS`, and `TYPE_SCALE`. `theme.ts` and `bake.ts` draw from these constants instead of hardcoded values.

**Top bar cleanup** (#13)
Removed the font-weight input (covered by Bold button). Font size now uses a type-scale stepper (steps through the token scale: 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96 px) instead of a free-entry number field. The text colour picker shows the theme default colour when no custom colour is set on the element.

---

### Layouts

**Bake-to-freeform fidelity** (#18)
Converting a named layout to a freeform canvas now mirrors the exact pixel geometry from `slide.css`: H1 at 64 px / 1.05 line-height, body at 26 px / 1.45, speaker portraits at 280 px, correct column splits per layout. Boxes gained optional `lineHeight` and `lineGap` fields so baked text keeps the CSS rhythm. A (10, 6) px text-inset compensation ensures glyph positions match what the layout rendered.

**Text overflow in text and text-image layouts** (#17)
Long content in `text` and `text-image` slides now stays inside the layout frame. List containers and body areas clip with `overflow: hidden` instead of overflowing out of the slide.

---

### Under the hood

**App.vue refactored into composables** (#6)
Undo/redo history extracted to `useUndo`, presenter window sync to `usePresenterSync`, and file import logic to `useImport`. App.vue is now a thin coordinator of these composables.

**Slug/unique-name deduplication** (#7)
Shared helper at `src/core/names.ts` handles slug generation and the "append a number to make it unique" logic. Previously duplicated across the import and deck-creation paths.

**Better YAML parse errors** (#10)
When a deck file fails to parse, the error message now identifies which slide block (by index and first content line) caused the failure, instead of reporting a generic top-level error.
