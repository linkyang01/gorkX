# Grok Build → gorkX desktop coverage

Living checklist for product and PR review. Runtime and kernel governance follow
[`INDEPENDENT_APP_PLAN.md`](./INDEPENDENT_APP_PLAN.md); detailed real/half
boundaries follow [`FEATURES.md`](./FEATURES.md).

Legend: ✅ real end-to-end · 🟡 wired with a stated engine/product limit · ❌ not shipped

## Session & chat

| Surface | Desktop control | Status |
|---|---|---|
| New session | New task → ACP `session/new` + App index | ✅ |
| Resume / search | App task restore; isolated Kernel Sessions search for recovery | ✅ |
| Rename | Sidebar task rename; a live task also calls native `x.ai/session/rename` so Grok recovery/search stays aligned, while the App title persists as an offline fallback | ✅ |
| Archive / delete | App archive; confirmed ACP session delete + local-index removal | ✅ |
| Model / effort | Subscription and custom-model picker; effort is applied at engine spawn | ✅ |
| Permission modes | Default / Auto / Full chooser + permission cards | ✅ |
| Plan mode | ACP mode, Review plan and execute/retry controls | 🟡 engine plan quality decides the result |
| Native subagents | Persisted tree; `+ → Delegate a subtask`; list_running + get on reconnect; Inspect/Stop; new task → **Use one agent only** | 🟡 ACP-level read-only worktree spawn→completed/cancel recorded; Inspect recognizes `completed`/`cancelled`/`failed`. App click-through and quit/reopen human acceptance remain |
| Compact | Native ACP compact button plus automatic threshold handling | 🟡 engine decides compaction availability |
| Current-task usage | Task information panel → native session usage read | 🟡 aggregate tokens and cost appear only when the active Grok Build session supplies them; no cost is inferred from subscription quota or local daily counters |
| Coding-data privacy | Task information → native privacy setting | ✅ cached OAuth state and confirmed `x.ai/privacy/setCodingDataRetention`; API-key and team-managed states remain unavailable rather than guessed |
| Quick start | Settings → General → Quick start; native walkthrough of visible desktop controls | ✅ does not depend on a slash command or create an engine task |
| Image editing | With an image staged in the composer: `+` → Edit attached image → plain-language edit form; optional model override in Settings → Models → Media tools | 🟡 Grok Build exposes `image_edit` as an engine tool, not a stable ACP slash route. gorkX keeps the image attached and sends the explicit edit intent; the kernel selects an available tool and model. The override writes the documented App `GROK_HOME` feature setting but never claims a model is available. |
| Slash + skills | Live advertised commands first, local desktop commands second | ✅ |
| Prompt history / next-step suggestion | `+ → Recent prompts`; Composer → `Suggest next step` | 🟡 prompt history is a native read route; next-step prediction is a user-triggered native model call and may be unavailable when the account catalog does not expose a suggestion model |
| Native prompt queue | Running-task composer → queue; inline queue card → edit / remove / move / clear / send now | 🟡 Grok Build owns the authoritative multi-item queue via `x.ai/queue/changed` and queue edit notifications; the desktop does not invent queue state. Real queued model turns remain account/model dependent and use quota. |
| Portable task bundle | `+ → Export portable task package` / `Import task package` | 🟡 native metadata/transcript export and restore through `session/state`, paginated `session/updates` and `session/import`; bounded, privacy-confirmed and project-picker gated; authenticated cross-device acceptance remains a release test |
| Export | Toolbar / `+` menu file save; `/export` remains keyboard compatibility | ✅ |
| Fork | Toolbar calls `_x.ai/session/fork`, creates a durable child task, then loads it while preserving the original task | ✅ isolated ACP gate verifies child load and unchanged parent |
| Rewind / undo | Desktop lists `_x.ai/rewind/points`, makes the user choose a checkpoint and scope, then performs a non-mutating `force: false` preview. `+ → Undo last turn` and `/undo` enter the same flow; it commits with `force: true` only after explicit restore confirmation, and conflicts require a second acknowledgement. | ✅ package `0.2.116 (dd04f39)` passed the route compatibility probes; a fresh authenticated two-prompt preview/commit/reload run is still a release acceptance scenario |
| Goal | Persistent goal console wired to `/goal`, plan and `update_goal` updates | ✅ shell; loop quality is engine-side |

## Worktree & review

| Surface | Desktop control | Status |
|---|---|---|
| Create / use worktree | Project menu and new task in selected worktree | ✅ |
| List / remove / GC | Worktree panel via restricted CLI bridge | ✅ |
| Diff / plan / tools | Review panel, stage/unstage and safe project-contained previews | ✅ |
| Inspect | Project action via `grok inspect --json` | ✅ |

## Extensions and memory

| Surface | Desktop control | Status |
|---|---|---|
| MCP / Skills / Plugins | Discover and manage through App `GROK_HOME`; add remote HTTPS HTTP/SSE MCP from a native form; refresh the live task inventory | ✅ engine capability governs individual entries. The desktop can re-read the current inventory, while configuration changes that need a process reload ask the user to reconnect rather than pretending a hidden hot-refresh ACP route exists. Headers, secrets and arbitrary local commands remain advanced configuration |
| Hooks | Active-task settings loads discovered hooks; guided project Hook creation; explicit reload, trust/untrust and enable/disable controls | 🟡 the builder now writes a native project `.grok/hooks/*.json` definition and `_x.ai/hooks/list`/reload are ACP-gated; a real configured-hook run remains an acceptance scenario |
| Memory | Browse, search, remember, forget, local compact and per-project injection; start a private one-off task without memory | ✅ |

## Account and independent kernel

| Surface | Desktop control | Status |
|---|---|---|
| Login / logout | Browser login, App-owned `auth.json`, explicit sign-out | ✅ |
| Quota | Account chip/menu with foreground and interval refresh; unavailable status routes to Settings → Account | 🟡 upstream availability and quota format govern precision; the desktop surface does not expose CLI recovery instructions |
| Kernel resolve | Resources → App runtime → App GROK_HOME bin; system PATH only through explicit debug escape hatch | ✅ |
| Kernel governance | Locked source revision, ordered patch queue, isolated ACP and macOS bundle gates | ✅ |
| App update | Release check/download flow exists | 🟡 no release is implied until one is explicitly published |

## Environment

| Surface | Desktop control | Status |
|---|---|---|
| Chrome / Playwright MCP | Configure and diagnose version-pinned isolated MCP; optional origin allowlist | ✅ browser actions still depend on Chrome and the engine MCP runtime |
| Source preview | Explicit HTTP(S) link opens in a separate native gorkX reading window | ✅ validates the URL and has no gorkX credential bridge; it is separate from the Agent's MCP Chrome profile |
| Screenshot attach | Explicit macOS region picker → local PNG attachment | ✅ |
| Computer Hub workspace | Settings → Screen capture → Computer Hub workspace | 🟡 fixed `workspace status/start/pause/resume/stop` actions are wired to the bundled Grok Build binary, require confirmation, and are still server/account-gated; exposing a project can make its content available to the remote service. |
| Computer automation | Settings → Computer → foreground controls + “Connect Agent Computer tools” | 🟡 app-owned MCP bridge (status/screenshot/click/key/type/stop) after registration, Accessibility and enable lease; emergency stop clears lease. Not native Computer ACP. Hub remains separate server-gated workspace. |

## Scheduling

| Surface | Desktop control | Status |
|---|---|---|
| Local arrangement update | Scheduled tasks → Edit → Save changes | ✅ updates the existing persisted job in place, retaining ID and execution record; the next run is recalculated only from the updated rule |

## Evidence gates

```bash
cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle
cd apps/desktop/src-tauri && cargo test && cargo check

# Independent kernel and app-only bundle
scripts/verify-grok-kernel-source.sh
scripts/verify-grok-kernel-patches.sh
scripts/verify-macos-app-bundle.sh "apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app"
```

Updated: 2026-08-01 — see also `DESKTOP_ALIGNMENT_PLAN.md` (slash picks open desktop controls)
