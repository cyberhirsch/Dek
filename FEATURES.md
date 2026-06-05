# Dek — Desirable Features

Prioritized. **P0** = needed for v1 to be useful, **P1** = strong follow-up, **P2** = nice-to-have.
Each notes which reference tool the idea is borrowed from.

## Core / source format
- **P0** Single Markdown file as source of truth, `---`-separated slides. *(Marp)*
- **P0** Per-slide YAML front-matter with `layout` + named content fields; lossless
  parse ⇄ serialize. *(Slidev, but field-based instead of regex-scraped HTML)*
- **P0** Closed set of 10 named layouts (see `template.md`) + a `freeform` HTML escape hatch.
- **P0** Global theme as CSS variables (one place re-skins all slides). *(Marp themes)*
- **P1** Live hot-reload: editing the file updates the browser instantly.
- **P1** Schema validation — warn when a slide's fields don't match its layout.

## Minimal UI / presenting
- **P0** The rendered deck *is* the UI; chrome stays out of the way until summoned.
- **P0** Floating edit toggle + `Ctrl+E`; full-screen editor overlay. *(prototype: `global-bottom.vue`)*
- **P0** Keyboard slide navigation + slide counter.
- **P1** Presenter view (notes, next-slide preview, timer).
- **P1** Speaker notes per slide (front-matter `notes:`).
- **P2** Build/step reveals within a slide.

## WYSIWYG editing
- **P0** Live preview pane mirroring the actual slide. *(prototype)*
- **P0** `contenteditable` direct text editing of title/subtitle/body. *(prototype)*
- **P0** Layout picker with thumbnails; switching remaps fields. *(prototype)*
- **P0** Image **pan / zoom / drag-to-reposition**, scroll-to-zoom. *(prototype)*
- **P0** Drag-&-drop image upload → saved to `Assets/`, path written back. *(prototype)*
- **P0** Debounced **autosave** to the Markdown file + manual save + save-status badge. *(prototype)*
- **P1** Per-field controls per layout (e.g. `side: left/right` toggle, caption position).
- **P1** Add / duplicate / delete / reorder slides from the overlay.
- **P2** Snap guides / alignment helpers for `freeform` slides.

## LLM editing
**No in-app LLM UI.** The deck is a plain `.md` file with a clean, named-field schema, so
any external LLM (Claude, an editor copilot, a script) can read and rewrite it directly.
That *is* the LLM path — we deliberately ship no prompt box, no model config, no API keys.
What we owe the LLM is a format that round-trips cleanly:
- **P0** Structured named fields per layout (never positioned HTML) so an LLM's edits drop
  straight back in and never fight the WYSIWYG path. *(already true)*
- **P1** Keep `template.md` as the human/LLM-readable schema reference.

## PDF import / conversion (the M7 job)
- **P0** PyMuPDF extractor: text blocks + images per page → `Assets/`. *(scripts exist in `scratch/`)*
- **P0** Page→layout classifier seeded by the heuristic in the briefing (§4).
- **P1** "Review queue" UI to fix misclassified slides quickly.
- **P2** Re-import / re-sync when the source PDF changes.

## Export / output
- **P0** Export to **PDF**. *(Marp/Slidev both do this)*
- **P1** Export to **PPTX** and self-contained **HTML**.
- **P2** Per-deck print/handout stylesheet.

## Project / housekeeping
- **P1** Deck = a folder (`deck.md` + `theme.css` + `Assets/`); easy to git.
- **P1** Asset manager (list/replace/prune unused images).
- **P2** Multiple decks / weeks in one workspace (the course has 13).
