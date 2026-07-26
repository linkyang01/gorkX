# gorkX 0.5.0 Beta

gorkX 0.5.0 Beta makes Grok Build's agent capabilities more usable from a
Chinese-first desktop workflow, while keeping the engine, permissions and data
boundaries visible.

## Highlights

- Bundled **Grok Build 0.2.112**, with App-owned `HOME` and `GROK_HOME` so a
  normal installation does not inherit unrelated local Grok or agent settings.
- More capabilities are now desktop actions rather than command syntax:
  task information, recap, deep research, feedback, loops, goals, workflows,
  live engine actions, session fork/rewind, session diagnostics, and managed
  configuration.
- Safe checkpoint rewind: preview first, then explicit confirmation; conflicts
  require an additional acknowledgement before a forced restore.
- Real browser GitHub Device Flow, Review reads for PRs/checks/comments, and
  confirmation-gated PR/comment writes.
- Composer drafts stay isolated by project. Returned files and media appear in
  a dedicated Deliverables view instead of being guessed from a folder.
- Managed configuration is previewed first; installation is enabled only after
  a successful preview and a second confirmation.
- Diagnostics can be exported locally or sent to Grok support only after a
  dedicated privacy confirmation.
- A live Grok Build model list, secure custom-provider configuration, Keychain
  secret storage, model test controls, and local daily ACP token accounting.
- Computer Hub controls are available only when the server/account supports
  them and every project-exposure action is explicitly confirmed.

## Important Beta boundaries

- gorkX never treats a ChatGPT Plus or Claude Pro web subscription as an API
  login. Third-party providers require a user-configured API or compatible
  endpoint.
- The local token record is not a subscription quota or cost meter. When Grok
  does not return an authoritative subscription percentage, gorkX links to the
  official signed-in Usage page instead.
- Native macOS voice capture is wired to Grok Build and never auto-sends text;
  individual macOS microphone permission and spoken-transcript acceptance
  remain environment-specific.
- Computer Hub, image/video generation, hooks and remote services remain
  account/server-gated where Grok Build itself gates them.

## Install

Download `gorkX_0.5.0_aarch64.dmg`, open it, drag **gorkX** to Applications,
then launch the app. macOS 12+ and Apple Silicon are required.

See [FEATURES.md](FEATURES.md) for the exact capability matrix and
[NEXT_RELEASE_GATES.md](NEXT_RELEASE_GATES.md) for remaining Beta acceptance
work.
