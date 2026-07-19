# gorkX feature matrix

See **`docs/MASTER_PLAN.md`** and **`docs/INDEPENDENT_APP_PLAN.md`**.

**Rule:** no fake product surfaces. Real = works end-to-end. Half = wired to engine/local with limits. Planned = not shipped.

| Area | Feature | Status |
|------|---------|--------|
| Layout | Codex three-pane + collapsible sidebar | **Real** |
| Layout | Review / Terminal / Process | **Real** |
| Kernel | ACP stdio, App `GROK_HOME`, bundled engine path | **Real** |
| Chat | Stream, tools, permissions, attachments, / @ | **Real** |
| Projects / Tasks | Create, archive, delete, SQLite index | **Real** |
| Scheduled | Local jobs; fires while app open | **Real** (app must be running) |
| Terminal | PTY dock | **Real** |
| Extensions | Skills / MCP / plugins via engine CLI | **Real** (depends on engine) |
| Memory (Hermes) | Default on; USER/AGENT/project files; inject on first prompt; auto-learn dumps; Remember / Forget / keyword search / local compact | **Real (v0.4+)** — kernel `/flush`/`/dream` still optional extras |
| Auth / quota | Browser device login; stay signed in; silent refresh; membership + avatar | **Real (v0.4.1+)** |
| App update | Settings check + download DMG; launch banner | **Real (v0.4.2)** — drag into Applications to replace |
| Onboarding | First-run checklist: engine · login · project | **Real (v0.4.3)** |
| Plan mode | setMode + review steps + execute / retry after fail; clean agent state on success | **Half→improved** — engine plan quality still varies |
| Worktree | create / list / use / new task / Finder / **back to main repo** | **Half→improved** |
| Voice input | Web Speech + mic preflight | **Half** — may fail in WKWebView |
| Review Diff | Git porcelain + file diff; **non-git workspace file list** | **Half→improved** — no line diffs without git |
| Multi-provider models | Settings → config.toml; connection probe; **set default**; custom models in picker | **Half→improved** — routing still depends on engine |
| Sidebar | Task title filter across projects / inbox | **Real** |
| + menu (imagine/goal/fork/…) | Stage or send slash; filter by session available_commands | **Half→improved** |
| Settings · Appearance / Browser / Computer / Hooks | Explicit “not available yet” | **Planned** (honest placeholder) |

## Run

```bash
cd apps/desktop && npm install && npm run tauri dev
```
