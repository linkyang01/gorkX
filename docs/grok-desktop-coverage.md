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
| Rename | Sidebar task rename | ✅ |
| Archive / delete | App archive; confirmed ACP session delete + local-index removal | ✅ |
| Model / effort | Subscription and custom-model picker; effort is applied at engine spawn | ✅ |
| Permission modes | Default / Auto / Full chooser + permission cards | ✅ |
| Plan mode | ACP mode, Review plan and execute/retry controls | 🟡 engine plan quality decides the result |
| Compact | `/compact` pass-through and context status | 🟡 engine decides compaction availability |
| Slash + skills | Live advertised commands first, local desktop commands second | ✅ |
| Export | Toolbar file save and `/export` clipboard route via restricted CLI bridge | ✅ |
| Fork | Toolbar sends `/fork` to the active engine session | 🟡 gorkX does not yet prove and index a separate visible child task |
| Rewind | `/rewind` is passed to the engine | 🟡 no independent desktop rewind history is maintained |
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
| MCP / Skills / Plugins | Discover and manage through App `GROK_HOME` | ✅ engine capability governs individual entries |
| Hooks | No inactive controls | ❌ locked Grok Build returns ACP `Method not found` |
| Memory | Browse, search, remember, forget, local compact and per-project injection | ✅ |

## Account and independent kernel

| Surface | Desktop control | Status |
|---|---|---|
| Login / logout | Browser login, App-owned `auth.json`, explicit sign-out | ✅ |
| Quota | Account chip/menu with foreground and interval refresh | 🟡 upstream availability and quota format govern precision |
| Kernel resolve | Resources → App runtime → App GROK_HOME bin; system PATH only through explicit debug escape hatch | ✅ |
| Kernel governance | Locked source revision, ordered patch queue, isolated ACP and macOS bundle gates | ✅ |
| App update | Release check/download flow exists | 🟡 no release is implied until one is explicitly published |

## Environment

| Surface | Desktop control | Status |
|---|---|---|
| Chrome / Playwright MCP | Configure and diagnose version-pinned isolated MCP; optional origin allowlist | ✅ browser actions still depend on Chrome and the engine MCP runtime |
| Screenshot attach | Explicit macOS region picker → local PNG attachment | ✅ |
| Computer automation | — | ❌ no background capture or mouse/keyboard control is shipped |

## Evidence gates

```bash
cd apps/desktop && npx tsc --noEmit && npm run verify:web-bundle
cd apps/desktop/src-tauri && cargo test && cargo check

# Independent kernel and app-only bundle
scripts/verify-grok-kernel-source.sh
scripts/verify-grok-kernel-patches.sh
scripts/verify-macos-app-bundle.sh "apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app"
```

Updated: 2026-07-21
