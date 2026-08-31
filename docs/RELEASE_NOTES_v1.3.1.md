# gorkX 1.3.1

Released 2026-08-31 as Git tag `v1.3.1`. The Apple Silicon DMG is attached to
the [GitHub Release](https://github.com/linkyang01/gorkX/releases/tag/v1.3.1).

**DMG SHA-256:** `c372662bf1b4d7a5fa93bd220ae7137679666a4da616e76dd72642f6900e5f62`

gorkX 1.3.1 updates the bundled Grok Build engine to **1.0.12** and keeps the
desktop Hook path aligned with the upstream cancellation contract.

## Highlights

- **Grok Build 1.0.12 kernel** — source-locked to
  `bc7f02eddd3d84085849dc19ed216f11c23b0571`, rebuilt with the maintained
  0001–0007 ACP patch series and bundled with the upstream license notices.
- **Hook-denied turn handling** — the desktop recognizes the upstream
  `HookDenied` metadata and the user-facing “Turn blocked by a hook” wording,
  while ordinary cancellation continues to show its normal stop reason.
- **Regression coverage** — the Hook-blocked response mapping and fallback
  wording are covered by the frontend task-run-status tests and the Stage B
  gate.
- **Security and ACP maintenance** — the synced patch series keeps the App
  Hook control and desktop ACP compatibility changes in the source-locked
  kernel build.

## Verification

The release candidate passed the locked-source check, all seven patch checks,
the bundled kernel rebuild, the unauthenticated ACP control matrix, frontend
TypeScript/build/Stage A–G/web-bundle gates, 96 Rust library tests, `cargo
check`, and App/DMG bundle verification. An isolated authenticated smoke also
completed `initialize`, cached-token authentication, session creation/load and
one real `session/prompt` resource-link turn against Grok Build 1.0.12.

The published scope is explicitly **Apple Silicon `arm64_adhoc`**. The release
gate carries forward the previously recorded real third-party-model and
macOS-dictation evidence; it does not claim a new clean-machine install,
Developer ID/notarization, or native Intel acceptance. The ad-hoc DMG may
require **System Settings → Privacy & Security → Open Anyway** on first launch.

## Install

Download `gorkX_1.3.1_aarch64.dmg`, open it, and drag gorkX into Applications.
This release supports macOS 12 or later on Apple Silicon.
