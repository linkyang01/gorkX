# gorkX 1.2.0 Release Candidate

gorkX 1.2.0 updates the bundled Grok Build engine to **1.0.0** and keeps the
desktop-first experience intact: normal users use buttons, panels and guided
cards; slash commands remain an expert compatibility path.

## Highlights

- **Grok Build 1.0.0 kernel** — source-locked to `afbc0fb71032`, rebuilt with
  the maintained 0001–0007 ACP patch series and bundled with upstream license
  notices.
- **Native voice path retained** — the composer microphone continues to use
  Grok Build's native low-memory macOS capture and streaming transcript path;
  transcripts enter an editable draft and are never auto-sent.
- **More useful session history** — dormant task rows can show the kernel's
  previous-turn summary when the server provides one.
- **Readable permission review** — long scripts remain complete, can be
  expanded in the permission card, and can be copied without exposing a
  truncated command.
- **Extensions at a glance** — Skills and Plugins are sorted by name and
  grouped in collapsible desktop sections.
- **Plan review controls** — while reviewing a native plan, users can copy the
  full plan and switch among models actually returned by the active kernel
  session before execution.

## Verification

The release candidate has passed the source lock, patch apply, kernel build,
ACP no-model-request probes, the authenticated 1.0.0 route regression,
TypeScript/stage tests, Rust tests/check, and arm64 App-only bundle
verification. See
[`docs/VALIDATION_EVIDENCE.md`](VALIDATION_EVIDENCE.md) for commands and
hashes.

## Honest boundaries

- A real authenticated prompt was attempted with a disposable copy and reached
  the provider, which returned `403 Forbidden: Grok Build is coming soon. You
  don't have access now.` for this account. Provider quota fields, third-party
  endpoint inference, and microphone transcription still require a
  user-authorized acceptance run in an account with Grok Build inference
  access. The candidate does not fabricate those results.
- Calendar, Slack, Feishu, Notion and Drive remain clearly marked Soon until a
  complete official authorization chain exists.
- The candidate is macOS Apple Silicon and normally ad-hoc signed. A published
  DMG, tag and GitHub Release are deliberately separate release actions.
- The public-release gate also requires recorded real-reply, clean-install,
  third-party-model and microphone acceptance evidence; a green local build
  alone cannot enable publication.

## Install after publication

After the release is approved, download `gorkX_1.2.0_aarch64.dmg` from the
GitHub Release, drag gorkX into Applications, and use **Open Anyway** if the
ad-hoc signature is blocked by Gatekeeper.
