# Dek — Changelog

---

## [Unreleased]

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
