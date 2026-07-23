# gorkX Master Plan

> **Product:** Independent desktop command center for **full Grok Build**  
> **UI bar:** Codex App–class layout & interaction (structure 1:1; brand = gorkX)  
> **Kernel:** Official Grok Build (ACP + CLI surface), not a reimplemented agent  
> **Status:** Direction superseded.  
> **独立应用唯一主线：`docs/INDEPENDENT_APP_PLAN.md`。**  
> UI 保留；不独立则无意义。

---

## 0. One-line definition

**gorkX** = installable macOS app that **embeds/manages a full Grok Build kernel**, exposes **every daily Grok capability** as simple desktop UI (CLI/slash → buttons/panels), feels like **Codex’s command center**, adds **Hermes-grade memory UX**, then **Chrome control** and other environment tools—without rewriting the agent runtime.

---

## 1. Non-negotiables

| Rule | Detail |
|------|--------|
| Kernel = Grok Build | All agent capability comes from `grok` (ACP stdio + subcommands). No Hermes/OpenCode swap. |
| Commands → desktop | Every useful `grok …` / `/slash` becomes a clickable control where possible. |
| Prefer reuse | ACP SDK, shell to CLI, MCP (e.g. Playwright), open UI references—not NIH. |
| Minimal code | Config + invoke + present. No second agent loop, no custom browser engine. |
| UI = Codex-class | Layout/IA/interaction aligned with Codex App; visuals branded gorkX. Learn from **CodexMonitor** (MIT), not copy OpenAI assets. |
| Stepwise | One milestone = demoable. No big-bang rewrite. |
| Stay on this repo | Evolve `apps/desktop`; do not greenfield another app. |

### Explicitly out of early scope

- Windows/Linux (after Mac solid)
- Notarization / paid cert (optional later)
- Full desktop RPA before Chrome MCP works
- Replacing Grok Memory with a custom vector stack (use Grok first)

---

## 2. Architecture target

```
┌─────────────────────────────────────────────────────────────────┐
│  gorkX.app (Tauri 2 + React)                                    │
│  Codex-class shell: projects · threads · chat · Review · dock   │
│  Extensions hub · Memory panel · Settings · Updaters            │
└────────────────────────────┬────────────────────────────────────┘
                             │ ACP JSON-RPC (stdio)
                             │ + optional shell: `grok mcp|plugin|…`
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Grok Build kernel (bundled sidecar preferred, system fallback) │
│  sessions · tools · plan · worktree · MCP · skills · memory …   │
└────────────────────────────┬────────────────────────────────────┘
                             │ MCP (optional)
                             ▼
                    Playwright → Chrome control
```

**Data (recommended end-state):**

| Path | Role |
|------|------|
| App Support `gorkX/` | UI DB (threads index, layout prefs) |
| Kernel home `~/.grok` *or* `~/.gorkx/grok-home` | Sessions, memory, auth, MCP config (product decision in Phase I) |
| App `Resources/grok` | Bundled kernel binary |

---

## 3. Capability layers (what “done” means)

| Layer | Name | User sentence |
|-------|------|----------------|
| **L1** | Full Grok desktop | “I don’t need the TUI for daily Grok.” |
| **L2** | Independent product | “Install gorkX only; kernel updates inside the app.” |
| **L3** | Codex shell | “Looks and flows like Codex command center.” |
| **L4** | Memory (Hermes UX) | “It remembers projects; I can see and manage memory.” |
| **L5** | Environment | “Agent can drive Chrome; later screenshot / computer use.” |

**Build order:** L1 → L4 (with L3 shell in parallel) → L2 packaging → L5.  
(L3 skeleton can start early so the app *feels* right while L1 fills in.)

---

## 4. Open-source & system reuse map

| Need | Use | Avoid |
|------|-----|--------|
| Agent protocol | `@agentclientprotocol/sdk`, `grok agent stdio` | Custom RPC |
| Kernel binary | Official / self-built Apache-2.0 Grok Build releases | Vendoring half the monorepo into UI |
| CLI admin | `grok mcp|plugin|sessions|worktree|memory|update|login` | Reimplement marketplaces |
| Codex layout ref | [CodexMonitor](https://github.com/Dimillian/CodexMonitor) MIT, acp-ui MIT | Shipping OpenAI Codex assets |
| Terminal | xterm.js + portable-pty (already) | Fake log-only terminal |
| Chrome control | `@playwright/mcp` (Chrome channel) | Custom CDP stack first |
| Screenshots | macOS `screencapture` / `xcap` + existing attachments | Screenshot service rewrite |
| Diff UI | Existing git panel + optional `react-diff-viewer` | Own diff algorithm |
| App update | `tauri-plugin-updater` | Homegrown updater framework |
| Memory store | Grok `~/.grok/memory` + FTS | New embedding product in v1 |

---

## 5. Grok → desktop coverage (implementation checklist)

Legend: ✅ have · 🟡 partial · ❌ missing · — N/A desktop (TUI-only chrome)

### 5.1 Session & chat (daily)

| Grok surface | Desktop control | Status | Phase |
|--------------|-----------------|--------|-------|
| New session `/new` | New task | ✅ | — |
| Resume / `sessions list|search` | Session list + search + restore | 🟡 | A |
| Rename `/rename` | Rename | ✅ | — |
| Delete session | Delete (UI vs kernel hard-delete clear) | 🟡 | A |
| Model `/model`, `grok models` | Model picker (subscription-real) | 🟡 | A |
| Effort `/effort` | Effort picker | ✅ | — |
| Permission modes | Default/Auto/Full + cards | 🟡 | A |
| Plan `/plan`, set_mode | Plan mode + Apply | 🟡 | A |
| Compact `/compact` + auto | Context ring + auto + manual | 🟡 | A |
| Cancel turn | Stop | ✅ | — |
| Slash + skills | Full pass-through + autocomplete from `available_commands` | 🟡 | A |
| Attachments / images | Drag-drop + preview | 🟡 | A |
| Export `/export`, `grok export` | Export Markdown / clipboard | ✅ | B |
| Fork `/fork` | Fork thread | ✅ `_x.ai/session/fork` 已隔离验证 | B |
| Rewind `/rewind` | Rewind UI | 🟡 路由与安全范围已接线；真实两轮会话执行待余额恢复后验收 | C |
| Context `/context` | Breakdown popover | 🟡 | B |
| Goal `/goal` | Persisted goal banner + agent status/pause/resume/clear | ✅ shell；执行质量仍由内核/模型决定 | C |
| `/loop` | Scheduler panel | 🟡 本地计划任务真实可用；不是内核原生 `/loop` 控制面 | C |
| `/btw` | Non-blocking side-question card via `x.ai/btw` | 🟡 路由与独立卡片已接线；真实模型回答待余额恢复后验收 | C |
| `/imagine*` | Optional entry | ❌ | later |

### 5.2 Worktree & git review

| Surface | Desktop | Status | Phase |
|---------|---------|--------|-------|
| `--worktree` / create | Create worktree task | 🟡 | B |
| `grok worktree list|rm|gc` | Manage panel under project menu | ✅ | B |
| Diffs / stage | Review Diff tab | 🟡 | B |
| Plan + tools human labels | Review tabs | 🟡 | B |

### 5.3 Extensions

| Surface | Desktop | Status | Phase |
|---------|---------|--------|-------|
| `grok mcp` / `/mcps` | Full list/add/remove/doctor | 🟡 | B |
| Skills `/skills` | List + run | 🟡 | B |
| Plugins + marketplace | Install/enable/update/uninstall | 🟡 | B |
| Hooks `/hooks` | View/toggle | ✅ 活动会话 `_x.ai/hooks/list/action` 已接线 | C |

### 5.4 Memory (Hermes-class UX, Grok engine)

| Surface | Desktop | Status | Phase |
|---------|---------|--------|-------|
| Enable memory (`config` / env / flag) | Settings toggle | ✅ App-managed Hermes memory | B |
| `/remember` | “Remember this” | ✅ | B |
| `/flush` | Write memory now | 🟡 App records durable session memory; kernel-native `/flush` is optional | B |
| `/dream` | Consolidate | 🟡 Local compact is available; kernel-native `/dream` is optional | B |
| `/memory` browse | Memory panel: global + project files, search | ✅ | B |
| `grok memory clear` | Clear project memory (confirm) | ✅ | B |
| Auto inject on new session | Kernel when enabled | ✅ App-managed first-prompt injection | B |

### 5.5 Account & system

| Surface | Desktop | Status | Phase |
|---------|---------|--------|-------|
| `login` / `logout` | Account menu | 🟡 | A |
| Quota / billing | Account chip + menu (auto-refresh) | 🟡 | A |
| `grok update` | Kernel update UI | 🟡 | I |
| `grok inspect` | Project-menu structured inspection | ✅ | C |
| Sandbox profiles | Settings | ❌ | C |
| AGENTS.md | Project-root read/create/edit | ✅ | C |
| Bundle kernel path | Sidecar + App-owned fallback | ✅ | I |
| App auto-update | GitHub Releases | 🟡 | I |

### 5.6 Environment (after L1 solid)

| Surface | Desktop | Status | Phase |
|---------|---------|--------|-------|
| Control Chrome | One-click enable Playwright MCP + permission | ❌ | E |
| In-app page preview | WebviewWindow URL | ❌ | E |
| Screenshot → chat | Capture + attach | ❌ | E |
| Computer use | Optional, default off | ❌ | F |

### 5.7 TUI-only (replace, don’t clone)

| TUI | Desktop substitute |
|-----|-------------------|
| `/theme`, vim-mode, minimal/fullscreen | App theme + shortcuts |
| `/docs` in-TUI | Link to docs.x.ai + local guide |
| `/quit` `/home` | Window close / home composer |

---

## 6. UI plan (Codex-class)

### 6.1 Target layout

```
┌────────────────┬────────────────────────────┬──────────────────┐
│ Collapsible    │ Main                       │ Review (toggle)  │
│ sidebar        │ Top bar: title · model ·   │ Diff | Plan |    │
│                │ effort · perms · ⊙ Review  │ Tools            │
│ [+] New task   │ Context ring               │                  │
│ Projects ▾     │ Message stream             │                  │
│  └ threads     │ Composer (+ attach, / @)   │                  │
│ Tasks          │                            │                  │
│ Account chip   │                            │                  │
└────────────────┴────────────────────────────┴──────────────────┘
                      Terminal dock (optional bottom)
```

### 6.2 Navigation rules

| Control | Placement |
|---------|-----------|
| New session | Sidebar top |
| Projects / Tasks | Sidebar body |
| Review | **Top-right of main** (not primary sidebar nav) |
| Terminal | Bottom toggle / shortcut |
| Worktree | Project `⋯` menu |
| Extensions | Settings or sidebar secondary |
| Memory | Extensions / Settings + session actions |

### 6.3 Reference workflow

1. Screenshot / use Codex App or CodexMonitor for wire structure.  
2. Implement gorkX structure first (no pixel obsession).  
3. Pass: density, empty states, review open/close, home composer.  
4. Brand: gorkX wordmark/icon only.

### 6.4 UI milestones

| ID | Deliverable |
|----|-------------|
| U1 | Three-pane shell + collapsible sidebar |
| U2 | Move Review / Terminal / Worktree per §6.2 |
| U3 | Home = Codex-style composer (no dead “new” only) |
| U4 | Empty/loading/error states pass visual QA |
| U5 | Polish spacing/type (Codex density) |

---

## 7. Phased roadmap

### Phase A — Daily Grok path reliable (1–2 weeks)

**Goal:** Trust the app for real coding without Terminal.app.

| # | Work | Acceptance |
|---|------|------------|
| A1 | Slash: full forward + autocomplete from agent commands | Skills and builtins appear; Enter runs |
| A2 | Sessions: clear restore/search; fix dual-row bugs; hard vs soft delete labels | No confusing “Grok history” |
| A3 | Model list always subscription-real; effort/mode stick | No hardcoded single model |
| A4 | Login/logout + quota auto-refresh (open menu / interval); drop noisy refresh if auto works | Quota matches CLI billing |
| A5 | Permission + Plan + Compact regression | Multi-turn coding task with approve |
| A6 | Coverage doc live (`docs/grok-desktop-coverage.md`) synced with §5 | Checklist for PRs |

**Exit:** “I can live in gorkX for normal Grok coding.”

---

### Phase B — Full Grok surface + Memory (2–3 weeks)

**Goal:** CLI power users don’t miss TUI for extensions/memory/worktree.

| # | Work | Acceptance |
|---|------|------------|
| B1 | MCP panel = list/add/remove/doctor via `grok mcp` | Matches CLI |
| B2 | Plugins + marketplace = install/enable/update/uninstall | Matches CLI |
| B3 | Skills list + run | One click |
| B4 | **Memory:** settings enable; remember/flush/dream; panel browse/search; clear | Hermes-like UX, Grok files |
| B5 | Worktree manager (list/rm/gc) under project | Safe cleanup |
| B6 | Export transcript; fork session | Files/new thread OK |
| B7 | Context breakdown popover | Readable stats |

**Exit:** Extensions + Memory + Worktree manageable without terminal.

---

### Phase U — Codex shell (parallel with A/B, 1–2 weeks spread)

| # | Work | Acceptance |
|---|------|------------|
| U1–U5 | §6.4 | Side-by-side with CodexMonitor/Codex feels same IA |

**Exit:** New user says “this is a Codex-class layout.”

---

### Phase I — Independence (1–2 weeks)

**Goal:** Real product install, not “dev + system grok.”

| # | Work | Acceptance |
|---|------|------------|
| I1 | Bundle `grok` sidecar; path resolution order: bundle → config → PATH | Fresh machine path documented |
| I2 | Show kernel version in Settings/About | Clear |
| I3 | Kernel update (`grok update` or download channel) | Check + install + restart hint |
| I4 | App update channel (GitHub Releases) | Check + prompt |
| I5 | Optional isolated `GROK_HOME` under gorkX | Toggle documented |
| I6 | Quit behavior solid; tray policy documented | Close = quit (current) or user setting |

**Exit:** “Install gorkX.app only.”

---

### Phase C — Advanced Grok (1–2 weeks)

| # | Work |
|---|------|
| C1 | Rewind UI |
| C2 | Goal banner |
| C3 | `/loop` scheduler UI (thin over kernel) |
| C4 | Hooks panel |
| C5 | `inspect` diagnostics |
| C6 | Sandbox + AGENTS.md affordances |

**Exit:** Power features discoverable.

---

### Phase E — Chrome & light environment (1–2 weeks)

| # | Work | Acceptance |
|---|------|------------|
| E1 | One-click “Enable Chrome control” → Playwright MCP config for Grok | Agent navigates/clicks in Chrome |
| E2 | Permission copy + failure recovery (browser not found, etc.) | User can fix without docs dive |
| E3 | Optional WebviewWindow preview | Open URL in-app |
| E4 | Screenshot → attachment | One button |

**Exit:** “Agent controlled my Chrome.”

---

### Phase F — Computer use (later)

- Default **off**; OS permission gated  
- Prefer existing tools/MCP if any; else minimal `enigo`-class bridge  
- Only after E1 stable  

---

### Phase H — Hardening & ship 1.0 (ongoing → gate)

| # | Work |
|---|------|
| H1 | Split `App.tsx`; tests for store/ACP mocks |
| H2 | Crash/reconnect/orphan agents |
| H3 | Onboarding: missing kernel / login / first project |
| H4 | Security: no token exfil; CSP; path allowlists |
| H5 | README + user guide (zh primary) |
| H6 | Versioning 0.4 → 1.0 when L1+L2+U + Memory + Chrome-MVP |

---

## 8. Suggested calendar (indicative)

| Week | Focus |
|------|--------|
| 1 | A1–A6 + U1–U2 (slash, sessions, layout skeleton) |
| 2 | A polish + B1–B3 (MCP/plugins/skills) |
| 3 | B4 Memory + B5–B6 worktree/export |
| 4 | U3–U5 shell polish + I1–I3 sidecar/update |
| 5 | I4–I6 + C high-value + H1 |
| 6 | E1–E4 Chrome + screenshot; H2–H5; tag beta |

Adjust freely; **do not start E before B1 (MCP hub) works.**

---

## 9. Engineering conventions

1. **Three integration paths only:** ACP method · `grok` CLI · config file.  
2. **New UI panel** must map to a row in §5 or be rejected.  
3. **No `window.prompt`** — use in-app modal (already).  
4. **i18n:** every user string in `i18n.ts` (zh + en).  
5. **PR size:** one phase item or smaller.  
6. **Verify:** `npm run typecheck`; manual script per exit criteria.  
7. **App.tsx:** prefer extract modules when touching large areas.

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Grok Memory experimental / off by default | Clear Settings + docs; feature flag |
| Playwright/Chrome flaky on user machines | Good errors; optional bundled browser channel |
| Dual session lists (UI vs kernel) | Single mental model: gorkX tasks + optional “import kernel session” |
| Bundle size / kernel updates | Sidecar + channel; don’t embed full monorepo source in app |
| Codex look-alike trademark | Brand gorkX; no OpenAI marks |
| Scope creep (computer use, multi-OS) | Phases F / post-1.0 |

---

## 11. Success metrics

| Milestone | Metric |
|-----------|--------|
| M1 | 1 week daily driver without Terminal for Grok coding |
| M2 | Clean machine install ≤10 minutes to first successful agent turn |
| M3 | Side-by-side IA match with Codex (checklist U1–U5) |
| M4 | Memory on: recall fact from prior day in new session |
| M5 | Agent completes a multi-step task in Chrome via MCP |

---

## 12. Immediate next actions (start here)

1. Create `docs/grok-desktop-coverage.md` from §5 (living checklist).  
2. **Phase A1** slash autocomplete completeness.  
3. **Phase A2** session restore UX rewrite (retire confusing “Grok history” label).  
4. **Phase U1–U2** Codex three-pane + move Review control.  
5. Only then **B4 Memory** and **I1** sidecar in parallel tracks if staffing allows.

---

## 13. Document control

| Doc | Role |
|------|------|
| `docs/MASTER_PLAN.md` | **This file — source of truth for roadmap** |
| `DEVELOPMENT_PLAN.md` | Historical v0.1 architecture; defer to Master Plan on conflicts |
| `docs/FEATURES.md` | Feature matrix snapshot; update when shipping phases |
| `docs/acp-mapping.md` | Protocol map; extend as ACP methods used |

**Approvals:** Product direction locked 2026-07-18 (user): full Grok desktop first, Codex UI, Hermes-like memory UX, Chrome control, independent app, evolve existing repo.
