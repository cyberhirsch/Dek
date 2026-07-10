# Dek agent skills

The `dek/` skill teaches a coding agent to author and edit Dek decks: the
`---`-delimited YAML slide format, the twelve layouts and their fields, the
freeform canvas element model, and the design language.

It follows the open **Agent Skills** convention — a `SKILL.md` with `name` and
`description` frontmatter, plus a `references/` folder the agent reads on demand.
The same directory installs unchanged in Claude Code, Antigravity, and Codex.

```
skills/dek/
  SKILL.md              # the skill: format, layouts, workflow, cardinal rules
  references/
    layouts.md          # every layout, every field, with examples
    canvas.md           # the freeform element model
    design.md           # typography, color, spacing, restraint
```

## Install

Copy (or symlink) `skills/dek/` into the skills directory your agent reads. Use
the **project** path to scope it to one repo, or the **global** path to have it
everywhere.

| Agent | Project scope | Global scope |
|---|---|---|
| **Claude Code** | `<project>/.claude/skills/dek/` | `~/.claude/skills/dek/` |
| **Antigravity** | `<project>/.agents/skills/dek/` | `~/.gemini/config/skills/dek/` |
| **Codex** | `<project>/.codex/skills/dek/` | `~/.codex/skills/dek/` |

### macOS / Linux

```bash
# pick one target
mkdir -p ~/.claude/skills          # Claude Code
mkdir -p ~/.gemini/config/skills   # Antigravity
mkdir -p ~/.codex/skills           # Codex

cp -r skills/dek ~/.claude/skills/
```

A symlink keeps it in sync with the repo:

```bash
ln -s "$(pwd)/skills/dek" ~/.claude/skills/dek
```

### Windows (PowerShell)

```powershell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse skills\dek "$HOME\.claude\skills\"
```

Restart the agent if it doesn't pick the skill up — most versions detect new
skills automatically.

## Using it

The skill triggers on its own when you're working on a deck: ask your agent to
"turn these lecture notes into slides", "split slide 12, it's overflowing", or
"translate the deck into English", and it will consult the skill before writing
any `layout:` blocks. You can also name it explicitly.

Because a Dek deck is one plain Markdown file, an agent needs nothing else — no
plugin, no API, no export step. It reads `deck.md`, edits the fields, and the
running editor picks the change up.

## Keeping it accurate

The skill restates a schema that lives in code. When the format changes, these
stay in sync:

- `src/core/types.ts` — the layout and element schema
- `template.md` — one filled-in slide per layout (the contract)
- `src/tokens/` — the design numbers

If you add a layout or a field, update `references/layouts.md` alongside it.
