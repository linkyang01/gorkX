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
| `worktree list/show/rm/gc/db` | Worktrees panel | Creation and task association use the live kernel ACP path; removal and GC remain explicit user actions. A collapsed Maintenance area shows local index status/location and asks for confirmation before rebuilding the index from a filesystem scan. |
| `compact`, `context`, `session-info` | Add menu: Compact; Task info panel | Reads live ACP state; no model prompt needed for task info. |
| `trace --local`; remote `trace` upload | Add menu: Export diagnostic archive; Send diagnostics to Grok support | Local export uses a native `.tar.gz` save picker. Remote upload is a distinct action: it names the diagnostic-data boundary and requires immediate confirmation before the exact `trace <session> --json` call. Neither path uploads automatically or exposes arbitrary flags. |
| `always-approve` | Composer permission selector | Explicit user-controlled task permission mode. |
| `flush`, `dream`, `memory` | Memory panel | Local Hermes data plus kernel actions where advertised. |
| `hooks-*` | Settings: Hooks & project instructions | Native file/folder picker; the engine validates paths and executes Hooks. |
| `plugins`, `reload-plugins`, `plugin details/validate`, `plugin marketplace add/remove/update` | Extensions: Plugins and Marketplace | Install, enable/disable, update one/all and uninstall controls; each installed plugin exposes its kernel component inventory and local-folder manifest validation. Marketplace adds trusted Git/GitHub/local sources, refreshes them, and requires a destructive-action warning before removing a source and its plugins. |
| `feedback` | Add menu: Send feedback | Shown only when the live command catalogue advertises it. |
| `deep-research` | Add menu: Deep research | Plain-language brief; kernel owns parallel research and citations. |
| `workflow` and saved workflows | Add menu: Workflows; in-chat workflow cards | Launch and permitted pause/resume are live-session gated. |
| `goal` | Add menu: Set goal; goal banner | Agent owns the goal loop; app owns presentation and persistence. |
| `loop` / scheduler notifications | Add menu: Repeat with Grok; live schedule cards | Kernel schedules are distinct from gorkX local jobs. |
| `mcp add` (remote HTTPS or local stdio), auth, setup, enable/disable and tool enable/disable | Extensions: MCP | Remote setup uses a name + HTTPS URL + HTTP/SSE; local setup uses a system executable picker plus one argument per line. Both are scoped to all projects or the selected project and require explicit confirmation. Every live control is scoped to the active ACP task and OAuth stays in the provider browser flow. URL credentials and headers remain advanced configuration rather than everyday fields. |
| `dashboard`; TUI navigation, pager rendering, terminal mouse and visual preferences | gorkX task list, process panel, workflow cards and native desktop layout | gorkX renders the equivalent task/subagent/workflow state itself. TUI pager, mouse and terminal visual preferences remain terminal-local and are not misrepresented as desktop-agent controls. |
| `completions`, `wrap` | Not mirrored | Shell completion generation and OSC 52 forwarding solve external-terminal limitations; gorkX already has a native terminal dock and system clipboard. It does not pretend an arbitrary wrapped remote shell is an agent workflow. |
| `agent`, `leader` | ACP bridge (internal) | gorkX starts and supervises its own `grok agent stdio` transport; it does not expose a second shared-server lifecycle to ordinary users. |
| `setup` managed configuration | Settings: Environment → Managed configuration | gorkX first fetches read-only `setup --json`; only a successful current preview enables the installing form. The user sees a second confirmation, then gorkX invokes only exact `setup` in the App-owned `GROK_HOME` and asks them to reconnect tasks. |
| `update` | Settings: Update (gorkX release) | The bundled Grok Build binary is source-locked to a gorkX release. Users upgrade the app, not an independently mutable kernel. |

When upgrading the bundled engine, compare its `BUILTIN_COMMANDS`, prompt
commands and ACP extensions against this table. A new normal-user capability
must either receive a desktop workflow or be recorded as an honest engine/TUI
limitation in `FEATURES.md`.
