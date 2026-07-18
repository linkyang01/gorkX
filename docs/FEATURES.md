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
| Memory (Hermes) | Default on; USER/AGENT/project files; inject on first prompt; auto-learn dumps; Remember writes disk | **Real (v0.4)** — kernel `/flush`/`/dream` still optional extras |
| Plan mode | setMode + /plan arm + review plan steps | **Half** — engine plan quality varies |
| Worktree | create / list / remove via engine | **Half** — thin UI |
| Voice input | Web Speech + mic preflight | **Half** — may fail in WKWebView |
| Review Diff | Git porcelain + file diff | **Half** — empty if not a git repo |
| Multi-provider models | Settings → config.toml models | **Half** — engine must honor config |
| + menu (imagine/goal/fork/…) | Stage or send slash to engine | **Half** — capability is the engine’s |
| Settings · Appearance / Browser / Computer / Hooks | Explicit “not available yet” | **Planned** (honest placeholder) |

## Run

```bash
cd apps/desktop && npm install && npm run tauri dev
```
