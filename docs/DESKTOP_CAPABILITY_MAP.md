# Grok Build to gorkX desktop capability map

This is the regression checklist for the bundled Grok Build ACP command
catalogue. gorkX is desktop-first: an everyday capability must have a visible
control; `/` remains an expert compatibility shortcut, not the primary path.

| Grok Build capability | Desktop entry | Boundary |
|---|---|---|
| `login`, `logout` | Settings: Account | Browser OAuth/device sign-in is initiated from the app; the ordinary flow never asks a user to type a CLI command. |
| `models` | Settings: Models & providers; composer model selector | App-owned provider configuration and live ACP model selection; web subscriptions are never represented as API credentials. |
| `sessions list/search/delete` | Other sessions panel; local task search | Kernel history is searched/restored through its bounded CLI adapter; gorkX-owned task search stays local and separate. |
| `export` | Add menu: Export transcript | Native Markdown save picker with clipboard fallback. |
| `inspect` | Add menu: Project inspection | Read-only normalized project configuration view. |
| `worktree list/show/rm/gc` | Worktrees panel | Creation and task association use the live kernel ACP path; removal and GC remain explicit user actions. |
| `compact`, `context`, `session-info` | Add menu: Compact; Task info panel | Reads live ACP state; no model prompt needed for task info. |
| `trace --local` | Add menu: Export diagnostic archive | User sees a privacy notice and picks a `.tar.gz` location; gorkX permits only local archive creation and never exposes trace upload. |
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
| `dashboard`; TUI navigation, pager rendering, terminal mouse and visual preferences | Not mirrored | Terminal-local presentation controls, not ACP desktop-agent features. gorkX projects the engine's task/workflow state into its own UI instead. |
| `completions`, `wrap` | Terminal dock | Shell completion generation and OSC 52 clipboard forwarding are terminal-host features, not a desktop-agent workflow. |
| `agent`, `leader` | ACP bridge (internal) | gorkX starts and supervises its own `grok agent stdio` transport; it does not expose a second shared-server lifecycle to ordinary users. |
| `setup` managed configuration | Not exposed | It downloads and installs remote managed configuration. gorkX preserves an App-owned `GROK_HOME` and does not silently replace it. |
| `update` | Settings: Update (gorkX release) | The bundled Grok Build binary is source-locked to a gorkX release. Users upgrade the app, not an independently mutable kernel. |

When upgrading the bundled engine, compare its `BUILTIN_COMMANDS`, prompt
commands and ACP extensions against this table. A new normal-user capability
must either receive a desktop workflow or be recorded as an honest engine/TUI
limitation in `FEATURES.md`.
