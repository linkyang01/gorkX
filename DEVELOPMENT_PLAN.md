# gorkX — Development Plan

> Codex-class desktop control center for official Grok Build CLI.  
> Project name: **gorkX** · Platform: **macOS first (Apple Silicon)** · Agent: **local `grok agent stdio` (ACP)**

**Status:** Plan v0.1 · Date: 2026-07-18  
**Local sources already available:**
- `~/projects/grok-build` — official agent/TUI (Apache-2.0, reference only)
- `~/projects/grok-build-desktop` — community UI (source-available; **reference UX only, do not copy wholesale**)

---

## 0. One-line product definition

**gorkX** is a native macOS app that is to Grok Build what the Codex app is to Codex CLI:  
a **project-centric multi-thread agent command center** over a **stable agent protocol**, not a pretty wrapper around `grok -p`.

---

## 1. Architecture decision (locked)

### 1.1 Do / Don't

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent integration | **`grok agent stdio` + ACP** | Same pattern as Codex App Server; tool events, permissions, sessions |
| NOT primary path | `grok -p` headless streaming-json | Caps tool UX; serial single-shot; cannot reach Codex parity |
| Desktop shell | **Tauri 2 + React/TS** | Lightweight on Mac; matches acp-ui / modern stacks |
| Protocol library | **`@agentclientprotocol/sdk`** | Don't invent JSON-RPC |
| UI inspiration | acp-ui + Codex layout + grok-build-desktop *patterns* | Reuse open MIT code; redesign branded gorkX |
| Grok binary | System / `~/.grok/bin/grok` | Never vendor monorepo agent into the app |
| Platform v1 | **macOS arm64 only** | Same launch strategy as Codex app |
| License for *our* code | **MIT or Apache-2.0** | Avoid basing on all-rights-reserved tree |

### 1.2 High-level architecture

```
┌─────────────────────────────────────────────────────────────┐
│  gorkX.app (Tauri 2)                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Projects     │  │ Threads      │  │ Chat / Thought    │  │
│  │ Workspace    │  │ Session list │  │ Tool timeline     │  │
│  └──────────────┘  └──────────────┘  │ Diff / Plan       │  │
│  ┌──────────────┐  ┌──────────────┐  │ Permission cards  │  │
│  │ Settings     │  │ MCP/Skills   │  └───────────────────┘  │
│  └──────────────┘  └──────────────┘                         │
│            │ ACP JSON-RPC (stdio) per thread / shared pool  │
└────────────┼────────────────────────────────────────────────┘
             ▼
      grok agent stdio
      (+ x.ai/* extensions: git, worktree, fs, terminal, …)
```

### 1.3 Why not fork grok-build-desktop as the main repo

1. Integration is **`-p`**, not ACP — wrong heart for Codex parity.  
2. License is **all rights reserved** — bad foundation for a product named gorkX.  
3. Rebuilding the run engine is ~50–70% of the work anyway.

**Use it as:** layout reference, interaction patterns, CSS/spacing notes.  
**Do not:** `git clone` and rename as gorkX mainline.

**Preferred bootstrap:** fork or scaffold from **acp-ui (MIT)** *or* greenfield Tauri + ACP SDK with selected patterns from acp-ui.

---

## 2. Codex parity matrix (target for “完整 gorkX”)

Legend: P0 must-have · P1 strong parity · P2 polish / later

| Codex-class capability | Grok side already exists? | gorkX UI/engine work | Priority |
|------------------------|---------------------------|----------------------|----------|
| Project-centric workspace | cwd / sessions | Project model + picker + recent | P0 |
| Multi threads / parallel agents | subagents, multi session, worktree | Multi-thread UI + 1 process or N ACP clients | P0 |
| Streaming text + reasoning | ACP chunks | Thought / answer panes | P0 |
| Tool call visibility | ACP tool_call / updates | Timeline cards | P0 |
| Interactive permissions | ACP permission | Approve / Deny / Always for session | P0 |
| Session create / resume | ACP session + grok storage | Thread list, resume, fork | P0 |
| Auth reuse | `~/.grok/auth.json` | Status + `grok login` launch | P0 |
| Diff review | `x.ai/git/*` diffs | Diff panel, stage/discard (v1 view-only OK) | P0–P1 |
| Plan mode | grok plan mode | Plan card + Apply gate | P1 |
| Worktree isolation | `x.ai/git/worktree/*` | Create thread in worktree | P1 |
| Goal / long run | `/goal`, update_goal | Goal banner + status | P1 |
| MCP / skills / plugins | CLI + marketplace | Hub UI (manage via grok commands) | P1 |
| Terminal output | `x.ai/terminal/*` | Terminal dock | P1 |
| File tree / @file | fs + index notifications | Picker + mentions | P1 |
| Inline browser preview | weak | Optional WKWebView later | P2 |
| Computer use | not first-class | Out of scope v1 | — |
| Windows / Linux | grok CLI exists | After Mac v1.0 | P2 |
| Auto-update notarized | — | After brand + cert | P2 |

---

## 3. Repository layout (new product repo)

```
gorkX/
  README.md
  DEVELOPMENT_PLAN.md          # this file
  LICENSE                      # MIT or Apache-2.0
  apps/
    desktop/                   # Tauri 2 + Vite + React
      src/                     # UI
      src-tauri/               # Rust: process spawn, ACP bridge optional helpers
  packages/
    acp-client/                # thin wrapper over @agentclientprotocol/sdk
    grok-adapter/              # spawn args, model list, x.ai/* helpers, auth probe
    ui-kit/                    # optional shared components
  docs/
    architecture.md
    acp-mapping.md             # Codex surface → ACP method map
    ux-spec.md
  scripts/
    doctor.sh
    dev-mac.sh
```

Working title bundle id: `app.gorkx.desktop`  
Product name in UI: **gorkX**  
Window subtitle: “Grok Agent Command Center”

---

## 4. Phased roadmap

### Phase 0 — Foundation (Week 1)

**Goal:** Repo + Mac window + proven ACP hello-world with local grok.

Deliverables:
- [ ] Create `~/projects/gorkX` product repo (MIT/Apache)
- [ ] Scaffold Tauri 2 + React 19 + TS
- [ ] `packages/acp-client`: spawn `grok agent stdio`, initialize, session/new, session/prompt
- [ ] Minimal chat UI: one project path, one thread, stream text + thought
- [ ] Auth status: detect CLI + login cache (no token exfil)
- [ ] Doctor script: grok version, auth present, node/rust
- [ ] CI: lint + typecheck + unit tests on acp-client mock

Exit criteria:
- On Apple Silicon Mac: open app → pick folder → prompt → stream reply from real grok.

**Dependencies:** User already logged in (`grok login`).

---

### Phase 1 — Codex core loop (Weeks 2–3)  → **MVP “可用 gorkX”**

**Goal:** Daily-driver coding agent console (still thinner than full Codex).

Deliverables:
- [ ] **Projects**: list, add, remove, last-opened; bind default cwd
- [ ] **Threads**: multi-session list per project; create / rename / archive / delete
- [ ] **Streaming UX**: thought collapsible; assistant markdown; cancel turn
- [ ] **Tool timeline**: tool_call + tool_call_update cards
- [ ] **Permission cards**: allow / deny / allow-for-session; map to ACP
- [ ] **Model / effort / permission-mode** selectors → agent options / meta
- [ ] **Resume**: session/load or grok resume semantics via ACP
- [ ] Local persistence: projects + threads metadata (SQLite or JSON under Application Support)
- [ ] Settings: theme, grok binary path override, always-approve toggle (power user)
- [ ] Error states: CLI missing, not logged in, agent crash, rate limit

Exit criteria:
- Can run a multi-turn coding task with tool visibility and at least one manual approval flow.
- Survive app restart for project/thread list (session resume best-effort).

**Codex parity score after P1:** ~40–50% of “feel”, 70% of daily coding need.

---

### Phase 2 — Command center (Weeks 4–6)  → **“像 Codex” 主体验**

**Goal:** Multi-agent orchestration surfaces that define Codex desktop.

Deliverables:
- [ ] **Parallel threads**: ≥2 concurrent ACP sessions (separate process or documented leader mode)
- [ ] **Worktree threads**: create thread → `x.ai/git/worktree/create` → cwd isolation
- [ ] **Diff panel**: show `x.ai/git/diffs`; open file; copy patch; optional stage/discard
- [ ] **Plan mode UI**: enter plan; show plan updates; explicit “Apply / continue implementation”
- [ ] **Goal banner**: surface goal status if agent uses update_goal
- [ ] **@file / fuzzy open**: wire fs + search extensions or local walk
- [ ] **Terminal dock**: create/read terminal via ACP extensions where available
- [ ] **MCP / Skills hub** (manage via `grok mcp` / skills paths; don’t reimplement runtime)
- [ ] Composer: slash commands subset (/model, /effort, /clear, /compact if exposed)
- [ ] Keyboard map doc (⌘N thread, ⌘P project, ⌘↵ send, Esc cancel)

Exit criteria:
- Two threads on same repo with worktree isolation without clobbering each other.
- User can review a diff without leaving the app.
- Plan → approve path works end-to-end once.

**Codex parity score after P2:** ~70–80% coding-command-center (not computer-use).

---

### Phase 3 — Product hardening (Weeks 7–9)  → **gorkX 1.0**

**Goal:** Ship-quality Mac app for yourself / limited users.

Deliverables:
- [ ] Crash recovery, agent reconnect, orphan process cleanup
- [ ] Run/session diagnostics panel (raw ACP traffic optional, dev mode)
- [ ] Onboarding: install grok / login / pick first project
- [ ] Ad-hoc signed `.app` + install script; Gatekeeper notes
- [ ] Security review checklist (no auth.json upload; CSP; path sandbox)
- [ ] Performance: virtualized message list; backpressure on tool spam
- [ ] i18n: zh-CN + en (you primary zh)
- [ ] Branding: gorkX icon, about, versioning `0.1.0` → `1.0.0`
- [ ] Docs: user guide + architecture + ACP mapping
- [ ] Optional: menu bar / notifications on permission request

Exit criteria:
- Self-host daily for 1 week without data loss.
- Fresh Mac user path documented in README.

Out of scope for 1.0:
- Computer use, full in-app browser IDE, Windows, notarization (unless cert ready), mobile.

---

### Phase 4 — Stretch (post-1.0)

- Windows build  
- Notarization + sparkle/tauri updater  
- PR review workflow UI  
- Deeper plugin marketplace UI  
- Optional embed of web preview  
- Telemetry opt-in only  

---

## 5. ACP ↔ gorkX feature mapping (implementation guide)

| UI action | ACP / Grok |
|-----------|------------|
| New thread | `session/new` { cwd, mcpServers, _meta } |
| Send | `session/prompt` |
| Stream | `session/update` → agent_message_chunk / agent_thought_chunk / tool_call* / plan |
| Approve tool | permission response methods (per ACP version) |
| Cancel | cancel / abort as supported |
| Diff | `x.ai/git/diffs` (and related) |
| Worktree | `x.ai/git/worktree/*` |
| Terminal | `x.ai/terminal/*` |
| Auth browser | `x.ai/auth/*` or shell out `grok login` |

Document exact method names against installed `grok --version` in `docs/acp-mapping.md` during Phase 0 (protocol drifts).

---

## 6. UX skeleton (Codex-like layout)

```
┌──────────┬─────────────┬────────────────────────────┬────────────┐
│ Projects │ Threads     │  Main: messages + tools    │ Diff/Plan  │
│          │             │  Composer                  │ or Files   │
│ + add    │ + new       │  Permission modal overlay  │            │
└──────────┴─────────────┴────────────────────────────┴────────────┘
 Status: model · effort · auth · active tools · token-ish meter
```

Visual language: dark-first, dense but calm; avoid cloning Codex assets; original **gorkX** brand.

---

## 7. Engineering standards

- TypeScript strict; Rust clippy on tauri  
- Unit tests: ACP message parse, session state machine  
- Integration test: mock ACP server fixture (no network)  
- Manual test matrix: login / offline CLI / long run / multi-thread  
- Secrets: never log auth.json; never bundle API keys  
- Process: kill process groups on window close (learn from grok-build-desktop process.rs patterns)

---

## 8. Risk register

| Risk | Mitigation |
|------|------------|
| ACP / x.ai extensions change with grok versions | Version pin + adapter layer + doctor |
| Permission UX differs from docs | Capture real traffic in Phase 0 |
| Multi-process resource use | Cap concurrent threads; optional leader mode |
| License contamination from desktop prototype | Clean-room UI; no copy of restricted source |
| Expecting computer-use parity | Explicitly non-goal for 1.0 |
| Official xAI desktop later | gorkX stays local open client; differentiate on workflow |

---

## 9. Team / effort estimate (solo or pair)

| Phase | Calendar (part-time ~50%) | Full-time focus |
|-------|---------------------------|-----------------|
| P0 | 1–1.5 weeks | 3–5 days |
| P1 | 2–3 weeks | 1.5–2 weeks |
| P2 | 3 weeks | 2 weeks |
| P3 | 2–3 weeks | 1.5–2 weeks |
| **Total to 1.0** | **~2–2.5 months** | **~6–8 weeks** |

---

## 10. Immediate next actions (execution order)

1. **Confirm** this plan (especially: ACP base, Mac-only, MIT/Apache, no computer-use in 1.0).  
2. **Init repo** `gorkX` with license + empty desktop scaffold.  
3. **Spike (1–2 days):** ACP handshake with real `grok agent stdio`; dump sample `session/update` events to freeze schema.  
4. **Implement Phase 0 → Phase 1** without polishing branding first.  
5. Only then port “nice” UX from references.

---

## 11. Success definition for “完整 gorkX”

v1.0 is **complete enough** when:

1. Project + multi-thread command center works on Mac.  
2. Real Grok agent runs via ACP with tools visible and permissions interactive.  
3. Diff + worktree + plan cover the Codex coding core.  
4. No dependency on restricted third-party desktop source.  
5. You can replace terminal `grok` for most coding days.

Not required for “完整”: computer use, official store, Windows, pixel-perfect Codex clone.

---

## 12. Open decisions for you

1. License: **MIT** vs **Apache-2.0**? (recommend Apache-2.0 to align with xAI OSS)  
2. Bootstrap: **greenfield Tauri** vs **fork acp-ui**? (recommend greenfield + copy patterns, cleaner brand; or fork acp-ui if speed > purity)  
3. Concurrent agents: hard cap default **2** or **4**?  
4. Default permission: **ask** (safe) vs remember last project policy?  
5. UI language default: **zh-CN** or **en**?

---

*End of plan v0.1*

---

## Decisions locked (2026-07-18)

| Item | Decision |
|------|----------|
| License | **Apache-2.0** |
| Bootstrap | **A — greenfield Tauri** (not fork acp-ui) |
| Max concurrent agents | **4** |
| Permissions | **Codex trio:** Default / Auto / Full Access |
| UI language | **System locale** → zh or en |
| Kernel upgrade | **Official binary OR open-source rebuild** (first-class in app) |

## Kernel upgrade channels (product requirement)

gorkX is a **shell**. The agent brain is the local Grok Build binary.

### In-app (Kernel panel)

- Show resolved path + `grok --version`
- Channel: auto-detect / custom path / `GORKX_GROK_CMD`
- Custom path picker (persist `gorkx.grokCmd`)
- Upgrade recipes:
  - **Official:** `grok update` / install.sh
  - **Source:** `git pull` on `xai-org/grok-build` + `cargo build -p xai-grok-pager-bin --release`, then point Kernel path at the new binary
- Links: GitHub source + docs.x.ai
- After upgrade: **new threads** pick up the new binary (running agents keep old process)

### Env

```bash
export GORKX_GROK_CMD=/path/to/xai-grok-pager
```

### Doctor

```bash
./scripts/doctor.sh
```
