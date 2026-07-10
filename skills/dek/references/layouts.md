# Dek layout reference

Every layout, its full field list, and a filled-in example. Fields not listed for
a layout are **not rendered by it** — they'll survive in the file but never show
on the slide, which is how typos hide. Check names here before writing.

Universal on every slide: `layout`, `notes`, `group`, `stash`, `elements`.

- [cover](#cover) · [section](#section) · [statement](#statement) · [speaker](#speaker)
- [text](#text) · [text-image](#text-image)
- [image-full](#image-full) · [image-caption](#image-caption) · [video-embed](#video-embed)
- [gallery](#gallery) · [diagram](#diagram) · [freeform](#freeform)
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
| `steps` | bool | Optional. Reveal rows one at a time while presenting. |

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
| `side` | `left` \| `right` | Which side the **image** sits on. Default `right`. |
| `imageRatio` | `16:9` \| `1:1` \| `9:16` | Frame aspect. Default `16:9`. |
| `focus` | `{x, y, scale}` | Pan/zoom inside the frame. Written by the editor. |
| `steps` | bool | Optional, as `text`. |

```yaml
layout: text-image
title: Bokeh
side: left
image: Assets/lens.jpg
imageRatio: "1:1"
content: |
  - **Sensor size** — larger blurs more
  - **Focal length** — longer blurs more
  - **Aperture** — wider blurs more
```

Quote the ratio (`"16:9"`), or YAML reads it as a sexagesimal number.

---

## image-full

Full-bleed image with optional overlaid text on a gradient scrim.

| Field | Type | Notes |
|---|---|---|
| `image` | string | Required. |
| `title` | string | Optional overlay heading. |
| `caption` | string | Optional overlay caption. |
| `focus` | `{x, y, scale}` | Pan/zoom. |

```yaml
layout: image-full
image: Assets/still.jpg
title: The Establishing Shot
caption: Blade Runner 2049 (2017)
focus: { x: 0, y: 0, scale: 1 }
```

---

## image-caption

A framed image (contained, not cropped) with a small credit.

| Field | Type | Notes |
|---|---|---|
| `image` | string | Required. |
| `caption` | string | Credit line. |
| `captionPos` | `bottom-right` \| `bottom-left` \| `top-right` \| `top-left` | Default `bottom-right`. |
| `focus` | `{x, y, scale}` | Pan/zoom. |

```yaml
layout: image-caption
image: Assets/two_towers.jpg
caption: "The Lord of the Rings: The Two Towers (2002)"
captionPos: bottom-right
```

That caption is quoted because it contains `: ` — unquoted, YAML reads it as a
mapping and the parse fails. Film and paper titles hit this constantly.

---

## video-embed

Click-to-play video. Accepts YouTube, Vimeo, or a direct file URL.

| Field | Type | Notes |
|---|---|---|
| `video` | string | Required. URL. |
| `poster` | string | Still shown before play. Falls back to the YouTube thumbnail. |
| `image` | string | Alternate poster source. |
| `caption` | string | Optional. |

```yaml
layout: video-embed
video: https://www.youtube.com/watch?v=qyZy-6VuSy4
poster: Assets/still.jpg
caption: "The Lord of the Rings: The Two Towers (2002)"
```

---

## gallery

A grid of images, for comparisons and contact sheets.

| Field | Type | Notes |
|---|---|---|
| `title` | string | Optional. |
| `items` | `{image, label}[]` | Each item's `label` is optional. |
| `columns` | `auto` \| 2 \| 3 \| 4 | `auto` derives from the count. |

```yaml
layout: gallery
title: How to Screenshot
columns: auto
items:
  - { image: Assets/win.png, label: Windows }
  - { image: Assets/mac.png, label: macOS }
```

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
| `deck` | string | Deck title. |
| `ratio` | string | `"16:9"`. Quote it. |
| `paginate` | bool | Show the slide counter. |
| `header` | string | Running header (hidden on `cover`). |
| `footer` | string | Running footer (hidden on `cover`). |
| `theme` | object | `bg`, `text`, `accent`, `accent2`, `glow`, `fontHeading`, `fontBody`, `preset`. |

Change `theme` colors only when asked. The defaults are the design system, and
`preset: default` / `preset: light` selects a built-in theme.

---

## Legacy aliases

Old decks may use these; they load transparently, but write the modern name.

| Old | Current |
|---|---|
| `bullets` | `text` |
| `bullets-image` | `text-image` |
| `items:` list of strings on a text layout | `content:` Markdown block |
