# gorkX 1.0.0 Stable

gorkX 1.0.0 is the first **stable** desktop release of the independent Grok Build
agent for macOS Apple Silicon. It is the product you can install, sign in, run
real project tasks, review changes, and manage memory and extensions with —
while remaining honest about what is still kernel- or account-gated.

## Highlights

- **Independent install path** — bundled Grok Build `0.2.112` (`47348d1`) with
  App-owned `HOME` / `GROK_HOME`. A normal install does not inherit the user’s
  CLI `~/.grok`.
- **Core coding Agent loop** — projects and tasks, streaming replies, tool and
  plan approvals, terminal, Review, export, archive/restore, fork, and
  checkpoint rewind with preview + explicit confirmation.
- **Task tool & permission controls (1.0 increment)** — New task → Add:
  - limit built-in tools (`--disallowed-tools`)
  - permission allow/deny rules (`--allow` / `--deny`)
  - memory / single-agent / skip-planning root flags  
  Kernel patch `0004-acp-agent-stdio-cli-overrides` applies these on
  `grok agent stdio` (not only headless `-p`).
- **GitHub connector safety** — official Device Flow (`read:user` + `public_repo`
  disclosed before connect), Keychain storage, disconnect clears Keychain,
  PR/comment writes require a second confirm that names the target repository
  and action, connect/disconnect/write audit trail.
- **Auth recovery** — expired Grok sign-in surfaces a clear re-auth path.
- **Models** — live Grok list from the kernel; optional OpenAI-compatible
  providers with connection test and Keychain secrets (not SQLite).
- **No fake primary controls** — main paths are Real or clearly Kernel-wired /
  Soon and non-executable. See [FEATURES.md](FEATURES.md).

## Boundaries (read before promoting)

| Topic | Honest status |
|---|---|
| Multi-agent **user-created** delegation | Not a 1.0 shipping claim; kernel ACP has no create/assign routing |
| GitHub private org / App install | Prefer fine-grained tokens; Device Flow is public-repo oriented |
| Calendar / Slack / 飞书 / Notion / Drive | Catalog **Soon** — not pretend-connected |
| Computer mouse/keyboard automation | Not a closed TCC + kill-switch product yet |
| ChatGPT / Claude **web** subscriptions as API | Never supported |
| Multi-provider “production verified” | Only if **you** completed a real endpoint acceptance; otherwise do not market it |
| Voice dictation | Wired; requires local mic TCC and human acceptance per machine |
| Notarized “open without Gatekeeper” | Only when Developer ID + notarization were applied; ad-hoc builds need allow steps |
| Windows / Linux GA | Not this release |

## Install

1. Download `gorkX_1.0.0_aarch64.dmg` from the GitHub Release (after the
   maintainer tags `v1.0.0`).
2. Open the DMG · drag **gorkX** to Applications · open it.
3. Complete Grok sign-in in the browser when prompted.
4. Open a real git project and run a first task.

macOS 12+ · Apple Silicon required.

If Gatekeeper blocks first open:

```bash
xattr -dr com.apple.quarantine /Applications/gorkX.app
```

Or allow under **System Settings → Privacy & Security**.

### Rollback

- Keep the previous DMG/App from Releases (`0.5.x`).
- App data lives under `~/Library/Application Support/gorkX/`; removing the App
  does not automatically wipe that directory.
- Do not point a release App at a developer CLI `GROK_HOME`.

## Verification (maintainer)

Automated gates used for this candidate:

- `scripts/verify-grok-kernel-source.sh`
- `scripts/verify-grok-kernel-patches.sh` (series includes `0004`)
- `node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok`
- `cd apps/desktop && npx tsc --noEmit && npm run test:stages && npm run verify:web-bundle`
- `cd apps/desktop/src-tauri && cargo test && cargo check`
- optional: `npm run build:app` + `scripts/verify-macos-app-bundle.sh`
- optional: `scripts/verify-release-readiness.sh` (does not ship)

Human items (clean Mac install, third-party provider, voice, notarization)
remain in [FORMAL_RELEASE_PLAN.md](FORMAL_RELEASE_PLAN.md) §3.3 and
[VALIDATION_EVIDENCE.md](VALIDATION_EVIDENCE.md).

## Thanks

Built on the locked [Grok Build](https://github.com/xai-org/grok-build) engine
and the Agent Client Protocol.
