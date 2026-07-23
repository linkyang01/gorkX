# gorkX feature matrix

See **`docs/MASTER_PLAN.md`** and **`docs/INDEPENDENT_APP_PLAN.md`**.

**Rule:** no fake product surfaces. Real = works end-to-end. Half = wired to engine/local with limits. Planned = not shipped.

**Upstream parity rule:** every useful Grok Build capability is reviewed at each
locked-kernel update. A capability that ACP exposes is presented in gorkX as a
clear desktop flow; a TUI-only capability is implemented through a maintained
kernel ACP extension, or is explicitly marked unavailable until that extension
exists. gorkX never relabels a browser API, a typed slash command, or a local
mock as the corresponding Grok Build capability.

**Connector UX rule:** ordinary users connect third-party platforms through a clear browser/system authorization flow and return to gorkX. Manual tokens, URLs, CLIs and config files are advanced fallbacks only; a platform without a real authorization chain is shown as unavailable/Soon, never as connected.

| Area | Feature | Status |
|------|---------|--------|
| Layout | Codex three-pane + collapsible sidebar | **Real** |
| Layout | Review / Terminal / Process | **Real** |
| Kernel | ACP stdio, App `GROK_HOME`, bundled engine path, Doctor | **Real** — normal installs do not scan `~/.grok` or PATH; Doctor reports missing bundle, auth and data-folder access |
| Chat | Stream, tools, permissions, ACP resource-link attachments, / @ keyboard nav | **Real** |
| Conversation results | Markdown headings, lists, code, blockquotes, **step cards**, read-only completion checklists, **GFM pipe tables**, automatic charts for compact two-column numeric comparisons, safe data-only `chart` blocks, common `mermaid` flowcharts, and colored `diff` / `patch` code blocks | **Real** — visual results render inside the conversation automatically; tables retain their exact values. Chart blocks accept only bounded numeric bar/line data, Mermaid support is a bounded local flowchart reader (TD/LR nodes and arrows), and diff rendering only colors escaped unified-diff text. No HTML, scripts or remote assets execute. |
| Guided answers | Explicit fenced `choices` / `options` blocks become clickable quick replies | **Real** — only a user click sends the selected value to Grok Build; ordinary lists remain non-interactive |
| Native decision interview | Grok Build `x.ai/ask_user_question` renders in the current task's message flow as a structured decision card with option context, multi-select, freeform answer, cancel, and plan-mode actions; a background task remains a modal safety fallback | **Kernel-wired** — every submit/cancel/plan action replies to the originating ACP request rather than sending guessed chat text. The response shape matches bundled Grok Build 0.2.110 source; it appears only when the engine actually asks a question, and a live engine turn is required to observe it |
| Chat | Fork conversation | **Kernel-wired** — 0.2.110 stdio exposes the compatibility route `_x.ai/session/fork`; gorkX creates and loads the durable child session while preserving the source. The standard `x.ai/*` spelling is not accepted by this stdio runtime, so the client uses the tested runtime route. |
| Chat | Rewind conversation | **Kernel-wired** — gorkX lists `_x.ai/rewind/points`, requires an explicit checkpoint and scope, and calls `_x.ai/rewind/execute` with `force: false`; successful rewind reloads the task from kernel history. The local ACP probe verifies route availability; full real-turn execution remains an account-credit acceptance gate. |
| Image / video generation | `/imagine` and `/imagine-video` passed straight to Grok Build; supported ACP raster output appears in the conversation as a local image card | **Engine-gated** — supported by the locked source, but the active Grok account and engine configuration decide whether a request can run. When the engine emits a PNG/JPEG/GIF/WebP ACP image block, gorkX validates it, saves bytes only under App data (not SQLite/logs/transcript text), persists path metadata for task restore, and renders it locally. |
| Goal | Stage `/goal`, persist banner, status/pause/resume/clear → agent; progress from plan / `update_goal` tool | **Real (shell)** — engine goal loop quality still varies |
| Projects / Tasks | Create, archive, delete, SQLite index | **Real** |
| Scheduled | SQLite jobs; foreground tasks plus opt-in macOS launchd worker | **Real with limits** — background runs every 5 minutes in Grok plan mode only (no silent repository writes), save output locally, require the installed macOS app; each worker claim/recovery/completion uses an SQLite immediate transaction, and an unreported claim is retried only after a 30-minute lease with recorded backoff |
| Native subagents | Lifecycle events → persisted parent/child task tree; cancel and snapshots; reconnect reconciles engine-reported running children; Settings policy for enabling all, `explore`, and `plan` types | **Kernel-wired** — 0.2.110 stdio exposes its control plane under `_x.ai/subagent/*`; gorkX uses the runtime route for list/get/cancel. Settings write the documented Grok Build `[subagents]` policy for new dispatches, while the kernel—not gorkX—still chooses delegation, capability mode and worktree isolation. |
| Terminal | PTY dock | **Real** |
| Extensions | Skills / MCP / plugins via engine CLI and App `GROK_HOME` | **Real** (depends on engine; does not read `~/.grok` by default) |
| Memory (Hermes) | Default on; USER/AGENT/project files; inject on first prompt; auto-learn dumps; Remember / Forget / keyword search / local compact | **Real (v0.4+)** — kernel `/flush`/`/dream` still optional extras |
| Auth / quota | Browser device login; stay signed in; silent refresh; membership + avatar | **Real (v0.4.1+)** |
| App update | Settings check + download DMG; launch banner | **Real (v0.4.2)** — drag into Applications to replace |
| Onboarding | First-run checklist: engine · login · project | **Real (v0.4.3)** |
| Plan mode | setMode + review steps + execute / retry after fail; native `x.ai/exit_plan_mode` approval gate with plan preview, revision feedback, approval and abandon outcomes | **Kernel-wired** — response shape matches bundled Grok Build 0.2.110 source; it appears only when the engine actually requests plan approval, while plan quality still varies by engine/model |
| Worktree | create / list / use / new task / Finder / **back to main repo** | **Real** — isolated ACP regression creates a kernel worktree in a disposable Git project and confirms its returned path; actual repository conflict handling remains an explicit user confirmation path |
| Voice Mode / dictation | Grok Build streaming STT and macOS low-memory capture helper | **Kernel TUI only — unavailable in gorkX for now.** The browser Web Speech implementation was removed rather than being presented as Grok Build Voice Mode. Upstream 0.2.110 advertises only the boolean `voiceMode` in ACP; it has no ACP start/stop/transcript interface. gorkX needs a maintained kernel ACP extension before it can expose the microphone again. |
| Review Diff | Git porcelain + file diff; copy path/diff; reveal file; non-git **file preview** | **Real with a stated boundary** — non-git folders receive a safe file preview, not a fabricated unified diff |
| GitHub | Review → Remote reads the current origin's open PRs; checks and discussion/review comments load on demand. A user-provided fine-grained token stays in macOS Keychain. A pushed current branch can open a PR only after the user fills title/base and confirms the exact remote write; a discussion comment on an existing PR also requires its own visible confirmation. | **Half** — public origins are attempted anonymously for reads first, but GitHub may rate-limit or block that path and gorkX then provides a one-click official Token-creation guide as its advanced fallback. PR creation requires a user token with `Pull requests: write`; PR discussion comments require `Issues: write` or `Pull requests: write`. gorkX never pushes a branch automatically. GitHub App one-click browser authorization, inline review comments and other remote writes are still planned. |
| Custom API / compatible models | Settings quick setup for OpenAI API / Anthropic API / OpenRouter API / Google Gemini API / local Ollama / compatible gateway; provider model-directory reader; App `config.toml`; task/session selection and default; provider labels/groups; macOS Keychain | **Real** — quick setup pre-fills only real protocol endpoints and opens the provider's official key/download page; it never claims web subscriptions are API connections. A user can read a configured provider's standard model directory and select a returned ID rather than guess one; this call never saves the form, logs a key, or exposes provider response bodies. The released bundled engine was isolated-tested to advertise and accept a configured `[model.*]` through ACP `session/set_model`; after a settings change, active kernel processes receive native `reload_models` so the model need not wait for a task restart. The connection probe is one small provider request and reports success only after it verifies generated text in the matching protocol response. Saved models visibly retain a non-secret pass/fail state and timestamp, so “configured” is not presented as “verified”. Endpoint response bodies never reach the UI or logs. |
| Multiple provider subscriptions | Account aggregation, OAuth and quota across ChatGPT/Claude/Grok web subscriptions | **Soon** — Grok login is real; OpenAI/Anthropic currently require a user API key or compatible gateway, and web subscriptions are never presented as API logins |
| Sidebar | Task title filter across projects / inbox | **Real** |
| + menu and `/` completion | Local actions always available; engine Slash actions appear only when the live session advertises them | **Real** — composer completion and `+` use the same rule, so an unadvertised agent command is never presented as available merely because a text fallback exists |
| Settings · Appearance | System / light / dark theme plus compact / comfortable / spacious density; instant local persistence | **Real** |
| Settings · Browser | Connect / diagnose a version-pinned, isolated Playwright MCP for Chrome; optional origin allowlist | **Real** — new connections use `@playwright/mcp@0.0.78`, an in-memory profile and blocked service workers; browser tools depend on Chrome and the kernel MCP runtime |
| Settings · Git | Opens real project Review (status, diff, stage / unstage) | **Real** |
| Settings · Computer | Explicit macOS screen-region picker → local PNG attached to the composer | **Half** — capture is real; computer-use automation is not shipped |
| Settings · Project instructions | Read / create / edit the project-root `AGENTS.md` | **Real** — gorkX edits only the selected project's regular local file with bounded, atomic writes and refuses symlinks. It does not claim that this file enables ACP Hooks. |
| Settings · Hooks | Load engine-discovered hooks for the active task; explicit reload, project trust/untrust and enable/disable actions | **Kernel-wired** — 0.2.110 stdio exposes `_x.ai/hooks/list` and `_x.ai/hooks/action`; gorkX only acts after the user chooses a visible control. It does not fabricate Hook authoring or execute a Hook itself. |
| Project trust | Native `x.ai/folder_trust/request` prompt before project-local MCP, Hooks or LSP configuration is activated | **Kernel-wired** — gorkX advertises the interactive safety capability and returns only explicit `trust` or fail-closed `reject`; it appears only when the engine enables and requests the folder-trust gate |

## Deliberate limits still not shipped

- **Browser permissions:** an optional origin allowlist limits new Playwright MCP configurations; redirects remain an engine/MCP limitation and must still be visible to the user.
- **Computer automation:** only user-triggered local screen capture exists; no background capture or mouse/keyboard control.
- **Hooks authoring:** gorkX manages hooks the engine discovers; it does not yet create or edit hook files/configuration.
- **Provider subscriptions:** Grok login is real. OpenAI/Anthropic are API-key or compatible-gateway configurations; a ChatGPT/Claude web subscription is not treated as an API login.
- **Background schedules:** available only through the user-enabled macOS launchd worker; it is deliberately plan-only and does not create an interactive task while the app is closed.
- **Subagent delegation policy:** gorkX can persist and reconcile engine-reported child work, but it does not invent assignments, worktree isolation or completion results; those remain kernel-owned decisions.

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
