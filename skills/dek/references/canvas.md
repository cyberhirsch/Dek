# The freeform canvas

Any slide may carry an `elements[]` array of free-positioned objects drawn over
the layout. Coordinates are in **1280×720 stage pixels**, top-left origin, so
they scale with the slide.

## Before you write one

A named layout is almost always the better answer. Two reasons this matters more
than it looks:

- A freeform slide is **no longer restylable by changing its layout**. The
  structured fields are gone; the user can't switch `text → text-image` any more.
- Hand-placed boxes don't reflow. Edit the text later and it overflows or leaves a
  hole. The named layouts auto-fit; the canvas doesn't.

So: use the canvas for genuine diagrams, annotations, and callouts over an image.
Don't use it to nudge a bullet list two pixels left.

Note that a semantic slide *also* accepts `elements` — you can annotate a
`text-image` slide with an arrow without converting it to `freeform`.

## The element model

Five types share a common frame:

```yaml
{ type, x, y, w, h, rotation }
```

`rotation` is clockwise degrees about the element's centre; default `0`.

### box — the one primitive

A `box` is simultaneously a shape, a text box, and an image frame. It can be all
three at once:

- a **rectangle** is a box with a `fill`/`stroke` and no `content`
- a **text box** is a box with transparent fill/stroke and `content`
- an **image** is a box with a `src`

| Field | Type | Notes |
|---|---|---|
| `fill` | color | `transparent` for a pure text box. |
| `stroke` | color | `transparent` for a pure text box. |
| `strokeWidth` | number | 1–2 px. |
| `radius` | number | Corner radius, px. 8–12 matches the chrome. |
| `src` | string | Image path; makes the box a picture. |
| `fit` | `cover` \| `contain` | How the image fills the box. |
| `focus` | `{x, y, scale}` | Pan/zoom of the image inside the box. |
| `qr` | string (URL) | Draws the URL as a QR code filling the box. The *link* is stored, never a generated image — editing the URL redraws the code. Ignored if the box also has a `src`. |
| `link` | string (URL) | Makes the box clickable while presenting (`http(s)`/`mailto` only). Combine with `src` to make a photo clickable, or with `qr` so a code is both scannable and clickable. |
| `content` | string | Inline Markdown. `- ` lines become bullets. |
| `font` | `heading` \| `body` \| family | **Use the tokens**, not a literal family. |
| `size` | number | Font size in stage px. |
| `color` | color | Text color. |
| `align` | `left` \| `center` \| `right` | |
| `valign` | `top` \| `middle` \| `bottom` | |
| `weight` | number | 300 for the light heading look. |
| `bold` `italic` `underline` `strike` | bool | |
| `lineHeight` | number | Multiplier. 1.05 headings, 1.45 body. |
| `lineGap` | number | Gap between lines, in em. |

Text auto-shrinks to fit its box: the `size` you set is a **maximum**, not a
guarantee.

A QR box needs no image asset and takes almost no room in the file:

```yaml
- { type: box, x: 980, y: 460, w: 240, h: 240, qr: "https://example.com/rundgang" }
```

Dragging a hyperlink onto the canvas does this for you: onto empty canvas it
creates a QR box; onto a box that already holds a photo it only adds `link`, so
the photo becomes clickable without being destroyed.

### arrow

```yaml
{ type: arrow, x, y, w, h: 0, rotation, stroke, strokeWidth }
```

Drawn from the box's left-middle to its right-middle, then rotated about the
centre. So a diagonal arrow is a zero-height box of length = distance, with
`rotation` set to the angle. Keep them thin (2–3 px).

### image, video, diagram

```yaml
{ type: image,   x, y, w, h, src, fit, focus }
{ type: video,   x, y, w, h, video, poster }
{ type: diagram, x, y, w, h, code }          # Mermaid source
```

`image` is legacy — a `box` with a `src` is the current form and does more.

## Headings on the canvas must be italic and light

This is the mistake to avoid. A canvas heading has to match the CSS heading look:

```yaml
# right
- { type: box, x: 110, y: 70, w: 1060, h: 67, content: "The Point",
    font: heading, italic: true, weight: 300, size: 64, lineHeight: 1.05,
    fill: transparent, stroke: transparent }

# wrong — bold flattens Cormorant into a different, cheaper-looking face
- { type: box, ..., content: "The Point", font: heading, bold: true, size: 64 }
```

Cormorant Garamond earns its elegance from the modulation of a light italic
stroke. Bold (or upright 400) destroys that, and the slide reads as if it uses
two different serifs. Body and label boxes stay upright `font: body`.

The app's "bake to freeform" applies this automatically. When you hand-author,
you have to remember it.

## Geometry that matches the layouts

Stage is 1280×720. The named layouts pad by **70 px vertical, 110 px horizontal**,
so the content box is 1060×580 starting at (110, 70). Keep canvas elements inside
that unless you mean to bleed.

Sizes that sit on-system (from the type scale):

| Role | size | lineHeight |
|---|---|---|
| cover mark | 200–220 | 0.9 |
| section word | 110 | 1.05 |
| statement | 56 | 1.25 |
| slide heading | 64 | 1.05 |
| body / bullets | 26 | 1.45 |
| caption / byline | 18–22 | 1.45 |

Text boxes are inset by roughly (10, 6) px from their own edges by the renderer,
so a box drawn at `x: 100` puts its glyphs at about `x: 110`.

## A worked example

An annotated callout over an image — a semantic slide keeping its layout, with
two elements added:

```yaml
layout: image-full
image: Assets/still.jpg
title: The Establishing Shot
elements:
  - { type: arrow, x: 620, y: 300, w: 220, h: 0, rotation: 18,
      stroke: "#ffb474", strokeWidth: 3 }
  - { type: box, x: 850, y: 320, w: 300, h: 90,
      content: "Note the *negative space* here",
      font: body, size: 24, color: "#ffb474",
      fill: transparent, stroke: transparent }
```

Restraint applies here more than anywhere. Rotation is a spice, not a staple; a
few degrees give life, a carnival does not. Prefer the accent at low opacity or a
thin stroke over loud solid blocks.
