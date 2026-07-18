# gorkX feature matrix (v0.2.8)

Target: **Codex-class coding command center** over Grok Build kernel (`grok agent stdio`).

> Honest scope: feature/layout **parity for the coding agent workflow**.  
> Visual: **macOS 26 Liquid Glass**. Not a pixel/binary clone of ChatGPT Desktop.  
> Out of scope: OpenAI computer use, Atlas browser, OpenAI plugin store SKUs.

| Area | Feature | Status |
|------|---------|--------|
| Layout | Single sidebar + main + right Review | ✅ |
| Layout | **macOS 26 Liquid Glass** (blur, mesh, float panels) | ✅ |
| Layout | Text truncation fixes (Review title, bars) | ✅ |
| Kernel | ACP stdio bridge + auth | ✅ |
| Kernel | Custom path + version + upgrade recipes | ✅ |
| Threads | Multi-session ≤4, new / stop / cancel | ✅ |
| Threads | Resume + history stream | ✅ |
| Threads | Recent sessions list | ✅ |
| Project | Folder picker + recent + Finder | ✅ |
| Permissions | Default / Auto / Full Access | ✅ |
| Modes | Agent / Plan + Apply plan gate | ✅ |
| Modes | Plan goal banner in main chat | ✅ |
| Isolation | Worktree create | ✅ |
| Review | Colored file diff + stage/unstage | ✅ |
| Review | Plan + tools tabs + empty hints | ✅ |
| Review | Auto-open on first tool/plan; remember preference | ✅ |
| Models | set_model + effort restart | ✅ |
| Chat | Markdown assistant messages | ✅ |
| Chat | Collapsible thinking | ✅ |
| Chat | Expandable tool cards | ✅ |
| Composer | Slash builtins + skills merge | ✅ |
| Composer | `/compact` via `_x.ai/compact_conversation` | ✅ |
| Composer | `@file` fuzzy workspace search | ✅ |
| Hub | Skills discovery + run | ✅ |
| Hub | MCP list / doctor / remove | ✅ |
| Hub | Plugins install / enable / disable / uninstall | ✅ |
| Hub | Marketplace sources list | ✅ |
| Desktop | Tray, shortcuts, i18n zh/en, ErrorBoundary | ✅ |
| Terminal | ACP `terminal/*` client handlers | ✅ |
| Terminal | Bottom dock: user shell + agent terminals | ✅ |
| Persist | Thread metadata + chat snapshot (SQLite) | ✅ |
| Persist | localStorage → SQLite one-shot migrate | ✅ |
| Chat | **@tanstack/react-virtual** message list | ✅ |
| Onboard | 3-step first-run checklist | ✅ |
| Kernel | Data dir / SQLite path / clear chat cache | ✅ |
| Resilience | Agent crash one-shot auto-reconnect | ✅ |
| Terminal | **Embedded xterm.js + PTY** (real shell) | ✅ |
| i18n | macOS bundle zh-Hans + CFBundleLocalizations | ✅ |
| Next | Notarization / Sparkle auto-update | ⏳ (skipped) |
| Later | Computer use / in-app browser | ⏳ not Grok kernel |
| Later | SSH remotes, thread automations | ⏳ |
| Later | Notarization / auto-update | ⏳ |

## Run

```bash
./scripts/mac-dev.sh
./scripts/mac-install.sh   # → ~/Applications/gorkX.app
```
