# Dek — Keyboard Shortcuts

## Global (any mode)

| Shortcut | Action |
|---|---|
| `Ctrl+E` | Toggle edit mode on/off |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |

---

## Present mode (not editing)

| Shortcut | Action |
|---|---|
| `→` / `↓` / `Space` / `PageDown` | Next slide |
| `←` / `↑` / `PageUp` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `Scroll wheel` | Navigate slides |
| `F` | Toggle fullscreen |
| `O` | Open slide overview |
| `P` / `S` | Open presenter view |

---

## Slide overview overlay

| Shortcut | Action |
|---|---|
| `→` / `↓` | Move focus right / down |
| `←` / `↑` | Move focus left / up |
| `Home` | Jump to first slide |
| `End` | Jump to last slide |
| `Enter` | Go to focused slide and close overview |
| `Escape` / `O` | Close overview |

---

## Presenter view overlay

| Shortcut | Action |
|---|---|
| `→` / `Space` | Next slide |
| `←` | Previous slide |
| `Escape` / `P` / `S` | Close presenter view |

---

## Edit mode — slide navigation

| Shortcut | Action |
|---|---|
| `→` / `↓` / `Space` / `PageDown` | Next slide |
| `←` / `↑` / `PageUp` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `PageDown` / `PageUp` | Next / previous slide (even while a field is focused) |
| `Delete` *(navigator focused, no element selected)* | Delete current slide |

---

## Edit mode — canvas elements

| Shortcut | Action |
|---|---|
| `V` | Switch to Select tool |
| `T` | Switch to Text tool |
| `Ctrl+C` | Copy selected element(s) |
| `Ctrl+V` | Paste element(s) |
| `Ctrl+D` | Duplicate selected element(s) |
| `Ctrl+]` | Bring selected element(s) forward |
| `Ctrl+[` | Send selected element(s) backward |
| `Delete` / `Backspace` | Delete selected element(s) |
| `Escape` | Blur focused field → deselect all → exit edit mode (in that order) |
| `Alt` *(while dragging)* | Disable snapping |

---

## Edit mode — text fields (EditableText / EditableTextList)

| Shortcut | Action |
|---|---|
| `Enter` *(single-line field)* | Confirm / move to next field |
| `Backspace` *(empty field)* | Delete the field / row |
| `Ctrl+Shift+8` | Toggle bullet list |
| `Escape` *(inside a canvas text box)* | Commit edit and deselect |
| `Enter` *(slide rename field in navigator)* | Confirm rename |

---

## Notes

- `Ctrl` and `Cmd` (macOS) are treated identically throughout.
- Canvas tool shortcuts (`V`, `T`) only fire when no text field is focused.
- Navigation arrows are suppressed while a text field is focused, except `PageDown`/`PageUp` which always navigate slides.
