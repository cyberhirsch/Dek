# Dek — Changelog

---

## [Unreleased]

### Editing

**Copy and paste slides between tabs and decks**
Copying slides (Ctrl+C on the slide list, or *Copy Slide*) now also puts them on the system clipboard, as Dek's own text — the same YAML blocks the deck file uses, under a `# Dek slides` line — with every picture inside it. Paste (Ctrl+V on the slide list, or *Paste Slides*) in another tab or another deck, and the slides arrive with their pictures, each saved as a file in the receiving deck's Assets folder under its original name. Pasting back into the same deck in the same tab still uses the exact in-memory copy, so no picture is saved twice. Because it's plain text, the clipboard also works with a text editor or an LLM chat in both directions: copied slides paste as readable YAML, and YAML slides (or a whole deck file) paste into Dek as slides. Ordinary text on the clipboard is ignored — it needs a `layout:` to count as a slide. The context menu's *Paste Slides* may ask for clipboard permission the first time; Ctrl+V doesn't. `+4` tests.

### Text

**Fixed: captions cut through the middle when presenting**
Once text had to shrink to fit, its box gave up a 28px strip at the bottom for the editor's *Split* button — also while presenting, where there is no button. A caption box is one line (34px), which left 6px for the text: a long caption came out as the top half of one line. The strip is gone everywhere (captions, titles, bullet lists, canvas text boxes); the *Split* button now sits over the bottom-right corner in the editor instead. As a side effect, shrunk text is the same size in the editor as in the presentation — before, lists and canvas boxes shrank more than needed.

### Presenting

**Presenting goes fullscreen**
*Present* (and Ctrl+E, or Esc from the editor) now also switches to fullscreen. One **Esc** leaves both and returns to the editor — before, the first Esc only left fullscreen and a second was needed. **F** still toggles fullscreen without ending the presentation, and opening the presenter window doesn't end it either, even though the browser may leave fullscreen when the window opens. Leaving the presentation any other way (✕, Ctrl+E) leaves fullscreen too.

**Play and pause videos from the keyboard and a presenter remote**
On a slide with a video, **Space** plays and pauses it — the first press starts it from the poster — and the **arrows** keep turning slides. A presenter remote works the same way: its ◀ ▶ buttons send PageUp/PageDown (previous/next slide), and its ■ button, which sends `.` or `b` (PowerPoint's black-screen keys, used by Kensington and Logitech remotes), plays and pauses. Works for YouTube and Vimeo embeds (through their player API — the toggle follows the player even after someone clicks its own pause button), video files, and video elements on the canvas. Clicking into a player no longer traps the keyboard in it while presenting: focus comes straight back to Dek, so the remote keeps working. On a slide without a video, Space still advances.

**Draw on slides while presenting (`D`)**
Press `D` in a presentation and the pointer becomes a pen: draw on the slide to point things out. Press `D` again to wipe everything and put the pen away. Ink belongs to the slide it was drawn on, so flipping away and back keeps it; arrows and the scroll wheel still change slides while the pen is out, and a pen stroke on a touch screen doesn't count as a swipe. Ink is never saved to the deck, and returning to the editor wipes it.

The presentation bar has it too: the **pencil** now toggles the pen (it used to open the editor), and while the pen is out **four colour swatches** appear beside it — the deck theme's accent 2, accent, text and background colours, so the ink always belongs to the deck and follows a theme change. The editor moved to a new **✕** button (*Exit*, same as `Esc`).

### Images

**Fixed: pictures dragged from another browser window never arrived**
A picture dragged out of a web page usually comes over as its address, not as a file, so the frame showed *drop to replace* and then ignored the drop. Dek now reads the picture's address from the drag (the `<img>` itself, not the link around it, so a thumbnail that links to an article still gives the picture), fetches it, and stores it in the deck's Assets folder like any upload. Works on every image frame, gallery and table cell, and on the canvas (where a dragged plain link still becomes a QR code). Some sites don't allow other pages to copy their pictures; Dek then says so, and saving the picture to disk and dropping the file works instead. `+8` tests.

**Fixed: pan and zoom couldn't reach the cropped parts of a picture**
A framed picture was cropped *inside* its image element before pan and zoom applied, so dragging slid an already-cropped picture: empty background came in on one side while the hidden side never appeared, and zooming out only shrank the crop. The image element is now the whole fitted picture, centred, clipped only by its frame — dragging reveals the hidden sides up to the picture's own edge, and a Fill picture can zoom out until the whole picture shows. Applies to every framed picture (layouts, gallery, table cells, canvas). Gallery pictures are also clipped by their own frame rather than the slot around it, which put badges and links on the frame's corner, as in export.

### Export

**Fixed: PowerPoint export stretched pictures out of shape** (#53)
Every picture went into the `.pptx` stretched to fill its box. Any picture whose shape differed from its frame — which is the default, since frames crop to fill — came out squashed or stretched, and pan/zoom was ignored entirely. The exporter now reads each picture's real size from its file header (PNG, JPEG — including past large EXIF blocks — GIF, WebP, BMP, SVG; no browser needed) and places it the way the slide shows it. *Fill* pictures are cropped with PowerPoint's own source crop, so they stay editable and can be re-cropped there. *Fit* pictures get a box shrunk to their own shape. Pan and zoom carry across. The geometry is the same `object-fit` + zoom + clamped-pan model the editor draws with (`placePicture` in `render/pan.ts`). If a size can't be read, the old placement is the fallback — never an error. Video posters now sit whole inside their frame, as on screen. `+16` tests.

### Layouts

**Videos play one segment: start and end times in the URL**
Put the time window in the video link and the slide plays exactly that part. YouTube: `&start=130&end=220`, or `&t=130` (also `t=2m10s`, `t=1h2m10s`) for the start alone. Vimeo: `#t=75s`; its player has no end time. A video file: the media fragment `clip.mp4#t=30,95`, which the browser honours. YouTube links are also recognised in more of their forms: `v=` anywhere in the query, `/shorts/`, `/live/` and `youtube-nocookie.com`. Autoplay no longer breaks a link that carries a `#t=` fragment. `+12` tests.

**Tables: draggable dividers, row and column editing, cell selection and merging** (#48)
The table's editing is now complete, the same for the Table layout and for a table on a Freeform canvas:

- **Drag the dividers** between rows and columns to size them. The grid follows the pointer live but saves once, on release: one undo step, one autosave, not one per pixel. A track can't be dragged narrower than 6% of the table — the divider stops there rather than jumping.
- **Add and remove rows and columns where you need them**: *Insert Row Above/Below*, *Insert Column Left/Right*, *Delete Row/Column* on any cell's right-click menu, plus a **+** on the table's bottom and right edges to append. Custom track sizes keep their proportions, and deleting a line that holds content asks first.
- **Select a block of cells** by dragging across them, or Shift-click to add single cells. A plain click still goes straight into a cell's text.
- **Bulk actions** on the selection: *Bold*, *Italic*, *Clear*, *Merge Cells*. Merging needs a rectangle of unmerged cells; as in a spreadsheet, the top-left cell keeps its content and the rest become covered, and it asks before discarding anything. *Unmerge Cells* splits a merged cell back. Bold and italic are flags on the cell (`bold: true`, `italic: true`), not `**`/`*` in the text — cell text is plain, so Markdown markers would just show. Both carry into PowerPoint.

Every structural edit is merge-aware. A row inserted through a merge grows it; deleting the row a merge is owned from moves the merge down rather than losing it; a drag that clips a merged block selects all of it. The logic is pure and tested in `core/tableEdit.ts`. `+23` tests.

**Review warns about gallery pictures that are too small or cropped away** (#55)
Since #52 a gallery can't overflow, but it can still fail quietly. Review now judges every gallery picture as the slide actually lays it out: the same box, `auto` columns, labels or badges, fit and zoom. A picture showing smaller than about 250 × 140 stage px (by area, so portraits aren't penalised for being narrow) is a **warning**: too small to judge from the back of a lecture hall. The message gives the smallest size and suggests fewer pictures or badge labels. A picture that loses more than about 35% to cropping — by *fill* or by zoom, which crops even in *fit* mode — gets an **info** suggesting `imageFit: contain`. Picture sizes come from the shared size cache and load on their own, so the checks fill in as pictures arrive; a picture whose size isn't known yet isn't judged rather than guessed at. The ">6 items" note stays. The lecture skill's audit script now makes the same checks instead of predicting an overflow that can no longer happen. `+5` tests.

**`columns: auto` arranges a gallery by its pictures' shapes** (#54)
`auto` used to mean "up to three columns", whatever the pictures looked like. It now tries every column count and keeps the one whose *smallest* picture comes out largest, because one postage stamp is the failure a gallery must avoid. A near-tie goes to fewer rows, and with the rows equal to fewer columns: four labelled 16:9 pictures go 2×2 at 304×171 each rather than 3 + 1. Three portraits sit in one row; nine squares go five across in two rows. The choice is always made on the *presenting* geometry. The editor shows title and label boxes even when empty, and judging by those would arrange a gallery one way while you edit it and another while you present. Picture shapes come from the shared size cache; until all have loaded, `auto` falls back to up to three and re-lays out when they arrive. Bake and the PowerPoint export make the same choice — the exporter reads the shapes from the image files — so the three agree.

The spec's example table said four labelled 16:9 pictures should sit in one row. Its own scoring rule — and the pictures' size — say 2×2, and the rule is what's implemented. `+11` tests.

**Galleries can fit pictures whole, with frames that hug them** (#53)
Now that gallery rows share the slide's height (#52), filling each frame crops hard: four 16:9 renders in a 2×2 grid became 518×150 strips, cutting away exactly the detail a class is asked to judge. A gallery now takes `imageFit: contain` — *fill | fit* in the top bar, as on single-image layouts — and any picture can override it (`fit` on the item, or *Fit: Cover / Fit: Contain* in its right-click menu). Choosing the gallery's own value clears the override rather than restating it. In *fit* mode the frame **hugs the picture**: its border and radius wrap the picture itself instead of drawing letterbox bars inside a box, and it re-sizes itself as the grid changes (CSS container units, from the picture's shape). Pan and zoom still work inside a hugging frame, and label badges ride the picture's corner. Baking to Freeform hugs the same way, from a shared cache of picture sizes that also serves #54 and #55, and the PowerPoint export places them whole (#53, export fix). Converting gallery → Freeform → gallery keeps the fit. Invalid `imageFit` or item `fit` values are now flagged in Review. `+8` tests.

**Short gallery labels as badges** (#56)
A gallery's labels can now sit **on** the pictures: `labelPos: overlay` (*Labels: badge* in the top bar) draws a short label — "1", "A" — as a pill in the picture's top-left corner. The label row goes, so a quiz gallery ("which one is real?") gives that height back to its pictures: 54px per row. The badge uses the label's own face, Cormorant light italic, in the accent colour on a dark translucent pill, so it reads over any picture. PowerPoint and Freeform draw the same pill. The editor's ✕ remove button moved to the top-right beside the ⇄ replace button, so both picture controls sit together and the corner belongs to the badge. `+1` test.

**Fixed: galleries ran off the bottom of the slide** (#52)
A gallery with more than one row of landscape pictures — and some single rows — continued below the stage, with nothing clipped and no warning. Real case: four 16:9 pictures in two columns needed about 750px where the stage has 474. The grid set its columns but not its rows, so every row grew to its tallest picture's natural height at column width. Rows are now explicit, equal shares of the height, and a cell may shrink to its row. However many pictures and whatever their shapes, the grid can't be taller than its box.

The live slide and the export had disagreed. Bake (used for Freeform and PowerPoint) already shared the height out, so a deck overflowed on screen but fitted in the `.pptx`, and the two used different title and label heights. Both now take their numbers from `core/gallery.ts`. The label row is 44px, since the label shrinks to fit anyway, which gives every labelled row back 18px. When any picture has a label, every picture gets a label row, so the frames in a row line up. Bake also read only object items, so a gallery written as bare strings (`items: [a.png, b.png]`) vanished from Freeform and PowerPoint entirely; those are pictures now too. A test sweeps 1–9 pictures × every column setting × with and without title and labels, and requires every cell to stay on the stage. `+6` tests.

**Fixed: switching layout deleted canvas elements laid over the slide** (#51)
Any layout may carry canvas elements on top — a QR code on a Text slide, an arrow pointing into an image. Switching layout ignored them entirely. Between two regular layouts they weren't carried or parked in `stash`, just dropped; switching to Freeform baked the layout's fields and dropped them there too. Only undo brought them back. They now stay on the slide, in place, through any switch, and a switch to Freeform puts them on top of the baked layout — the way the slide drew them, and the way PowerPoint export already combined the two. A Freeform slide's own elements are unaffected: they're its content, and switching away still maps them into the new layout's fields. `+4` tests.

**Gallery pictures can be panned and zoomed, like single images** (#50)
Each gallery cell now takes the same pan/zoom as the single-image layouts: scroll to zoom, then drag to pan, and each picture keeps its own framing (`focus` on the gallery item). It survives a trip through Freeform, so gallery → freeform → gallery doesn't reset every cell. Replacing a picture starts the new one centred, because the old framing was for the old picture. The editing hint now has a short form for narrow frames: the full sentence is about 420px, and a gallery cell can be 250px.

**Fixed: replacing one gallery picture stripped the link from every cell.** The upload handler rebuilt every item from its `image` and `label` alone, so any link — and now any framing — on any other cell was silently dropped. Setting a link on a cell likewise rebuilt that cell from scratch. Both now change only the field being edited. The logic moved out of `App.vue` into a tested module (`core/gallery.ts`). The validator also flags a malformed `focus` on a gallery item. `+8` tests.

Known limit, not new: PowerPoint export ignores pan/zoom on every image — single images and gallery cells alike — and places the whole picture.

**The guided tour gains a Tables & Charts section** (#48)
The demo deck on the GitHub Pages site (`deck.example.md`, generated by `scripts/gen-example.mjs`) has a new section: a real table ("Which Layout When", with a header row), a slide explaining the three views, a **pie** of the tour's own slides per section, and a **word cloud** of its layouts by use. Both charts are counted from the finished tour when the generator runs, so they're true by construction and can't go stale when the tour is edited. Three outdated claims were corrected in place: the editor slide still described the old autosave dot, the files slide still described native Open file / Open folder dialogs rather than the granted decks folder and `.dek` bundles, and the export list lacked PowerPoint. The video caption now mentions framed/fullscreen. A new test parses the shipped tour on every run, requiring zero schema warnings, a clean round-trip, and pie counts that match its sections. `+4` tests.

**Tables can be shown as a word cloud** (#48)
A third table view, *cloud*: words from the first column, sized by an optional numeric column (no numbers means equal weights). Sizes follow a square-root scale, because perceived size tracks area and a word twice the weight shouldn't look four times as big. The largest words are set in the heading face — Cormorant, light italic — and the rest in the table's own face. The three heaviest take the accent colour and everything else stays in dim text. With equal weights nothing is accented, since "the top three" would just be alphabetical. Beyond 60 words the lightest drop, since a denser cloud stops being readable on a slide.

The layout is **deterministic**: largest word first, along an elliptical spiral stretched to the box's shape, each word at the first spot it overlaps nothing. The same table therefore always produces the same cloud — it never reshuffles between renders or when you present. Word widths come from a per-font advance estimate rather than live glyph measurement. That is what makes the slide and the PowerPoint export identical; the cost is slightly looser packing, never an overlap. In PowerPoint each word is its own editable text box.

**Fixed: slide headings exported to PowerPoint upright.** The PPTX writer ignored a text box's own italic/bold/underline/strike — only inline `*Markdown*` styling reached PowerPoint. Bake marks every heading italic, so every heading in every export lost the light italic that the design language is built on. Box-level styling now applies to all of a box's text. `+14` tests.

**Tables can be shown as a pie chart, and have a header row** (#48)
A table now has a **view** switch in the top bar — *table* or *pie* — and the rows stay the source of truth either way. Switching view never changes the data. The pie reads the first column as labels and the **first mostly-numeric column** as values, so a table can keep a notes column before its numbers. With the new **header** toggle on, the first row names the columns: it's styled as a header in the grid (accent colour and a stronger rule — no bold, no capitals) and skipped as data by the chart. New tables start with a header row.

The pie follows the design language rather than a charting library's defaults: one accent colour stepped down in opacity, so it follows any theme; slices separated by the slide's own ground colour; labels with shares set outside the pie rather than in a legend; more than six categories fold the smallest into a neutral "Other", because angles that small can't be compared. A real slice under 1% reads "<1%", never "0%". Numbers are read as people type them — `42%`, `€ 3,50`, `1.234,5` and `1,234.5` all work. A single comma is decimal, so `1,200` is 1.2, not twelve hundred.

In the editor, **Edit data** flips a chart to its rows in place and **Show chart** flips back. It isn't saved and never appears when presenting or in export. PowerPoint export draws the pie as **native pie shapes**, one per slice, so it stays vector and editable rather than a pasted picture. It shares one geometry module with the slide, so they can't disagree. Header rows export in the accent colour. `+29` tests.

**One table object for the layout and the canvas — stored as rows you can read** (#48)
A table used to be described twice: the Table layout carried seven flat fields on the slide (`tableRows`, `tableCols`, `tableCells`, `tableColWidths`, …) and the canvas table element carried the same seven under different names. Every feature had to be built on both sides, and they had already drifted — a canvas table had no Rows/Cols stepper, and its cells could take neither an image nor a right-click menu. Both now carry the **same `table` object**, rendered, edited, sized and exported through the same code. Baking to Freeform is a copy, not a translation. The top bar shows one set of table controls for whichever table is active, and canvas table cells get images, links and the cell menu.

The storage changed with it. Instead of a flat list of cells plus dimensions (twelve lines for an empty 3×3, row structure invisible), a table is **rows**, written one per line:

```yaml
table:
  rows:
    - [Tool, Share]
    - [Maya, 42]
    - [{ image: logo.png }, Blender]
```

Plain cells are bare values; numbers stay numbers (`42`, never `'42'`) — but only strings that round-trip exactly are converted, so `007`, `1e3` or `3,5` keep reading as typed. A cell that needs more is an inline object, and a position covered by a merge is `null`. The row and column counts are simply the rows, which removes the "cell count doesn't match rows×cols" warning — that state can no longer exist. **Existing decks migrate on load**: old layout fields, old canvas elements, and old fields parked in `stash` all convert losslessly, and are written in the new form on the next save.

Found and fixed along the way:
- **Table → Text → Table lost every image cell.** Text can only show a table's text cells. The conversion consumed the table, so the image cells were never parked in `stash`. A table now stays in `stash` whenever it feeds a Text or Gallery slot, and switching back restores it whole.
- **The unused-asset scan ignored `stash` entirely.** Any image parked by a layout switch — Image-Full → Text stashes the image, Gallery → Text stashes the items — looked unreferenced, so the Review panel offered to delete it, and switching back found it gone. This predates tables; it's the same class as the canvas-image incident. The scan now walks `stash`, including stashed tables, galleries and canvas elements.
- **PPTX tables exported with solid white rules.** The exporter passed the full text colour as the rule colour; on screen the rules are the 14% hairline. They now export at the on-screen weight.
- **Markdown tables now convert.** A Text slide containing a pipe table (`| a | b |` with a `|---|---|` separator) switches into a real Table grid, instead of one column of cells holding raw pipes and dashes. Pasting a Markdown table into a Text slide and switching layout is now a quick way to author one.

`+29` tests.

**Video comes in two flavors: Framed and Fullscreen** (#43)
The video layout now has a **framed / fullscreen** toggle in the top bar. *Framed* is the existing look — a centred 16:9 frame with a hairline border, radius and drop shadow, and a caption below it. *Fullscreen* bleeds the video to the slide edges with no border, radius or shadow, since any of those would draw a visible seam against the slide it's meant to be flush with. Both are 16:9: the stage is itself 16:9, so fullscreen is the same frame with the margin and chrome removed, not a different aspect. A caption isn't rendered in fullscreen — there's nowhere for it to sit — but the text stays on the slide and comes back when you switch to framed. PPTX/HTML export bakes each flavor to matching geometry. `videoFit: framed | full`, defaulting to `framed`, so existing video slides are untouched. `+3` tests.

**Transparent images no longer sit on a grey square** (#43)
Every image frame — text-image, image-caption, gallery cells, speaker portraits — painted a translucent white fill (3–4% white) behind the picture. Over the near-black ground that reads as mid-grey, which an opaque photo hides completely but a PNG or SVG with an alpha channel lets straight through: transparent artwork appeared to sit on a grey card instead of on the slide. The fills are gone; frames keep their hairline border and radius, so an empty frame still reads as a frame.

**Tables are real canvas objects, with their own typography** (#43)
Three things, all one change underneath. **A table is now a first-class canvas object** (`type: 'table'`), so converting a Table slide to Freeform keeps it a table — editable, movable, resizable as one unit — and converting back restores the layout with its cells, merges, dragged track sizes and typography intact. Previously baking to Freeform exploded the grid into loose text and image boxes: a one-way trip that lost the structure. **Cell typography is configurable** — pick the heading or body face and a base text size for the whole table, from the top bar (for the layout) or with the object selected (on the canvas). **Cell text auto-shrinks to fit**, using the same fitting the layouts' headings and bullets already use, so a long entry stays inside its cell instead of overflowing a fixed grid track. The layout and the canvas object share one renderer (`TableGrid.vue`) and one geometry module, so they can't drift apart, and PPTX export flattens a table to one shape per cell (rules included) rather than dropping it.

Also fixed while in here: table cell borders and text used a hardcoded dark-theme grey and a CSS variable that doesn't exist (`--dek-fg`), so cell text fell back to an inherited color and the rules ignored the deck theme — both now use the real `--dek-line` / `--dek-text` tokens and adapt to the light theme. Interior rules no longer double where cells meet. Images in cells sit edge-to-edge instead of floating inside the text padding. And `tableColWidths`/`tableRowHeights` were missing from the layout's known-field list, so any table with a dragged divider would have been flagged with a bogus "field isn't rendered" warning. `+13` tests, including the freeform round-trip and orphan-asset coverage for images nested in a baked table's cells.

**New Table layout** (#43)
Dek gains a real, structured **Table** layout — rows/columns set from a top-bar stepper (Rows/Cols), a genuine `tableRows`/`tableCols`/`tableCells` data model (not a raw HTML `<table>` dropped into a freeform slide, which is what "Insert → ▦ Table" used to do). Each cell holds text or an image, wired through the same right-click image menu every other image field already has (Copy/Paste/Download/Add Link/Replace/Remove, plus an "Add Image…" entry for an empty cell). Shrinking the grid warns before dropping any cell with real content, mirroring the Review panel's own asset-loss guard. Table cell images are fully tracked by the orphan-asset scanner from day one — the exact bug class (`elements[].src` not walked) that once caused the Review panel to offer deleting images still in use. Layout-switch pooling lets a table's content flow into/out of Gallery and Text (image cells ⇄ gallery items, text cells ⇄ bullet lines) so converting layouts doesn't lose data. Draggable dividers and cell merging are follow-up work, not part of this pass. New `src/core/table.ts`; `+22` tests across `table`, `analyze`, `bake`, `deck`, and `convert`.

### Opening & saving

**Fixed: images in table cells and in `stash` were saved as dead links inside a bundle** (#48)
Inside a `.dek` bundle an uploaded image is written to `Assets/` straight away, and the slide briefly holds a temporary `blob:` URL until saving turns it back into the `Assets/…` path. That translation — and the reverse on load, and the list of files Save As copies into a new bundle — all run through one mapper, and it knew nothing about tables or `stash`. So a picture placed in a table cell showed as broken whenever the deck was reopened. One uploaded into a cell was saved to `deck.md` as a `blob:` URL that died with the tab, and its file was left unreferenced in `Assets/`, where the Review panel would offer to delete it. Any image a layout switch had parked in `stash` hit the same path, as did bare-string gallery items. The mapper now covers table layouts, canvas tables, `stash` and string gallery items, and Save As copies all of them. `+6` tests.

**Recent decks in the deck menu** (#49)
The deck menu's "Decks" section listed the decks in the currently open folder — and since every deck is its own `.dek` bundle, that was only ever the deck already open. It's replaced by **Recent**: your last 10 decks, most recent first, one click to reopen, with the subfolder each lives in shown beneath its name. That line is the only way to tell two "Week 01"s from different courses apart, so an entry is identified by its location, never its name. Decks join the list when opened through *Open deck…* or created with *Save As*. A deck that has since been moved or deleted is dropped from the list when you try it, with a message saying so. A lapsed folder grant leaves the entry in place, because the deck is still there. The old folder list still appears when a plain folder genuinely holds more than one deck.

**Opening another deck no longer discards unsaved changes.** Opening replaced the deck outright, so with autosave off any unsaved edits were silently lost. A one-click Recent list would have made that much easier to trigger. Opening a recent deck now saves pending edits first when autosave is on, and asks when it's off. `+6` tests.

**Layout and Insert menus now match — and Insert is no longer in a serif** (#43)
The layout picker was a native `<select>`, so its popup took the operating system's styling — square, with the OS blue highlight — right beside Dek's own dark, rounded Insert menu. Worse, the Insert menu rendered in a **serif**: it's teleported to `<body>` so the centre bar can't clip it, which lifts it out from under the bar's JetBrains Mono, and it only said `font-family: inherit` — so it inherited the page default. Both menus are now the same component styling, with the chrome font set explicitly. The layout control shows the **current layout's name** (replacing the word "Layout"), with the active one marked in the menu the way an active tool is. It's sized to the longest label ("Image + Caption") so the tools to its right don't shift as you move between slides. Both menus now close on a click elsewhere or Escape; Insert used to close on pointer-leave, which a 13-item list made too easy to trigger by accident.

**Insert is an icon button, matching the tools beside it** (#43)
"＋ Insert ▾" is now just the ＋, at 31×29 — the exact size of the canvas tool buttons it sits next to, so the row aligns instead of having one odd-width member. The word and the caret were describing the menu that opens anyway; the tooltip names its contents (Video, Diagram, Table). While the menu is open the button takes the same accent treatment as an active canvas tool, so it reads as the source of the panel floating beside it.

**The Layout label folded into its own dropdown** (#43)
"Layout" was a separate uppercase label sitting beside the layout dropdown, and the dropdown sized itself to its longest entry ("Image + Caption"). Both are gone: the control now reads **Layout** itself, at a fixed width roughly half what it was, freeing space in a top bar that has been getting crowded. The select still carries the real layout as its value, so the current one is marked when the menu opens, and the tooltip names it without opening anything.

**One save icon instead of a checkbox, a word and a dot** (#43)
The autosave control was three things side by side — a checkbox, the word "autosave", and a coloured status LED — for what is really one piece of information. It's now a single disk icon: its **colour is the save state** (green saved, amber saving, red unsaved changes) and a **slash across it means autosave is off**. Click to toggle; Ctrl+S still saves now. The colour tracks the save state in both modes rather than dimming when autosave is off, so "red with a slash" reads as what it is — pending changes with nothing coming to write them. The tooltip spells out both states, since the icon no longer has a label beside it.

**Reloading keeps you on the slide you were on** (#43)
`current` was a plain `ref(0)` with nothing restoring it, so every F5 — including the automatic reload after an HMR-less change — dropped you back at slide 1 of a long deck. The slide index is now remembered per deck and restored on startup, and on the one-click re-grant path too (re-granting access to the deck you already had open is a resumption, not opening a new deck). Opening a genuinely different deck still starts at the top. Kept in `localStorage`, not in `deck.md`: a cursor position is this browser's view state, not deck content — writing it into the file would dirty it on every arrow key and show up in git. The key pairs the backend's file name with the deck's display name, because every `.dek` bundle's inner file is called `deck.md` and keying on that alone would make all bundles share one position. A remembered index is clamped to the current slide count, so a deck that has since shrunk can't restore out of bounds. New `src/storage/position.ts`; `+6` tests.

**A failed folder listing no longer looks identical to an empty folder** (#42)
`refresh()` in the Open/Save/Import panel ran unguarded — if listing a folder ever threw (a permission lapse, a path that no longer resolves, …), the error vanished silently and the panel just showed "No decks here yet," indistinguishable from a folder that's genuinely empty. It's now routed through the same error-surfacing path every other action in the panel already uses, so a real failure shows an actual message instead of masquerading as nothing being there.

**Open/Save/Import can browse into subfolders, not just the granted root** (#42)
The workspace browser only ever scanned one flat level — a subfolder that wasn't itself a `.dek` bundle was invisible and unreachable, so organizing decks into course/category folders (e.g. `S1_Design & Gestalt/Week 01…dek`, `Week 02…dek`) meant every deck below the top level simply never showed up unless the *exact* folder was the granted root. The panel now lists real subfolders alongside decks (📁, click to browse in) with a clickable breadcrumb back up to the root, and Open/Save As/Import all operate relative to whatever folder is currently browsed — so you can navigate into a course folder and open, save, or import right there, without re-granting a different root via "Change folder…" each time. `listWorkspaceSubfolders`/`resolveWorkspacePath` in `fsdir.ts`; `+2` tests.

**A warning banner explains when Open/Save As can't save real files** (#42)
Without the File System Access API, Dek silently falls back to browser local storage — decks aren't real files on disk, and the whole Open/Save As workspace flow disappears from the deck menu with nothing but a small note if you happen to open it. There's now a dismissible banner at startup that explains this plainly and gives an actual fix: on a Chromium-based browser (Chrome, Edge, Brave, Opera) it points at the "File System Access API" / "Experimental Web Platform features" flag, since the API is usually on by default there and its absence means it's off or the browser is outdated; on Safari or Firefox it says plainly that the feature isn't supported and suggests switching browsers, since no flag will fix that. Dismissal is remembered (`localStorage`) so it won't nag on every load.

**Fixed: exported presenter opened as a new tab instead of a real window** (#42)
The exported presenter's `window.open()` call was missing the `popup` window feature that the live editor's presenter popup already used (`popup,width=1100,height=700`) — without it, Chrome doesn't reliably create a standalone popup and can open the presenter as just another tab in the same browser window instead of a separate window you can drag to a second monitor. Added `popup` (and an explicit `about:blank` URL) to match.

**Exported presenter is always a separate window, and only in the notes export** (#42)
Two refinements to the exported HTML presenter. It now **always** opens as a separate pop-out window — there's no in-page overlay fallback; if the browser blocks the popup you're asked to allow pop-ups for the file. And the **without-Speaker-Notes** export no longer has a presenter at all: `P` does nothing and the on-screen hint drops it, since a presenter view without notes is pointless. Driven by a `window.__DEK_PRESENTER` flag baked into the file.

**Two HTML export options, and the exported presenter view pops out** (#42)
The single "Download HTML" export is now two: **Download HTML Presentation** (the full standalone file, speaker notes embedded) and **Download HTML (without Speaker Notes)** (identical, but ships an empty notes array so private notes never leave your machine — saved as `<deck>_no-notes.html`). In both exports, pressing **P** in present mode now **pops the presenter view out into a separate window** — current slide, next slide, speaker notes, and a running timer — so you can drive it across two screens just like the live editor's presenter, instead of the old in-page overlay. Nav stays in sync between the two windows (arrows/space/click from either). Also swapped the deck-menu arrows so **Export is ↓** (a download) and **Import is ↑**.

**Deleting an "unused" asset is now recoverable (no more permanent loss)** (#42)
The Review panel's asset cleanup used the File System Access API's `removeEntry`, which deletes **permanently** — it bypasses the OS Recycle Bin — so a wrongly-flagged image was gone for good. Deleting now **moves the file into an `Assets/_trash/` subfolder** instead of unlinking it: it disappears from the deck and from the orphan list (a directory, so it isn't re-scanned), but stays intact and recoverable straight from the bundle. Collisions keep the original name for the first copy and timestamp-prefix any later one. The confirmation dialogs were reworded to match (files are moved to `_trash`, not irreversibly destroyed).

**Orphan detection no longer false-flags real images** (#42)
Two ways the "unused asset" scan wrongly condemned images that were actually in use: (1) it never looked at **freeform-canvas element images** (`elements[].src` on box/image elements, and video `poster`/`video`), so every canvas or baked image looked unreferenced; (2) when a deck referenced **no local files at all** yet the folder was full — the signature of a deck that isn't loaded, failed to parse, or is the wrong one — it flagged the *entire* folder as orphaned, which is exactly how a whole set of images could be one-click deleted. The scan now collects canvas element refs, and refuses to mass-flag when there are zero local references to match against (under-reporting orphans beats nuking a folder). Three new tests cover canvas refs, the empty-reference guard, and the trash-move.

**A bundle is named by its folder, and clearer menu icons** (#42)
A `.dek` bundle's name now always comes from the **folder** (`My Talk.dek` → "My Talk"), not from whatever `deck:` the inner `deck.md` happens to hold — so an opened deck no longer shows up as "deck" in the title and the Decks list when the inner file's name had drifted. Applied on every open path (the Open panel, startup restore, and reconnect). Also swapped the deck-menu icons: Import/Export are now a plain **↓ / ↑** download-up pair and Save As is a **💾**, instead of two arrows (Save As and Export) that pointed in confusingly opposite directions.

**Dek's own Open/Save panels — one folder grant, no more file dialogs** (#41)
Native file dialogs are gone from the everyday flow. You grant a **decks folder once** (the single unavoidable OS prompt, persisted and auto-reconnected), and after that Open and Save are Dek's own in-app panels over that folder: **Open** lists the `.dek` decks in it, click to open; **Save As** is a text field — type a name, and Dek creates `<name>.dek/` for you (uniquified, never clobbering a sibling). No folder to create by hand, no picker. This works because a *directory* grant gives full programmatic access — list, create, read, write — whereas the per-file pickers were the only thing forcing native dialogs. Images stay in each bundle's `Assets/`, so `deck.md` stays small and readable (a self-contained single file was the alternative, but inlining images as data URLs bloats it past what an LLM can hold). New `DeckBrowser.vue` + a workspace layer in `storage/fsdir.ts`; 4 tests cover listing, named creation, uniquification, and round-trip.

### Design system

**Themed links and a readable light theme** (#39)
Links in slide bodies had no CSS anchor rule at all, so they fell back to the browser's bright blue and — once clicked — purple. They now wear the deck's own accent; a visited link keeps that accent, just calmer, so "seen" reads without a jarring colour shift, and the underline (not colour alone) carries the affordance so a link isn't missed on a light background. Canvas box-links use the same tokens.

The light theme was partly unreadable because `slide.css` hardcoded the *dark* theme's off-white (`rgba(230,236,242,α)`) for all secondary text — header, footer, page number, byline, cite, captions, credits, hairlines — which vanished on a near-white ground. Those 17 literals collapse into three theme-derived tokens emitted by `theme.ts` from each theme's own text/accent: `--dek-dim` (prominent secondary), `--dek-faint` (chrome), `--dek-line` (hairlines), plus `--dek-link` / `--dek-link-visited`. On the light theme secondary text now clears WCAG AA (dim 6.2:1, faint 3.7:1, links 4.8:1) instead of the previous ~1:1.

### Canvas & editor

**Fixed: a slide with a canvas element on top lost its clickable text** (#44)
Any regular layout can carry canvas elements on top — a QR code on a Text slide, an arrow on an image. As soon as it did, the canvas layer covered the **whole** slide, so clicking the title or a bullet started a selection marquee instead of editing it. On such slides the layout's own text couldn't be clicked into at all. Now only the elements themselves catch the pointer; everywhere else belongs to the layout. The one thing given up is drag-selecting several canvas elements from empty space over a regular layout — click or Shift-click them instead. Freeform canvases, where the canvas *is* the slide, work as before. Clicking into the layout now also clears an element selection.

**A right-click menu on the slide's empty background** (#44)
Right-clicking empty space on a regular layout fell through to the browser's menu. It now opens Dek's stage menu: Paste, Add Text Box and Add Shape at the spot you clicked, then the slide operations — Duplicate, Insert Before/After, Cut/Copy/Paste Slide, Delete and the rest of the sidebar thumbnail's menu. A Freeform canvas's empty-space menu gains the same slide operations, so there's one background menu to learn. Right-clicking an image, a table cell or text still opens its own menu.

**Right-click a heading or list to edit or format it** (#46)
Right-clicking a title or bullet list you weren't already typing in fell through to the browser's menu, which has nothing useful for slide text. It now offers **Edit Text** — which starts editing with the caret where you clicked — followed by Bold, Italic, Underline, Strikethrough and Add Link. With nothing selected, those apply to the **whole** text. While you're actively typing, a plain caret still gets the browser's menu, so spell-check suggestions keep working; a selection or a link inside text you're editing gets Dek's menus, as before.

**Dek's own right-click menu while presenting** (#43)
Right-clicking a running presentation showed Chrome's menu — Back, Forward, Print, Cast — none of which means anything mid-talk, and one of which navigates away from the deck. Presenting now has its own menu: Next / Previous Slide, Overview, Presenter View, Fullscreen (ticked when on) and Exit Presentation, each with its key. Right-clicking a **link** still gets the browser's menu, so opening it in a new tab works as before.

**Fixed: dragging an image could pull it off its own frame, looking cropped** (#42)
Panning a framed image had no bounds at all — a drag applied its full delta, so the picture could be dragged clean off the frame: background showed on one side while the picture ran out the other, reading as a hard crop even though nothing had been cropped. Pan is now limited to the picture's actual hidden overflow (half of it per edge, so at the limit one picture edge sits exactly on the matching frame edge). The practical effect: a `cover` image that overflows can still be dragged to choose which part shows, but a `contain` image at scale 1 — already fully visible, with nothing hidden to reveal — no longer moves at all; zoom in first and panning opens up. Zooming back out re-clamps too, instead of leaving the picture stranded at an offset that's now off-frame. The same clamp runs at render, so decks saved with an out-of-bounds focus display correctly without rewriting stored data. The move cursor and hover hint now appear only when there's genuinely something to pan into. New `render/pan.ts` (`panBounds`, `clampPan`) — `+8` tests.

**Automatic optical margin alignment for italic headings** (#42)
Mathematically-aligned display type can look indented — a capital with a diagonal top stroke ("V", "A", "W", "Y") doesn't reach the left edge of its own box until partway down, so a heading starting with one reads as offset from a straight-stemmed sibling below it (an "E", a "D") even though both boxes start at the exact same x-coordinate. Every left-aligned italic heading (`FittedText.vue` — cover title, section title, statement text, speaker name, slide/text-image/image-full/gallery/diagram titles, gallery labels) now self-corrects: instead of a hand-tuned per-letter lookup table, it measures the *actual* rendered glyph via `canvas.measureText`'s `actualBoundingBoxLeft` — the real font, weight, style, and current fitted size, not a guess — and nudges the line left by exactly however far its first glyph's visible ink sits inside the box. A straight-stemmed letter measures ~0 and gets left alone; a diagonal or round one gets pulled back to the margin. Centered/right-aligned text (statement's centered body) and non-italic fields (subtitle in body font, byline, captions) are automatically excluded — the correction only ever fires where the rule the professionals use actually applies, with nothing to remember to opt into at each of the fifteen-odd call sites. New `render/optical.ts` (`leadingGlyph`, `opticalMarginLeft`) — `+6` tests. Carries into the standalone-HTML/ZIP export (same live-rendered DOM/CSS); PPTX export and bake-to-freeform don't pick it up, since both are static geometry computations with no live glyph measurement.

**Fixed: a just-typed trailing space could vanish, and text could briefly flicker while typing** (#42)
Two related bugs in live bullet/paragraph editing. First: `parseContent` stripped trailing whitespace from every line — but content round-trips through this function on *every keystroke* (row text → Markdown → back into the row's own prop), so typing a space to start a new word (e.g. after an inline arrow or any word) could get silently eaten a moment after you typed it, since it was always "trailing" until the next character landed. Fixed by no longer stripping trailing whitespace at all (only leading indentation is trimmed) — `+5` tests lock the round-trip. Second: the shrink-to-fit text sizer (`FittedText`/`FittedTextList`) deferred its recalculation by both `requestAnimationFrame` *and* a Vue `nextTick`, so when a keystroke pushed a line just past its wrap/overflow threshold, the browser could paint one frame of the new, now-overflowing content clipped at the old (not-yet-shrunk) font size before the sizer caught up — a brief "disappears, then reappears." Since the sizer only touches plain DOM refs that are already current by the time it runs, the extra `nextTick` was unnecessary; dropping it tightens the response by one full tick, narrowing that window.

**Invert / Desaturate in the image right-click menu** (#42)
Two new toggles alongside Fit: Cover/Contain in every image context menu — the single layout image on Text + Image / Image – Full / Image + Caption, and any freeform canvas box carrying a picture. Both are independent CSS-filter toggles (can combine — an inverted grayscale image is just both checked), applied via `FramedImage`'s `filter` so they show correctly while editing, presenting, and in the standalone-HTML/ZIP export (which renders the same components). Portraits and gallery cells don't get the toggle, matching Fit's existing single-image-only scope. Layout-image state travels across layout switches and bake-to-freeform (same `MOD_SUPPORT`/`KNOWN_FIELDS` treatment as `imageFit`/`imageLink`), and clears when the image is replaced or removed. **Known limitation**: PPTX export can't carry these — PowerPoint's picture-recolor options don't map to arbitrary CSS filters, and baking a real filtered image would need an async pixel re-encode this export path doesn't support — so an inverted/desaturated image exports to `.pptx` at its original colors.

**Drag a chapter's header to reorder the whole group at once** (#42)
Only individual slide rows were draggable in the navigator — moving a whole chapter meant dragging every one of its slides out one at a time. A chapter's slides are always a contiguous run by definition, so its header is now draggable too: grab it and drop it before/after another chapter (or between any two slides) to relocate the entire run in one move, reusing the same block-reorder the multi-select drag already had. Dropping a dragged chapter onto another chapter's header inserts it before/after that chapter (top half vs. bottom half of the header); dragging a single loose slide onto a header still joins that group, unchanged.

**Fixed: couldn't drag an image onto Image – Full** (#42)
Dropping an image anywhere on an Image – Full slide silently did nothing, while the same drag worked fine on Image + Caption. Cause: the title/caption overlay div sits `position: absolute; inset: 0` — covering the *entire* slide, not just the strip where its text actually sits — with no `pointer-events: none`, so it caught every `dragover`/`drop` before the image underneath ever saw them. Image + Caption never had this problem because its caption is sized to a small corner box, not the whole frame. The overlay itself is now `pointer-events: none`, with the title/caption text boxes set back to `pointer-events: auto` so they stay clickable/editable — drops now reach the image everywhere the overlay has no visible content.

**Presenter view's slide preview and notes text now fill the space the divider gives them** (#42)
Dragging the divider between the current-slide preview and the notes/next-slide pane used to just add or remove empty margin — the current-slide preview was pinned at a fixed 640px and the notes text at a fixed 16px regardless of how much room the drag left them. Both now track the divider: the current-slide preview fills whatever space remains (capped so its 16:9 shape still fits the available height), the "Next" preview tracks the side pane's width, and the notes text scales between 15–26px with the side pane's width. Recomputed on window resize too.

**Right-click selected text or a link in any slide layout for Dek's own menu** (#42)
Selecting text (or right-clicking a link) inside a semantic layout's title, bullets, caption, subtitle, or byline used to fall through to the browser's native context menu — Cut/Copy/Paste/Select All, plus whatever the OS bolts on (emoji picker, "Go to …", spell check). It's the same menu the freeform canvas's text boxes already had (Bold/Italic/Underline/Strikethrough, **Add Link… (from selection)**; or Open/Edit/Remove Link when the selection is a link), just never wired to the semantic layouts' text fields. Now it opens there too. Scoped to actual contenteditable text with either a link or a non-empty selection under the cursor — a bare caret still gets the native menu (Cut/Copy/Paste etc. still work normally), and it can't collide with the freeform canvas's own text-box menu when canvas elements are overlaid on a layout.

**Text + Image caption no longer clipped on tall/square images** (#42)
On a 1:1 or 9:16 image the caption was cut off at the column's edge — the `.cols` grid clipped it (`overflow: hidden`) even though there was open space above the footer. The text column already clips itself, so that grid-level clip was redundant; it's now `overflow: visible`, letting the caption spill into the bottom margin. The image keeps its full height and the caption shows in full.

**Running header/footer/page-number no longer drift between layouts** (#42)
The running header, footer, and page number are pinned to fixed offsets on the slide stage, but they jumped 50–60px on some layouts. Cause: the layout-container rules (`.l-image-caption`, `.l-video-embed`, `.l-diagram`, `.l-section`, …) were written as bare `.l-x` selectors, and the slide root carries that same `l-x` class — so their `padding`/`text-align` leaked onto the stage itself, and the absolutely-positioned chrome resolved against a padded box. Those rules are now scoped to `.dek-pad`, so the stage is never padded and the chrome sits in exactly the same place on every layout.

**Text + Image gains an optional caption under the image** (#42)
The Text + Image layout can now carry a small optional caption/credit beneath its image, like Image – Full and Image + Caption already do. It renders in the mono body face, dim and left-aligned to the image's edge (base 18px, auto-shrinking to fit), and only appears when set — in the editor it shows a "Caption (optional)" placeholder. It reuses the slide's `caption` field, so switching between Text + Image and the other image layouts carries the text across (via the layout slot map), and it's recognised by the validator (no "field isn't rendered" warning) and baked under the image for HTML/PPTX export. The image keeps its full height on every ratio; the caption sits just below it in the existing bottom margin.

**More keyboard shortcuts: Esc to edit, Ctrl+D duplicate slide, Ctrl+S, Ctrl+A** (#42)
Filled in the gaps in the shortcut set. **Esc in present mode** now returns to the editor (a second press if you were fullscreen — the browser eats the first Esc to leave fullscreen, which no page can override). **Ctrl/Cmd+D** duplicates the current slide when nothing is selected on the canvas (it still duplicates selected *elements* when some are). **Ctrl/Cmd+S** saves the deck immediately instead of triggering the browser's "save page" dialog (works with autosave on or off). **Ctrl/Cmd+A** in the editor selects every element on the current slide. Typing in a text field is respected throughout — none of these fire while editing text, so native save/select-all/undo still work there. Tooltips updated (Edit button notes Esc; the autosave label notes Ctrl+S). Slide navigation (arrows, Space, Page Up/Down, Home/End) already worked and is unchanged.

**Validator no longer false-flags `imageFit` / `imageLink`** (#42)
Adding `imageFit` (Fill/Fit) or `imageLink` to a Text + Image / Image – Full / Image + Caption slide raised a spurious yellow warning badge — *Field "imageFit" isn't rendered by the … layout* — because the deck analyzer's per-layout allow-list hadn't been updated alongside the renderer, bake, and convert. Both fields are now recognised on the three single-image layouts, so setting Fit or a link on a layout image leaves the slide clean.

**Layout images are linkable, not just freeform boxes** (#42)
Making a picture clickable used to be a freeform-only trick (a box's `link` field). Now the **single image** in Text + Image / Image – Full / Image + Caption carries an `imageLink`, and **gallery cells** carry a per-cell `link` — set either from the right-click menu's **Add Link (from Clipboard)** (with **Remove Link** when one's present). In present and exported modes the picture becomes a real `<a>` overlay (an anchor laid over the frame, below any caption/label so those stay clickable, and absent while editing so clicks still select/pan). `imageLink` travels across layout switches like `focus`/`imageFit`, and because bake maps it onto the image's box element, the link survives into both the standalone-HTML and `.pptx` exports. Only `http(s)`/`mailto` are followed. (Speaker portraits stay unlinkable — they're a plain string array with nowhere to store a link.)

**Right-click an image on the canvas for Copy / Paste / Add Link / Download** (#42)
Right-clicking a freeform box that carries a picture now offers **Copy Image** (to the system clipboard), **Paste Image** (a clipboard image replaces the box's picture, through the same compress-and-store upload path as Replace), **Add Link (from Clipboard)** (an `http(s)`/`mailto` URL on the clipboard makes the box clickable — the paste-driven twin of dragging a link onto an image), and **Download Image**, alongside the existing Fit/Replace/Remove entries.

**…and on layout images too, not just freeform** (#42)
The image context menu only existed on freeform canvas boxes; right-clicking the picture in a semantic layout (Text + Image, Image – Full, Image + Caption) fell through to the browser's native menu. It now opens Dek's own menu there as well — Copy / Paste / Download Image, Fit: Cover / Contain (writing `imageFit`), Replace…, and Remove — all wired to the slide's `image` field via the shared clipboard/upload helpers. (Add Link is omitted: semantic images have no per-image link.)

**Image menu and drop-flicker fix reach every image layout** (#42)
Two of the image fixes had stopped at some layouts. The right-click image menu now also covers **Gallery cells and Speaker portraits** (Copy / Paste / Download / Replace / Remove, targeting that specific slot — Fit is single-image only), so every image in the deck answers the same menu instead of the browser's on grids. And the drag-drop highlight *flicker* fix — previously only on the freeform canvas — now lives in `FramedImage` too, so the "drop to replace" hint on all semantic layouts no longer strobes as the pointer crosses onto the overlay or the replace button.

**Drag-and-drop image fixes: no more flicker, no more "opens in a new tab"** (#42)
Dropping an image onto a canvas box was unreliable in two ways. The drop-highlight *flickered* because `dragleave` fires on the canvas layer every time the pointer crosses onto a child box; it now tests `relatedTarget` (where the pointer is going) and only clears when the pointer truly leaves the layer. And a drop that landed a hair outside a box — or on a slide whose canvas layer is `pointer-events: none` because it has no elements yet — hit the browser's default and **opened the image in a new tab, losing the deck**. A window-level guard now swallows stray file/URL drops everywhere except real text fields, so a near-miss is a harmless no-op; the app's own drop handlers still fire, since `preventDefault` only cancels the browser's default, not the emit.

**Fill vs. fit toggle for single-image layouts** (#42)
The image layouts (Text + Image, Image – Full, Image + Caption) always **cover**-cropped the picture to fill the frame, so a tall image — a logo with a wordmark under it, say — lost its bottom edge no matter the aspect ratio, with no way to show the whole thing. The toolbar now has a **fill / fit** toggle for these layouts: *fill* is the old cover behaviour, *fit* (`contain`) shows the entire image letterboxed inside the frame. Stored as `imageFit` and it travels with the image when you switch layouts (Image + Caption still defaults to *fit*, the others to *fill*).

**Zoom-out on a framed image stops at the natural fit** (#42)
Scroll-to-zoom on single-image layouts let you shrink an image below its fit baseline (down to 0.3×), which left the picture floating in a small box with gaps around it — reading as if it had been cropped. Scale 1 (the image exactly covering/containing the frame) is now the floor: you zoom *in* to crop and frame, and use the fill/fit toggle above to show the whole image rather than zooming out past the natural fit. Imported PowerPoint crops are unaffected — those are baked into the pixels, not stored as a sub-1 zoom.

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
