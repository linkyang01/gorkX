# Grok Build to gorkX desktop capability map

This is the regression checklist for the bundled Grok Build ACP command
catalogue. gorkX is desktop-first: an everyday capability must have a visible
control; `/` remains an expert compatibility shortcut, not the primary path.

| Grok Build capability | Desktop entry | Boundary |
|---|---|---|
| `compact`, `context`, `session-info` | Add menu: Compact; Task info panel | Reads live ACP state; no model prompt needed for task info. |
| `always-approve` | Composer permission selector | Explicit user-controlled task permission mode. |
| `flush`, `dream`, `memory` | Memory panel | Local Hermes data plus kernel actions where advertised. |
| `hooks-*` | Settings: Hooks & project instructions | Native file/folder picker; the engine validates paths and executes Hooks. |
| `plugins`, `reload-plugins` | Extensions: Plugins | Install, enable/disable, update one/all and uninstall controls. |
| `feedback` | Add menu: Send feedback | Shown only when the live command catalogue advertises it. |
| `deep-research` | Add menu: Deep research | Plain-language brief; kernel owns parallel research and citations. |
| `workflow` and saved workflows | Add menu: Workflows; in-chat workflow cards | Launch and permitted pause/resume are live-session gated. |
| `goal` | Add menu: Set goal; goal banner | Agent owns the goal loop; app owns presentation and persistence. |
| `loop` / scheduler notifications | Add menu: Repeat with Grok; live schedule cards | Kernel schedules are distinct from gorkX local jobs. |
| MCP auth, setup, enable/disable and tool enable/disable | Extensions: MCP | Every live control is scoped to the active ACP task; OAuth stays in the provider browser flow. |
| TUI navigation, pager rendering, terminal mouse and visual preferences | Not mirrored | Terminal-local presentation controls, not ACP desktop-agent features. |

When upgrading the bundled engine, compare its `BUILTIN_COMMANDS`, prompt
commands and ACP extensions against this table. A new normal-user capability
must either receive a desktop workflow or be recorded as an honest engine/TUI
limitation in `FEATURES.md`.
