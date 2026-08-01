# gorkX 1.1.0

Feature release on top of 1.0.0 Stable: Codex-style appearance, deeper Settings, and dark-theme surface fixes. macOS Apple Silicon.

## Highlights

### Appearance (Codex-style)
- System / light / dark preview cards with **live palette** colours
- Independent light & dark editors: accent, background, foreground (colour + HEX), UI/code fonts, translucent sidebar, contrast
- Built-in presets: **gorkX**, **Codex**, **Graphite**, **Ocean**
- Named **theme library** (save / apply / delete), JSON clipboard + file import/export
- Mini **workspace live preview** in Settings
- Custom installed font family names; sync accent across light/dark

### Settings depth
- Shortcuts listed inline; Plugins/MCP live snapshots; Worktree preview
- Account sign-in state, local nickname, coding-data note
- Updates: humanized check/download failures; Gatekeeper note
- Connectors: real GitHub card + honest **Soon** capability cards
- Git summary, Environment doctor fold-out, About dual versions + diagnostic export
- Models: search/filter/collapsible providers; Usage empty-state → Account; Hooks need-task CTAs

### Shell / theme hygiene
- Dark-theme white-flash hardcodes removed (sched cards, chips, forms, …)
- Automated guard against light surface `background` hex in App.css

### Evidence
- ACP main `session/prompt` short turn and live subagent completion reconfirmed on entitled accounts (see `docs/evidence/one-shot-complete-20260801/`)
- Automated gates: `tsc`, `test:stages`, cargo tests, kernel patches, bundle verify

## Boundaries (unchanged honesty)

| Topic | Status |
|---|---|
| Calendar / Slack / 飞书 / Notion / Drive | **Soon** — not pretend-connected |
| ChatGPT / Claude web subscriptions as API | Not supported |
| Clean-machine install / H2 third-party endpoint / H3 mic | Still human gates for full marketing claims |
| Signing | This build is typically **ad-hoc** unless notarized with your Developer ID |

## Install (macOS arm64)

1. Download `gorkX_1.1.0_aarch64.dmg` from the GitHub Release.
2. Open the DMG and drag **gorkX** into Applications.
3. If Gatekeeper blocks an ad-hoc build: System Settings → Privacy & Security → Open Anyway.

Kernel: bundled Grok Build **0.2.116** (`dd04f39`) + patches 0001–0007.
