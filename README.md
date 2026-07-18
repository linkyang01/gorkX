# gorkX

**Codex-class desktop command center for the open-source Grok Build kernel.**

- **Shell:** gorkX (this repo) — projects, threads, permissions, UI  
- **Kernel:** local `grok` from [xai-org/grok-build](https://github.com/xai-org/grok-build) (or official install)  
- **Protocol:** Agent Client Protocol (`grok agent stdio`)  
- **License:** Apache-2.0  
- **Platform (v0.1):** macOS Apple Silicon first  

gorkX does **not** reimplement the agent. Upgrade Grok Build anytime; point the app at the new binary.

## Decisions (locked)

| Item | Choice |
|------|--------|
| License | Apache-2.0 |
| Bootstrap | Greenfield Tauri 2 + React |
| Max concurrent agents | 4 |
| Permission modes | Codex-style trio: **Default / Auto / Full Access** |
| Language | System locale → zh or en |
| Kernel upgrade | Official `grok update` **or** rebuild from open source |

## Prerequisites

- Node 18+, Rust stable, Tauri macOS deps  
- Grok CLI installed and logged in (`grok login`), **or** a binary built from `xai-org/grok-build`

## Dev

```bash
cd apps/desktop
npm install
npm run tauri dev
```

Optional: custom kernel for this session:

```bash
export GORKX_GROK_CMD=/path/to/xai-grok-pager   # or your grok binary
npm run tauri dev
```

Or set **Kernel** path in the app UI (persisted in localStorage).

## Upgrade the kernel (not gorkX)

### Official binary

```bash
grok update
# or
curl -fsSL https://x.ai/cli/install.sh | bash
```

### From open source

```bash
cd ~/projects/grok-build   # or your clone of xai-org/grok-build
git pull
cargo build -p xai-grok-pager-bin --release
# Point gorkX Kernel path at target/release/xai-grok-pager
# or symlink/install as `grok`
```

Then open gorkX → **Kernel** → **Recheck**, start a **new** thread.

## Layout

```
gorkX/
  LICENSE
  DEVELOPMENT_PLAN.md
  README.md
  apps/desktop/          # Tauri 2 + React UI + ACP bridge
  scripts/doctor.sh
  docs/
```

## Status

**v0.2.8 chat UX + context meter + auto-compact** — see [docs/FEATURES.md](./docs/FEATURES.md).

Highlights: ACP + auth, multi-thread ≤4, permissions, Plan gate + checkboxes, worktree, Diff, resume/history, model/effort, usage, slash commands, file attach, recent projects, kernel upgrade, **system tray**, shortcuts, macOS `.app`.

**Tray:** closing the window hides to tray (agents keep running). Tray menu **Quit** stops all agents.

```bash
# Dev
./scripts/mac-dev.sh
# or: cd apps/desktop && npm run tauri dev

# Ad-hoc .app bundle
./scripts/mac-build.sh
```

See [docs/acp-mapping.md](./docs/acp-mapping.md) and [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md).
