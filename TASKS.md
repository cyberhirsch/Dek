# Dek — Task List

Sorted by difficulty / assigned model. Update this file when tasks are added, completed, or reassigned.

---

## Sonnet — Easy

- **#43 Present-mode right-click menu.** Right-clicking during Present shows Chrome's
  native menu (Back/Forward/Print/Cast) — irrelevant in an SPA and the direct trigger
  for this task list. Add a `@contextmenu.prevent` on the present-mode stage with a
  small `CtxEntry[]`: Exit Presentation, Overview, Fullscreen, Next Slide, Previous
  Slide (reuse `toggleFullscreen`/`overviewOpen`/`jumpToSlide`, already in `App.vue`).
- **#46 "Edit Text" from a right-click on title/body text outside active editing.**
  Right-clicking a heading/bullet list when it isn't the live contenteditable does
  nothing today. Add an entry that focuses/enters editing on that text node, then
  falls through to the existing `textItems()` set (Bold/Italic/Underline/Strike/Add
  Link) — mirrors how `onCanvasContextMenu`'s `kind: 'text'` path already works for
  freeform text boxes, just needs the same hook wired for semantic layouts.

---

## Opus — Medium

- **#44 Empty-background context menu on the main slide stage (edit mode).**
  Right-clicking empty space on a *semantic* (non-freeform) slide currently falls
  through to the browser menu — only freeform canvases have `@contextmenu` via
  `CanvasElements.vue`. Add a stage-level handler in `Deck.vue`/`App.vue` offering:
  Paste (bakes the clipboard element onto the slide, same as `canvasItems()`), Add
  Text Box / Add Shape, then a divider and the slide-level ops that today live only
  on the nav thumbnail — Duplicate/Insert Before/Insert After/Delete/Cut/Copy/Paste
  Slide (reuse `thumbItems()`'s actions in `App.vue`). Needs to coexist with the
  existing freeform `canvasItems()` menu without double-binding on canvas slides.
- **#45 Context menu on a semantic layout's image (Replace/Remove/Fit).**
  Freeform image boxes get Replace Image…/Remove Image/Fit: Cover/Fit: Contain via
  `elementItems()`; the `image`/`poster`/`portraits` fields used by title-image and
  similar semantic layouts have no equivalent — right-clicking one does nothing.
  Needs a small patch path parallel to `patchElementAt` that targets a slide's
  top-level image field instead of a freeform `elements[]` entry, then a matching
  `CtxEntry[]` builder and a `@contextmenu` hook on those layouts' `<img>`.

---

## Fable — Hard

- **#48 Table layout: draggable dividers, inline row/col add/remove, and cell
  merging.** Phases 2–4 of the Table layout (see `src/core/table.ts`,
  `SlideView.vue`'s `l-table` block, `TopBar.vue`'s Rows/Cols stepper — Phase 1,
  shipped). Draggable column/row dividers (draft-on-`pointermove`, commit one
  `patch({ tableColWidths / tableRowHeights })` on `pointerup`, mirroring
  `CanvasElements.vue`'s resize-handle pattern rather than live-mutating every
  pixel); hover-revealed inline +/− row/column affordances sharing `resizeTable`'s
  logic; and multi-cell selection with a bulk context menu (Bold/Italic toggle,
  Clear, Merge — sets `colspan`/`rowspan` and marks the rest of the block
  `covered: true` — and Unmerge). CSS Grid needs no special-casing for merged
  cells resizing with dragged dividers (`grid-column: span N` tracks resize
  automatically) — confirmed during Phase 1 planning.

---

*Completed tasks are documented in [CHANGELOG.md](CHANGELOG.md).*
