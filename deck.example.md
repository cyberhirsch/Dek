---
deck: Dek — Example
ratio: "16:9"
paginate: true
header: "Dek · example deck"
footer: "Edit me — or hand this .md to an LLM"
theme:
  bg: "#070809"
  text: "#e6ecf2"
  accent: "#7fc7ff"
  accent2: "#ffb474"
  glow: true
  fontHeading: "Cormorant Garamond"
  fontBody: "JetBrains Mono"
---
layout: cover
title: Dek
subtitle: A minimal presentation editor
byline: "Edit in code · hand the .md to an LLM · or WYSIWYG in the browser"
---
layout: section
title: HELLO
---
layout: statement
text: >
  One Markdown file is the source of truth. Edit it three interchangeable ways —
  and it always round-trips cleanly.
---
layout: bullets
title: TRY IT
items:
  - "Press **Ctrl+E** (or the ✎ button) to open the editor"
  - Click any text on the slide to edit it in place
  - Reorder and group slides in the sidebar, Keynote-style
  - Drop an image onto a frame to upload it
---
layout: bullets-image
title: LAYOUTS
side: right
image: ""
items:
  - "cover · section · statement · speaker"
  - "bullets · bullets-image"
  - "image-full · image-caption · video-embed"
  - "gallery · diagram · freeform"
---
layout: bullets
title: SAVE TO LOCAL FILES
items:
  - "**Open file…** and **Save As…** use the browser's File System Access API"
  - "Works in Chrome & Edge out of the box"
  - "**Brave:** open `brave://flags`, search **File System Access API**, set it to **Enabled**, then relaunch"
  - "Then edits autosave straight back to your `.md` file"
---
layout: video-embed
video: https://www.youtube.com/watch?v=qyZy-6VuSy4
poster: ""
caption: "video-embed — click to play (YouTube / Vimeo / .mp4)"
