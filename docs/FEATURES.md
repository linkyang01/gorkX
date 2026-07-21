# gorkX feature matrix

See **`docs/MASTER_PLAN.md`** and **`docs/INDEPENDENT_APP_PLAN.md`**.

**Rule:** no fake product surfaces. Real = works end-to-end. Half = wired to engine/local with limits. Planned = not shipped.

| Area | Feature | Status |
|------|---------|--------|
| Layout | Codex three-pane + collapsible sidebar | **Real** |
| Layout | Review / Terminal / Process | **Real** |
| Kernel | ACP stdio, App `GROK_HOME`, bundled engine path, Doctor | **Real** — normal installs do not scan `~/.grok` or PATH; Doctor reports missing bundle, auth and data-folder access |
| Chat | Stream, tools, permissions, ACP resource-link attachments, / @ keyboard nav | **Real** |
| Image / video generation | `/imagine` and `/imagine-video` passed straight to Grok Build | **Engine-gated** — supported by the locked source, but the active Grok account and engine configuration decide whether a request can run |
| Goal | Stage `/goal`, persist banner, status/pause/resume/clear → agent; progress from plan / `update_goal` tool | **Real (shell)** — engine goal loop quality still varies |
| Projects / Tasks | Create, archive, delete, SQLite index | **Real** |
| Scheduled | SQLite jobs; foreground tasks plus opt-in macOS launchd worker | **Real with limits** — background runs every 5 minutes in Grok plan mode only (no silent repository writes), save output locally, require the installed macOS app; each worker claim/recovery/completion uses an SQLite immediate transaction, and an unreported claim is retried only after a 30-minute lease with recorded backoff |
| Native subagents | Lifecycle events, cancel and snapshots when advertised by the engine | **Half** — current locked kernel does not expose `x.ai/subagent/list_running`, so gorkX does not claim restart/reconnect recovery of running subagents |
| Terminal | PTY dock | **Real** |
| Extensions | Skills / MCP / plugins via engine CLI and App `GROK_HOME` | **Real** (depends on engine; does not read `~/.grok` by default) |
| Memory (Hermes) | Default on; USER/AGENT/project files; inject on first prompt; auto-learn dumps; Remember / Forget / keyword search / local compact | **Real (v0.4+)** — kernel `/flush`/`/dream` still optional extras |
| Auth / quota | Browser device login; stay signed in; silent refresh; membership + avatar | **Real (v0.4.1+)** |
| App update | Settings check + download DMG; launch banner | **Real (v0.4.2)** — drag into Applications to replace |
| Onboarding | First-run checklist: engine · login · project | **Real (v0.4.3)** |
| Plan mode | setMode + review steps + execute / retry after fail; clean agent state on success | **Half→improved** — engine plan quality still varies |
| Worktree | create / list / use / new task / Finder / **back to main repo** | **Half→improved** |
| Voice input | Web Speech + mic preflight | **Half** — may fail in WKWebView |
| Review Diff | Git porcelain + file diff; copy path/diff; reveal file; non-git **file preview** | **Half→improved** — non-git is preview not unified diff |
| GitHub | User-provided fine-grained token in macOS Keychain; verify account and read current origin's open PRs, check-runs, discussion and review comments | **Half** — real REST reads only after the user connects; OAuth/App, PR creation and all remote writes are not shipped |
| Custom API / compatible models | Settings → App `config.toml`; OpenAI Chat/Responses, Anthropic Messages or local gateway probe; task/session selection and default; provider labels/groups; macOS Keychain | **Real** — the released bundled engine was isolated-tested to advertise and accept a configured `[model.*]` through ACP `session/set_model`; the connection probe is one small provider request and never displays endpoint response bodies |
| Multiple provider subscriptions | Account aggregation, OAuth and quota across ChatGPT/Claude/Grok web subscriptions | **Soon** — Grok login is real; OpenAI/Anthropic currently require a user API key or compatible gateway, and web subscriptions are never presented as API logins |
| Sidebar | Task title filter across projects / inbox | **Real** |
| + menu | Local actions always available; engine Slash actions appear only when the live session advertises them | **Real** |
| Settings · Appearance | System / light / dark theme plus compact / comfortable / spacious density; instant local persistence | **Real** |
| Settings · Browser | Connect / diagnose a version-pinned, isolated Playwright MCP for Chrome; optional origin allowlist | **Real** — new connections use `@playwright/mcp@0.0.78`, an in-memory profile and blocked service workers; browser tools depend on Chrome and the kernel MCP runtime |
| Settings · Git | Opens real project Review (status, diff, stage / unstage) | **Real** |
| Settings · Computer | Explicit macOS screen-region picker → local PNG attached to the composer | **Half** — capture is real; computer-use automation is not shipped |
| Settings · Hooks | Project instructions via `AGENTS.md` | **Soon** — locked Grok Build currently returns `Method not found` for the ACP Hooks API, so gorkX does not present inactive controls as usable |

## Deliberate limits still not shipped

- **Browser permissions:** an optional origin allowlist limits new Playwright MCP configurations; redirects remain an engine/MCP limitation and must still be visible to the user.
- **Computer automation:** only user-triggered local screen capture exists; no background capture or mouse/keyboard control.
- **Hooks authoring:** gorkX manages hooks the engine discovers; it does not yet create or edit hook files/configuration.
- **Provider subscriptions:** Grok login is real. OpenAI/Anthropic are API-key or compatible-gateway configurations; a ChatGPT/Claude web subscription is not treated as an API login.
- **Background schedules:** available only through the user-enabled macOS launchd worker; it is deliberately plan-only and does not create an interactive task while the app is closed.
- **Subagent recovery:** current Grok Build lacks the ACP recovery-list API; child work that was running while gorkX was closed cannot be reconstructed as active work.

## Run

```bash
cd apps/desktop && npm install && npm run tauri dev
```

## Isolated browser action gate

This sends no model prompt, but opens the explicit public origin in an
in-memory Playwright Chrome context. Use only an origin you intend to visit:

```bash
node scripts/verify-playwright-mcp.mjs --origin https://example.com
```

## Isolated custom-model ACP gate

This verifies that the bundled engine parses a disposable `[model.*]` entry,
advertises it to ACP and accepts `session/set_model`. It sends no model prompt,
but needs a copied cached Grok login in a disposable home:

```bash
GORKX_ACP_TEST_HOME=/private/tmp/gorkx-acp-home \
GORKX_ACP_TEST_CWD=/private/tmp/gorkx-acp-project \
node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok \
  --authenticated --custom-model
```

## macOS bundle gate

After a local app-only build (not a release), validate its embedded engine without
using a system Grok installation:

```bash
scripts/verify-macos-app-bundle.sh "apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app"
```
