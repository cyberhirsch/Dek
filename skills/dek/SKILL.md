---
name: dek
description: >
  Author and edit Dek presentation decks — a whole deck is one Markdown file
  (`deck.md`, or `<name>.dek/deck.md`) built from `---`-delimited YAML blocks:
  a config block, then one block per slide with a `layout:` and that layout's
  named fields. Use this whenever you are asked to write, restructure, translate,
  proofread, expand, split, or restyle slides for a deck or lecture whose source
  is a Markdown/YAML slide file, whenever you see a file containing
  `layout: cover` / `layout: text` / `layout: statement`, whenever the user says
  "deck.md", "Dek", "my slides", "the lecture deck", or asks to turn notes,
  an outline, a paper, or a transcript into slides — even if they never say the
  word "Dek". Also use it before hand-writing `elements:` for Dek's freeform
  canvas, or choosing fonts, colors, or capitalization for a Dek slide.
---

# Dek decks

A Dek deck is **one Markdown file**. There is no binary project, no database.
That is the whole point of the format: the same named fields are read and written
by the code path, the WYSIWYG editor, and by you. Edits you make drop straight
back into the app, and edits the app makes stay readable to you — as long as you
respect the schema.

Your job is almost always **content**: writing, tightening, restructuring, and
translating slides. Reach for the freeform canvas only when a named layout
genuinely can't express the idea.

## The file format

A deck is a stream of `---`-delimited YAML blocks:

- The **first block** is the deck config (title, theme, header/footer).
- **Every following block is one slide**: a `layout:` plus that layout's fields.

```markdown
---
deck: My Talk
ratio: "16:9"
paginate: true
header: My Talk · 2026
footer: "Press → or scroll"
theme:
  bg: "#070809"
  text: "#e6ecf2"
  accent: "#7fc7ff"
  accent2: "#ffb474"
  glow: true
  fontHeading: Cormorant Garamond
  fontBody: JetBrains Mono
---
layout: cover
title: My Talk
subtitle: A subtitle
byline: One Markdown file
---
layout: text
title: The Point
content: |
  - First point
  - Second point
  A plain paragraph (no leading dash).
---
```

The config block is optional — a file whose first block already declares a
`layout:` is treated as all slides.

## Where a deck lives: the bundle

**A deck is a folder, not a loose file.** It's one object you can move, copy, or
zip:

```
My Talk.dek/
  deck.md          the slides — always named deck.md inside a bundle
  Assets/          every image, video poster, and file the deck references
```

The name lives on the *folder*. That's deliberate: asset paths inside `deck.md`
are therefore just `Assets/photo.jpg`, with no deck name baked in, so renaming
the deck can't orphan its images.

**Creating a new deck means creating the bundle** — all three parts, even when
there are no images yet:

```bash
mkdir -p "Gaussian Splatting.dek/Assets"
# then write the slides to "Gaussian Splatting.dek/deck.md"
```

Writing a bare `my-deck.md` and stopping is the most common mistake. The user
opens a *folder* in Dek ("Open deck…"), and a loose `.md` with images beside it
can't be opened that way at all.

### Two other layouts you will meet

Recognise them, work with whatever you find, and **never convert one to another**
— rewriting the image paths breaks every picture in the deck.

| Shape | Looks like | Asset paths |
|---|---|---|
| **Bundle** (write new decks this way) | `My Talk.dek/deck.md` + `Assets/` | `Assets/pic.png` |
| **Legacy workspace** (several decks share a folder) | `My Talk.md` + `My Talk Assets/` | `/My Talk Assets/pic.png` |
| **Dev server** (inside the Dek repo) | `deck.md` at the root, or `decks/*.md` | `/deck Assets/pic.png` |

If you're editing an existing deck, match the convention already in the file.
If you're creating one from scratch, make a bundle.

## How Dek reads your file

You never run Dek. The file *is* the interface, so it helps to know exactly what
happens to what you write:

1. **Split.** The raw text is split on any line that is exactly `---` (trailing
   spaces allowed). No YAML has been parsed yet — this is a plain text split.
2. **Parse.** Each block is parsed as YAML. The first becomes the deck config
   unless it declares a `layout:`; the rest become slides, in order.
3. **Render.** Each slide is drawn by its layout, reading only that layout's
   fields. Everything else is kept in the file but never shown.
4. **Re-serialize.** When the app saves, it rewrites the whole file with
   `YAML.stringify`. Your comments and formatting do not survive; your *fields*
   do, including ones Dek doesn't know about.

Two consequences worth internalising. Your indentation and quoting style will be
normalised away, so don't fuss over them — but a **parse error breaks the entire
deck**, not one slide, because step 1 happens before step 2. And because step 3
reads only known fields, a misspelled field name doesn't error: it just silently
never appears.

If the editor is open on the file while you write it, Dek notices the change and
reloads the deck live. So your edit lands in front of the user immediately. Save
whole, valid files — never a half-written intermediate state.

### Traps that break a deck

These are the ways a well-meaning edit corrupts the file. None of them error at
the point you write them.

**A bare `---` inside a block scalar destroys the deck.** The split in step 1
doesn't know it's inside your `content:` or `code:`. The file then fails to parse
entirely — every slide is gone, not just this one.

````yaml
# BREAKS THE WHOLE FILE
content: |
  Before
  ---
  After

# safe — indented, so it isn't at line start
content: |
  Before
    ---
  After
````

This bites with Markdown horizontal rules and with Mermaid front-matter
(`---\ntitle: …\n---`). Indent it, or use `***` for a rule.

**Don't rewrite existing image paths.** A deck stores them one of two ways —
`Assets/pic.png` in a bundle, `/My Talk Assets/pic.png` in the older layout.
Both are correct in their own deck. "Normalising" them breaks every image.

**Only `<u>` survives as inline HTML.** Everything else is escaped and shows as
literal text — `<b>bold</b>` renders as `<b>bold</b>`. Use `**bold**`. Links are
restricted to `http(s):` and `mailto:`; anything else is neutralised.

**Quote strings YAML would eat.** Anything containing `: `, starting with `#`,
and every ratio: `"16:9"`, `"9:16"`. Film and paper titles hit the `: ` case
constantly.

### Rules that keep the round-trip lossless

The parser preserves what it doesn't understand, and the editor relies on that.
Break these and you silently destroy the user's work:

- **Never delete a field you don't recognise.** Unknown keys round-trip verbatim.
- **Never touch `stash:`.** It holds fields the *current* layout doesn't render,
  parked there so switching layouts is reversible. It is not dead content.
- **Keep `elements:` intact** unless you're deliberately editing the canvas.
- **Every slide needs a `layout:`.** A block without one is treated as `freeform`.
- Use a block scalar (`content: |`) for multi-line text. Don't fold it onto one line.

A field name the layout doesn't render is *dropped from the render* but kept in
the file — so a typo like `titel:` fails silently. Check field names against the
layout before writing. (The app surfaces these as warnings; you should not create
them in the first place.)

### Check your work before you finish

You can't see the rendered slide, so verify what you can:

- Every block has a `layout:`, and it's one of the twelve.
- Every field you wrote appears in that layout's table in
  [references/layouts.md](references/layouts.md).
- No bare `---` inside any block scalar.
- No ALL CAPS headings.
- Image paths are unchanged, or point at files that exist.
- A new deck is a **bundle**: `<Name>.dek/deck.md` plus an `Assets/` folder.
- The YAML parses. If you have a shell, this is worth the ten seconds:

  ```bash
  python3 -c "import sys,yaml; [yaml.safe_load(b) for b in sys.stdin.read().split('\n---\n')]" < deck.md
  ```

  Inside the Dek repo itself, `npx vitest run` covers the parser and the schema
  validator, and `analyzeDeck()` reports exactly the warnings a user would see.

## The twelve layouts

Pick the layout that matches the *idea*, not the one that's easiest to fill.
Full field lists, defaults, and examples: **[references/layouts.md](references/layouts.md)**.

| Layout | For | Key fields |
|---|---|---|
| `cover` | Title slide | `title`, `subtitle`, `byline` |
| `section` | Divider between parts | `title` |
| `statement` | One bold line, a quote, a definition | `text`, `cite` |
| `speaker` | Bio / portraits | `name`, `role`, `portraits[]` |
| `text` | Heading + body | `title`, `content` |
| `text-image` | Body beside a picture | `title`, `content`, `image`, `side` |
| `image-full` | Full-bleed image | `image`, `title`, `caption` |
| `image-caption` | Framed image + credit | `image`, `caption`, `captionPos` |
| `video-embed` | YouTube / Vimeo / file | `video`, `poster`, `caption` |
| `gallery` | Image grid, comparisons | `title`, `items[]`, `columns` |
| `diagram` | Mermaid chart | `title`, `code` |
| `freeform` | Blank canvas | `elements[]` |

Every slide also accepts `notes:` (speaker notes) and `group:` (a sidebar
section — consecutive slides sharing a `group` string form one run).

### Writing `content`

`content` is Markdown. A line starting with `- ` (or `* `) is a bullet; any other
non-empty line is a paragraph. Blank lines only separate — they don't create
spacing. Inline: `**bold**`, `*italic*`, `` `code` ``, `<u>underline</u>`,
`~~strike~~`, `[text](url)`.

```yaml
content: |
  - A bullet
  - Another bullet

  A paragraph between bullet groups.
```

Add `steps: true` to a `text` or `text-image` slide to reveal its rows one at a
time while presenting.

### Images

In a bundle, image fields hold a path relative to `deck.md`: `Assets/photo.jpg`,
pointing at a real file in the bundle's `Assets/` folder.

**Never invent an image path.** A reference to a file that doesn't exist renders
as a hole in a live presentation. If you don't have the picture, leave the field
empty, choose a layout that doesn't need one, and tell the user what's missing.

## How to work on a deck

1. **Read the whole file first.** Slide boundaries, `group:` runs, and running
   header/footer are context you need before you touch one slide.
2. **Match the register.** Read three or four existing slides and write like
   them — same language, same density, same voice. A lecture deck in German
   stays in German.
3. **One idea per slide.** If a slide grows past ~6 bullets or ~40 words of body,
   it wants to be two slides. Splitting is usually the right edit; shrinking the
   font is not.
4. **Prefer the smallest edit.** Rewriting a slide's `content` is cheap and
   reviewable. Converting it to `freeform` is nearly irreversible in practice.
5. **Say what you changed.** Slides are performed in front of people; the user
   needs to know which ones moved.

## Design language

The look is **editorial calm**: near-black ground, a light italic serif
(Cormorant Garamond) against a technical monospace (JetBrains Mono), generous
space, one disciplined accent. Full rationale, the type scale, and the color
system: **[references/design.md](references/design.md)**.

The one hard rule, because it's the easiest to get wrong and the most damaging:

> **Never set headings or text in ALL CAPS.** Title Case for headings, sentence
> case for body. Acronyms keep their natural form (PDF, API, LLM).

The heading face is a light italic serif whose appeal is the modulation between
thick and thin strokes. All caps flattens that into uniform rectangles, kills the
italic's movement, and reads as shouting on an otherwise hushed layout. Write
`The Basics`, not `THE BASICS`. (Some older decks and even `template.md` still
contain all-caps headings — they are wrong, not precedent. Fix them when you
touch them.)

Two fonts, never a third. One accent doing the work; if two colors are competing
on a slide, you've overused the second.

## The freeform canvas

Any slide may carry an `elements[]` array of free-positioned objects in
**1280×720 stage pixels**, top-left origin. A `box` is the one primitive behind
shapes, text boxes, and images.

Hand-authoring elements is fiddly and easy to get subtly wrong (heading boxes
must be italic and light, never bold; text insets are compensated by the
renderer). Read **[references/canvas.md](references/canvas.md)** before writing
any `elements:` block.

Prefer a named layout. The moment a semantic slide is edited freely in the app it
"bakes" to `freeform` and stops being editable as structured fields — so a
freeform slide you author is a slide the user can no longer restyle by changing a
layout. That's a real cost. Spend it deliberately.
