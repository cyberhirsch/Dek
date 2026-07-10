# Dek design language

Dek's look is **editorial calm**: a quiet near-black canvas, an elegant light
serif paired with a technical monospace, lots of air, and one disciplined accent.
The identity rests on that serif/mono contrast and on restraint. When you style a
slide you're protecting that mood — favor removing things over adding them.

## The cardinal rule: no all caps

**Never set headings or text in ALL CAPS with this theme.** Headings in Title
Case, body in sentence case. Acronyms keep their natural form (PDF, API, LLM).

Why this is the one hard rule: the heading face is **Cormorant Garamond, italic,
weight 300** — a light display serif whose whole appeal is the modulation between
thick and thin strokes and the flow of the italic. All caps flattens that into
uniform rectangles, kills the italic's movement, and reads as shouting against an
otherwise hushed, magazine-like layout. It looks cheap in exactly the way this
theme is trying not to.

Write `The Basics`, not `THE BASICS`. `Save to local files`, not `SAVE TO LOCAL
FILES`.

Older decks — and the repo's own `template.md` — still contain all-caps headings.
They are a leftover, not a precedent. Fix them when you touch them.

(The rule is tied to the serif. If a deck's `fontHeading` is ever swapped for a
geometric sans or a condensed display face built for caps, revisit it. With
Cormorant or any similar serif, keep it mixed-case.)

## Type

Two fonts, always from the theme. Never introduce a third. The tension between
them *is* the brand.

- **Heading — `fontHeading` (Cormorant Garamond):** italic, light (300), a hair
  of positive letter-spacing. Used large: cover mark, section words, statements,
  slide headings. Elegant, editorial, generous line-height.
- **Body — `fontBody` (JetBrains Mono):** monospace, the technical counterpoint.
  Bullets, captions, bylines, code, chrome.

Stage type scale (1280×720), for keeping canvas text boxes consistent with the
built-in layouts:

| Role | size (px) |
|---|---|
| cover mark | 200–220 |
| section word | 110 |
| statement | 56 |
| slide heading (h1) | 48–64 |
| body / bullets | 26 |
| caption / byline | 18–22 |

When creating a canvas text box, set `font: heading` or `font: body` — the
tokens, not a literal family — and pick a `size` near these values rather than an
arbitrary number.

## Color

Restraint, not a palette. Most of any slide is off-white text on near-black.

| Token | Value | Role |
|---|---|---|
| `bg` | `#070809` | Near-black ground |
| `text` | `#e6ecf2` | Off-white, the workhorse |
| `accent` | `#7fc7ff` | Blue — the primary accent: bullets, links, active states |
| `accent2` | `#ffb474` | Amber — used **sparingly**, one secondary highlight |
| `glow` | `true` | A soft dual radial gradient behind the slide; keep it subtle |

Don't rainbow. A slide that needs five colors to make its point usually needs
fewer words instead. If two accents are competing on one slide, you've overused
the second. For canvas shape fills, prefer the accent at low opacity, a dark
tint, or a thin accent stroke over loud solid blocks.

## Space and composition

- The stage is **16:9, 1280×720**. Layouts pad ~70 px vertical, ~110 px
  horizontal. Respect that breathing room; don't crowd the edges.
- **One idea per slide.** Negative space is a feature, not waste.
- Headings and bodies are **left-aligned**; `cover`, `section`, and `statement`
  center. Keep that convention unless there's a reason.
- Images go full-bleed (with a gradient scrim under any overlaid text) or framed
  with a small credit. Let them breathe rather than boxing them tightly.

## Canvas elements

The freeform canvas can do anything, which is exactly why it needs the most
restraint.

- Text boxes: `font: heading|body`, sizes from the scale, color `text` (or amber
  for a deliberate highlight).
- **Heading boxes are italic and light, never bold** — `font: heading`,
  `italic: true`, `weight: 300`. A bold heading flattens Cormorant and reads as a
  different, cheaper typeface on the same slide.
- Shapes: subtle fills, thin strokes (1–2 px), modest corner radius (8–12).
- Arrows: thin, in off-white or amber.
- Rotation is a spice, not a staple — a few degrees for life, not a carnival.

## In the repo: tokens are the source of truth

If you're working inside the Dek repository rather than on a deck, the canonical
numbers live in `src/tokens/`:

- `base.tokens.json` — stage geometry, padding, radii, type scale, element defaults
- `theme.default.tokens.json` — Editorial Dark colors and fonts
- `theme.light.tokens.json` — the light theme

Code consumes them via `src/tokens/index.ts` and `src/core/defaults.ts`. Change
the token file, not a literal in a component, and check whether
`src/styles/slide.css` mirrors it.

## Gut-check before finishing

- Any ALL CAPS text? Convert to Title/sentence case.
- A bold or upright canvas heading box? Make it italic, `weight: 300`.
- More than the two theme fonts in play? Pull back to heading + body.
- More than one accent fighting for attention? Simplify.
- Cramped against the edges, or many ideas on one slide? Add air or split it.
- Did a "fix" add visual weight? Prefer the version that removed something.
