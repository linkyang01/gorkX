# gorkX 1.3.0

Released 2026-08-23 as Git tag `v1.3.0`. The Apple Silicon DMG is attached to
the [GitHub Release](https://github.com/linkyang01/gorkX/releases/tag/v1.3.0).

**DMG SHA-256:** `00d212cfb6e9d498a9eb1fac282215c9feca34da8b65d50ae78f4d6e75040fba`

gorkX 1.3.0 updates the bundled Grok Build engine to **1.0.6** and adds a real,
reviewable project Hook verification flow in Settings.

## Highlights

- **Grok Build 1.0.6 kernel** — source-locked to `19d42e35c07a`, rebuilt with
  the maintained 0001–0007 ACP patch series and bundled with upstream license
  notices.
- **Real SessionStart Hook verification** — Settings creates a disposable Git
  project and a fixed restricted Hook, then requires explicit project trust and
  reload before starting a real task. Success requires the marker written by
  Grok Build itself; a failed task can never be upgraded to success by marker
  presence alone.
- **Safer authentication migration** — first-party legacy App OAuth entries are
  migrated to Grok Build 1.0.6 OIDC semantics, while unknown issuers remain
  fail-closed.
- **Clearer Hook failures** — incompatible engine/HTTP 426 responses and
  task-failed-with-marker states now produce actionable, truthful feedback.
- **Escape to stop** — Escape can cancel a running turn while yielding to text
  editing and active overlays.
- **Stronger release diagnostics** — app and engine architecture mismatches are
  rejected, signing reports use isolated temporary files, and acceptance
  architecture is never inferred from the host machine.

## Verification

The release passed the real Settings Hook flow, the authenticated task and
marker check, a real local OpenAI-compatible provider response, live macOS
dictation into an editable draft, TypeScript Stage A–G tests, the production web
bundle gate, 95 Rust tests plus `cargo check`, all seven kernel patch checks,
the locked kernel build, and the final arm64 App Bundle verification. Full
commands and evidence are recorded in
[`docs/VALIDATION_EVIDENCE.md`](VALIDATION_EVIDENCE.md).

## Install

Download `gorkX_1.3.0_aarch64.dmg`, open it, and drag gorkX into Applications.
The public build supports macOS 12 or later on Apple Silicon. If macOS blocks
the first launch, open **System Settings → Privacy & Security** and choose
**Open Anyway**.
