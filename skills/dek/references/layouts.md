# Dek layout reference

Every layout, its full field list, and a filled-in example. The fields listed for
a layout are exactly the ones Dek's validator accepts for it. Any other field is
**not rendered** — it survives in the file but never shows on the slide (the app
flags it as a warning), which is how typos hide. Check names here before writing.

Universal on every slide: `layout`, `notes`, `group`, `stash`, `elements`.

- [cover](#cover) · [section](#section) · [statement](#statement) · [speaker](#speaker)
- [text](#text) · [text-image](#text-image)
- [image-full](#image-full) · [image-caption](#image-caption) · [Image options](#image-options)
- [video-embed](#video-embed) · [gallery](#gallery) · [diagram](#diagram) · [table](#table) · [freeform](#freeform)
- [Deck config](#deck-config) · [Legacy aliases](#legacy-aliases)

---

## cover

Title slide. The `title` is set at display size, so keep it short — a few words,
not a sentence.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required. The mark. |
| `subtitle` | string | Optional. |
| `byline` | string | Optional. Author, course, date. |

```yaml
layout: cover
title: Open Source & AI
subtitle: Tools, Licences, Practice
byline: Prof. Seb Hirsch · Summer 2026
```

---

## section

A divider announcing the next part. One large centered phrase; no body.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required. Title Case — never all caps. |

```yaml
layout: section
title: How Licences Work
```

---

## statement

One bold line: a claim, a quote, a definition. Centered, large serif. If it needs
more than about three lines, it isn't a statement — use `text`.

| Field | Type | Notes |
|---|---|---|
| `text` | string | Required. Multi-line allowed (`text: >`). |
| `cite` | string | Optional attribution; rendered with a leading em dash. |

```yaml
layout: statement
text: >
  Motion graphics applies the principles of graphic design
  in a filmic, time-based context.
cite: Jon Krasner
```

---

## speaker

Bio slide: one to three portraits above a name and role line.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Required. |
| `role` | string | Optional, one line. |
| `portraits` | string[] | Image paths. Up to 3 render well. |

```yaml
layout: speaker
name: Seb Hirsch
role: Lecturer, Visual Effects Artist & Motion Designer
portraits:
  - Assets/portrait_1.jpg
  - Assets/portrait_2.jpg
```

---

## text

Heading plus a Markdown body. The workhorse.

| Field | Type | Notes |
|---|---|---|
| `title` | string | The heading. |
| `content` | string | Markdown block. `- ` = bullet, else paragraph. |
| `steps` | bool | Optional. While presenting, the rows (bullets and paragraphs) start hidden and each advance reveals the next. |

```yaml
layout: text
title: Today's Plan
steps: true
content: |
  - Questionnaire
  - Attendance

  A paragraph between bullet groups.

  - Semester overview
  - Machine check
```

Body text auto-shrinks to fit, but that's a safety net, not a licence. Past
roughly six bullets, split the slide.

---

## text-image

Body on one side, a picture on the other.

| Field | Type | Notes |
|---|---|---|
| `title` | string | The heading. |
| `content` | string | Markdown block, as `text`. |
| `image` | string | Path relative to the deck. |
| `caption` | string | Optional small credit under the image. |
| `side` | `left` \| `right` | Which side the **image** sits on. Default `right`. |
| `imageRatio` | `16:9` \| `1:1` \| `9:16` | Frame aspect — and with it the column split. Default `16:9`. |
| `focus` | `{x, y, scale}` | Pan/zoom inside the frame. Written by the editor. |
| `imageFit` `imageLink` `imageInvert` `imageDesaturate` | | See [Image options](#image-options). Fit defaults to `cover`. |
| `steps` | bool | Optional, as `text`. |

```yaml
layout: text-image
title: Bokeh
side: left
image: Assets/lens.jpg
imageRatio: "1:1"
caption: Shot wide open at f/1.4
content: |
  - **Sensor size** — larger blurs more
  - **Focal length** — longer blurs more
  - **Aperture** — wider blurs more
```

Quote the ratio (`"16:9"`), or YAML reads it as a sexagesimal number.

The ratio decides how much room the text gets. At `16:9` (the default) the image
takes about 70% of the width, leaving a text column only ~300 px wide at 21 px —
room for a few short bullets. `1:1` splits the width evenly; `9:16` gives the text
about two-thirds.

---

## image-full

Full-bleed image with optional overlaid text on a gradient scrim.

| Field | Type | Notes |
|---|---|---|
| `image` | string | Required. |
| `title` | string | Optional overlay heading. |
| `caption` | string | Optional overlay caption. |
| `focus` | `{x, y, scale}` | Pan/zoom. |
| `imageFit` `imageLink` `imageInvert` `imageDesaturate` | | See [Image options](#image-options). Fit defaults to `cover`. |

```yaml
layout: image-full
image: Assets/still.jpg
title: The Establishing Shot
caption: Blade Runner 2049 (2017)
focus: { x: 0, y: 0, scale: 1 }
```

---

## image-caption

A framed image with a small credit. By default it shows the whole picture,
letterboxed rather than cropped (`imageFit: contain`).

| Field | Type | Notes |
|---|---|---|
| `image` | string | Required. |
| `caption` | string | Credit line. |
| `captionPos` | `bottom-right` \| `bottom-left` \| `top-right` \| `top-left` | Default `bottom-right`. |
| `focus` | `{x, y, scale}` | Pan/zoom. |
| `imageFit` `imageLink` `imageInvert` `imageDesaturate` | | See [Image options](#image-options). Fit defaults to `contain`. |

```yaml
layout: image-caption
image: Assets/two_towers.jpg
caption: "The Lord of the Rings: The Two Towers (2002)"
captionPos: bottom-right
```

That caption is quoted because it contains `: ` — unquoted, YAML reads it as a
mapping and the parse fails. Film and paper titles hit this constantly.

---

## Image options

The three single-image layouts — `text-image`, `image-full`, `image-caption` —
share these modifiers for their `image`. The editor writes them from the image's
right-click menu and the top bar's fill/fit toggle. No other layout accepts them:
gallery items and table cells only have a `link` of their own.

| Field | Type | Notes |
|---|---|---|
| `imageFit` | `cover` \| `contain` | `cover` fills the frame and crops the overflow; `contain` shows the whole picture, letterboxed. Default `cover`, except `contain` on `image-caption`. |
| `imageLink` | URL | Makes the picture clickable while presenting and in the HTML export. Only `http(s)://` and `mailto:` links work; anything else is ignored. |
| `imageInvert` | bool | Inverts the picture's colors. |
| `imageDesaturate` | bool | Shows it in grayscale. Combines with `imageInvert`. |
| `focus` | `{x, y, scale}` | Pan/zoom, normally set by dragging and scrolling in the editor. `x`/`y` are pixel offsets (clamped to the picture's overflow); `scale` is the zoom, `1` = the natural fit. All three must be numbers — `focus: center` is flagged as malformed. Omit it rather than guess. |

Invert and desaturate are display filters: the file on disk is untouched, and
neither survives `.pptx` export.

```yaml
layout: image-full
image: Assets/xray_plate.png
title: Negative Space
imageFit: contain
imageInvert: true
imageDesaturate: true
imageLink: https://example.com/plates
```

---

## video-embed

Click-to-play video: YouTube, Vimeo, or a direct video file.

| Field | Type | Notes |
|---|---|---|
| `video` | string | Required. The URL — see below for which ones work. |
| `videoFit` | `framed` \| `full` | `framed` (default): a bordered 16:9 frame with the caption under it. `full`: edge to edge, no border — and **no caption** (it stays in the file, hidden until you switch back). |
| `poster` | string | Still shown before play. Falls back to `image`, then to the YouTube thumbnail. |
| `image` | string | Alternate poster source. |
| `caption` | string | Optional. Rendered only when `framed`. |

```yaml
layout: video-embed
video: https://www.youtube.com/watch?v=qyZy-6VuSy4&start=130&end=220
poster: Assets/still.jpg
caption: "The Lord of the Rings: The Two Towers (2002) — 2:10–3:40"
```

**Playing one segment.** Put the time window in the URL and Dek plays exactly
that part:

- YouTube: `&t=130` or `&start=130` starts there (`t=2m10s` and `t=1h2m10s` work
  too); add `&end=220` to stop there. Dek builds
  `https://www.youtube.com/embed/<id>?start=130&end=220&autoplay=1&rel=0`.
- Vimeo: `#t=75s` (or `#t=1m15s`) starts there. Vimeo's player has no end time.
- A file: a media fragment, `clip.mp4#t=30,95`, is honoured by the browser.

Say the segment in the `caption` too, so it is visible in the editor.

What `video` accepts:

- **YouTube** as `youtube.com/watch?v=<id>` (`v` anywhere in the query),
  `youtu.be/<id>`, `youtube.com/embed/<id>`, `/shorts/<id>` or `/live/<id>`.
  The canonical `https://www.youtube.com/watch?v=<id>` is still the clearest.
- **Vimeo** as `vimeo.com/<number>`. No automatic poster — set `poster`.
- **A file** whose URL ends in `.mp4`, `.webm`, or `.ogg`, played in the browser's
  own player (a `#t=` on the end stops Dek recognising it as a file). It has to be
  hosted: a video inside the bundle's `Assets/` isn't resolved the way images
  are, so it won't load. Set `poster` here too.

---

## gallery

A grid of images, for comparisons and contact sheets.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Optional. |
| `items` | `{image, label, link}[]` | One object per cell. `label` (optional) sits under the picture; `link` (optional) makes the cell clickable while presenting, `http(s)`/`mailto` only. |
| `columns` | `auto` \| number | `auto` (default) gives one column per image, up to 3. The editor offers 2, 3, 4. |

```yaml
layout: gallery
title: How to Screenshot
columns: auto
items:
  - { image: Assets/win.png, label: Windows }
  - { image: Assets/mac.png, label: macOS, link: "https://example.com/mac-screenshots" }
```

Write every item as an object: a bare path string (`- Assets/win.png`) is an old
form Dek doesn't resolve inside a bundle. Cells are always cropped to fill, with
no per-cell fit, focus, invert, or desaturate.

Past six images the grid gets dense — split it.

---

## diagram

A Mermaid chart, rendered live and themed to the deck.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Optional. |
| `code` | string | Mermaid source, as a block scalar. |

```yaml
layout: diagram
title: Post-Production Pipeline
code: |
  flowchart LR
    A[Shoot] --> B[Editorial]
    B --> C[VFX]
    B --> D[Color Grade]
    C --> E[Online]
    D --> E
    E --> F[Deliver]
```

Keep diagrams to a handful of nodes. A chart that needs a legend belongs on a
handout, not a slide.

---

## table

A grid of cells — text, numbers, or images — for anything that reads across
*and* down: comparisons, schedules, feature matrices. The same rows can instead
be shown as a **pie chart** or a **word cloud**: that's the `view`, and the rows
stay the data either way.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Optional heading above the grid. |
| `table` | object | Required. The grid and how to show it — below. |

`table` holds:

| Field | Type | Notes |
|---|---|---|
| `rows` | row[] | Required. One list per row, **one row per line**: `- [Maya, 42]`. Rows may differ in length; the longest sets the column count and shorter rows pad with blank cells. |
| `header` | bool | `true`: the first row names the columns. It's styled as a header (accent colour, stronger rule beneath — never bold or capitals) and the charts skip it as data. |
| `view` | `table` \| `pie` \| `cloud` | How the rows are shown. Default `table` — omit it for a plain grid. |
| `colWidths` | number[] | Optional relative widths, one per column (`[0.3, 0.7]`), normalised to sum to 1. The wrong count is ignored: equal columns. |
| `rowHeights` | number[] | The same, one per row. |
| `font` | `body` \| `heading` | Cell typeface. Default `body` — keep it (see below). |
| `size` | number | Base cell text size in stage px. Default 22. Text shrinks below it to fit its cell (down to 9), never grows above it. |

A **cell** is one of:

| You write | It is |
|---|---|
| `Maya` · `the talk begins` | Plain text, centred. **Not Markdown** — `**bold**` shows its asterisks. |
| `42` · `3.5` | A number. The charts read it; the grid shows it as written. |
| `""` | A blank cell. |
| `{ image: Assets/x.png }` | An image, full-bleed to the cell's rules and cropped. Add `link: https://…` to make it clickable while presenting. |
| `{ text: Q1, colspan: 2 }` | A merge: `colspan`/`rowspan` on the top-left cell of the block. |
| `null` (or `~`) | A position covered by a merge. Write one for **every** covered position, so each row keeps its full length. |

**Rows are YAML flow lists, so a comma splits a cell.** Quote any cell that
contains `,` `[` `]` `{` `}`, a `: ` or a ` #`, or that starts with a quote mark:
`["Rosenheim, Bavaria", 12]`. This bites German numbers hardest — `[Price, 3,50]`
is **three** cells; write `[Price, "3,50"]`. And quote anything that looks like a
number but must stay text: `"007"` (unquoted, YAML reads it as 7), `"1.0"`.

```yaml
layout: table
title: Lenses at a Glance
table:
  header: true
  colWidths: [0.4, 0.3, 0.3]
  rows:
    - [Lens, Focal length, Typical use]
    - [Wide, 24 mm, Establishing]
    - [Tele, 135 mm, Close-up]
```

A merge, with its covered positions as `null`:

```yaml
table:
  rows:
    - [{ text: Spans two columns, colspan: 2 }, null, C]
    - [D, E, F]
```

Merges have no editor UI yet — write them by hand.

Keep `font: body`. Cells don't get the heading's italic 300, so `heading` sets
Cormorant upright and regular — not the heading look the
[design language](design.md) is built on.

### The chart views

**`view: pie`** — labels from the first column, values from the **first column
after it in which most rows are numbers** (so a notes column may sit between).
With `header: true` the first row is skipped. Only positive values are shares of
a whole, so blanks, zeros, negatives and text are left out; more than six
categories fold the smallest into a neutral "Other". Numbers are read as typed:
`42%`, `€ 3,50`, `1.234,5` and `1,234.5` all work, and a **lone comma is a
decimal** — `1,200` is 1.2, not twelve hundred.

```yaml
layout: table
title: How This Session Is Spent
table:
  view: pie
  header: true
  rows:
    - [Part, Minutes]
    - [Lecture, 40]
    - [Studio, 35]
    - [Critique, 15]
    - [Questions, 10]
```

**`view: cloud`** — words from the first column, sized by an optional numeric
column; with no numbers every word weighs the same. The biggest words are set in
Cormorant italic and the three heaviest take the accent (none, if all weights
are equal). At most 60 words; the lightest drop. The layout is deterministic —
the same rows always give the same cloud.

```yaml
layout: table
title: Words From the Critique
table:
  view: cloud
  header: true
  rows:
    - [Word, Mentions]
    - [Contrast, 9]
    - [Rhythm, 6]
    - [Hierarchy, 5]
    - [Negative space, 3]
```

Choose the view for the idea. A **grid** when the reader compares across rows. A
**pie** only for parts of one whole, six or fewer — never for a trend over time
or quantities that don't add up to something. A **cloud** for a vocabulary or a
brainstorm, never where exact amounts matter: sizes can't be read as numbers.

### Getting a table from text

A `text` slide whose `content` holds a Markdown pipe table converts into a real
grid when its layout is switched to `table` — the line above the `|---|`
separator becomes the header row. Without a pipe table, each line becomes one
row of a single column.

Converting a table slide to freeform keeps it one `table` object on the canvas
(see [canvas.md](canvas.md#table)), and converting back restores the layout —
views, header and all.

**Older decks** may carry the previous format — `tableRows`, `tableCols`, a flat
`tableCells` list with `covered: true` placeholders, `tableColWidths`,
`tableRowHeights`, `tableFont`, `tableSize`. Dek converts them on load and
writes the form above on the next save. Never write the old fields.

---

## freeform

A blank canvas of positioned `elements`. See **[canvas.md](canvas.md)** before
writing one.

| Field | Type | Notes |
|---|---|---|
| `elements` | Element[] | Free-positioned objects, 1280×720 stage px. |
| `body` | string | Legacy raw-HTML escape hatch. Avoid. |

---

## Deck config

The first block. All fields optional.

| Field | Type | Notes |
|---|---|---|
| `deck` | string | Deck title. In a bundle Dek resets it to the folder name on open (`My Talk.dek` → My Talk), so rename the folder, not this. |
| `ratio` | string | `"16:9"`. Quote it. The only value — the stage is always 1280×720. |
| `paginate` | bool | Show the slide counter. |
| `header` | string | Running header (hidden on `cover`). |
| `footer` | string | Running footer (hidden on `cover`). |
| `theme` | object | `bg`, `text`, `accent`, `accent2`, `glow`, `fontHeading`, `fontBody`, `preset`. |

Change `theme` colors only when asked. The defaults are the design system; any
`theme` field left unset falls back to Editorial Dark. `preset` only records which
built-in theme the values came from (`default` = Editorial Dark, `light` =
Editorial Light) so the deck menu can mark it — writing it applies nothing. To
switch themes, have the user pick one in the deck menu, which rewrites the whole
`theme:` block.

---

## Legacy aliases

Old decks may use these; they load transparently, but write the modern name.

| Old | Current |
|---|---|
| `bullets` | `text` |
| `bullets-image` | `text-image` |
| `items:` list of strings on a text layout | `content:` Markdown block |
