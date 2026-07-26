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
| Native subagents | Persisted tree from lifecycle updates; `_x.ai/subagent/list_running` reconciliation after reconnect; get/cancel controls | 🟡 kernel decides delegation and isolation; isolated ACP gate confirms the three control routes, but a real delegated coding task remains a release acceptance scenario |
| Compact | Native ACP compact button plus automatic threshold handling | 🟡 engine decides compaction availability |
| Slash + skills | Live advertised commands first, local desktop commands second | ✅ |
| Export | Toolbar / `+` menu file save; `/export` remains keyboard compatibility | ✅ |
| Fork | Toolbar calls `_x.ai/session/fork`, creates a durable child task, then loads it while preserving the original task | ✅ isolated ACP gate verifies child load and unchanged parent |
| Rewind | Desktop lists `_x.ai/rewind/points`, makes the user choose a checkpoint and scope, then performs a non-mutating `force: false` preview. It commits with `force: true` only after the existing explicit restore confirmation; conflicts are listed and require a second acknowledgement before a force commit. | ✅ package `0.2.112 (47348d1)` was verified with two real prompts, preview, commit and task reload in an isolated authenticated session; real file-conflict UX remains a release acceptance scenario |
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
| MCP / Skills / Plugins | Discover and manage through App `GROK_HOME`; add remote HTTPS HTTP/SSE MCP from a native form | ✅ engine capability governs individual entries; headers, secrets and arbitrary local commands remain advanced configuration |
| Hooks | Active-task settings loads discovered hooks; explicit reload, trust/untrust and enable/disable controls | 🟡 `_x.ai/hooks/list` and reload are ACP-gated; authored hook files and a real configured-hook run remain acceptance scenarios |
| Memory | Browse, search, remember, forget, local compact and per-project injection | ✅ |

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
| Computer automation | — | ❌ no background capture or mouse/keyboard control is shipped. The bundled Grok Build binary exposes terminal-TUI mouse reporting, not an ACP macOS-computer-control route; gorkX therefore keeps only the explicit screenshot picker. |

## Evidence gates

```bash
cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle
cd apps/desktop/src-tauri && cargo test && cargo check

# Independent kernel and app-only bundle
scripts/verify-grok-kernel-source.sh
scripts/verify-grok-kernel-patches.sh
scripts/verify-macos-app-bundle.sh "apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app"
```

Updated: 2026-07-26
