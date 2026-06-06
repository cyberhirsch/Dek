# Dek — Documentation

Dek runs in **two forms** from the same codebase. They share the format, layouts,
editor, presenter, and export — they differ only in **where slides are stored**.

| | Local (dev) | Hosted (static) |
|---|---|---|
| **How** | `npm run dev` | GitHub Pages |
| **URL** | http://localhost:5173 | https://cyberhirsch.github.io/Dek/ |
| **Server** | Yes — Vite dev middleware | None (static files) |
| **Default deck** | `deck.md` (your real file) | example deck (seeded in-browser) |
| **Storage backend** | dev server → real files | browser/IndexedDB + File System Access |
| **Images** | `public/Assets/` served at `/Assets/…` | inline (browser) or from an opened folder |
| **Best for** | authoring the master M7 deck, fast iteration | presenting anywhere, light edits, sharing |

- **[local-version.md](./local-version.md)** — the dev-server version (real files on disk).
- **[hosted-version.md](./hosted-version.md)** — the static, server-less version.
- **[storage.md](./storage.md)** — how the storage backends are chosen and behave.

The single thing to understand: **a server-less web page can't freely read/write your
filesystem.** So the local version uses a tiny Node server to touch files directly, while
the hosted version relies on the browser — IndexedDB for its own working copy, and the
**File System Access API** for real local files (Open folder / Save As).

See also, at the repo root: [`BRIEFING.md`](../BRIEFING.md) (vision + design),
[`FEATURES.md`](../FEATURES.md), and [`template.md`](../template.md) (the layout library).
