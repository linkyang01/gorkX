# gorkX feature matrix

See **`docs/MASTER_PLAN.md`** and **`docs/INDEPENDENT_APP_PLAN.md`**.

**Rule:** no fake product surfaces. Real = works end-to-end. Half = wired to engine/local with limits. Planned = not shipped.

| Area | Feature | Status |
|------|---------|--------|
| Layout | Codex three-pane + collapsible sidebar | **Real** |
| Layout | Review / Terminal / Process | **Real** |
| Kernel | ACP stdio, App `GROK_HOME`, bundled engine path, Doctor | **Real** — normal installs do not scan `~/.grok` or PATH; Doctor reports missing bundle, auth and data-folder access |
| Chat | Stream, tools, permissions, ACP resource-link attachments, / @ keyboard nav | **Real** |
| Goal | Stage `/goal`, persist banner, status/pause/resume/clear → agent; progress from plan / `update_goal` tool | **Real (shell)** — engine goal loop quality still varies |
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
| Review Diff | Git porcelain + file diff; copy path/diff; reveal file; non-git **file preview** | **Half→improved** — non-git is preview not unified diff |
| Multi-provider models | Settings → config.toml; connection probe; **set default**; custom models in picker; macOS Keychain for new API keys | **Half→improved** — routing still depends on engine; legacy plaintext keys are visibly migratable |
| Sidebar | Task title filter across projects / inbox | **Real** |
| + menu | Local actions always available; engine Slash actions appear only when the live session advertises them | **Real** |
| Settings · Appearance | System / light / dark theme plus compact / comfortable / spacious density; instant local persistence | **Real** |
| Settings · Browser | Connect / diagnose Playwright MCP for Chrome; manage the real MCP configuration | **Real** — browser tools depend on Chrome and the kernel MCP runtime |
| Settings · Git | Opens real project Review (status, diff, stage / unstage) | **Real** |
| Settings · Computer | Explicit macOS screen-region picker → local PNG attached to the composer | **Half** — capture is real; computer-use automation is not shipped |
| Settings · Hooks | Explicit “not available yet” | **Planned** (honest placeholder) |

## Deliberate limits still not shipped

- **Computer automation:** only user-triggered local screen capture exists; no background capture or mouse/keyboard control.
- **Hooks:** no lifecycle hook runner or editor yet.
- **Provider subscriptions:** Grok login is real. OpenAI/Anthropic are API-key or compatible-gateway configurations; a ChatGPT/Claude web subscription is not treated as an API login.
- **Background schedules:** local scheduled tasks run only while gorkX is open.

## Run

```bash
cd apps/desktop && npm install && npm run tauri dev
```
