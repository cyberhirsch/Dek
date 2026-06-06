# Storage architecture

Both versions share one **storage facade** (`src/api.ts`) over pluggable backends
(`src/storage/`). UI code never talks to a backend directly — it calls `fetchDeck`,
`saveSlide`, `saveDeck`, `uploadImage`, `openDeck`, `newDeck`, `openLocalFile`,
`openLocalFolder`, `saveLocalFolderAs`, `listDecks`.

## Backends

| Backend | File | Used when | Persists to |
|---|---|---|---|
| **server** | `storage/server.ts` | dev server is reachable | real files via the Vite API |
| **browser** | `storage/browser.ts` | static/hosted (no server) | IndexedDB (`idb.ts`) |
| **fs (file)** | `storage/fs.ts` | user runs *Open file…* | one picked `.md` (File System Access) |
| **fs (dir)** | `storage/fsdir.ts` | user runs *Open folder… / Save As…* | a picked folder: `.md` + `<deck> Assets/` |

## How the active backend is chosen
1. On first use the facade probes `GET /api/decks`. If it returns JSON, the **server**
   backend is selected; otherwise the **browser** backend. This is the *base* backend.
2. Running **Open file/folder** or **Save As** installs an **override** backend (File
   System Access) bound to that file/folder. Switching decks or **New deck** clears the
   override and returns to the base backend.

So: dev → server base; hosted → browser base; and File System Access can take over on top
of either when the user opens/saves a real file or folder.

## Images
- **server:** files in `public/Assets/`, referenced as `/Assets/…`.
- **browser:** inlined as `data:` URLs inside the deck (self-contained).
- **fs dir:** read from `<deck> Assets/` (or `Assets/` / `public/Assets/`) as object URLs
  for display; on save, object URLs are restored to clean `/<deck> Assets/…` paths so the
  saved `.md` stays readable. Uploads are written into the deck's own `Assets` folder.

## The deck format (shared)
One Markdown file = a stream of `---`-delimited YAML blocks: the first block is the deck
config (theme/header/…), each following block is a slide (`layout:` + that layout's named
fields). Parser/serializer: `src/core/deck.ts`; schema: `src/core/types.ts`; a live example
of every layout: [`../template.md`](../template.md).

Because it's plain Markdown with named fields, any LLM can read and rewrite a deck directly
— that's the third "editing path" alongside code and the WYSIWYG editor.
