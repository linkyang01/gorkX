# gorkX Grok Build patches

Each kernel patch must be one numbered `.patch` file with a short companion
Markdown note covering: upstream commit, reason, affected ACP behavior, risk,
and regression command. Do not patch a bundled binary in place.

No gorkX patches are applied at the current source lock. A patch queue is not
silently applied by the build script: when the first patch is needed, add its
reviewed application/verification rule here and extend the source verifier
before changing the lock. This prevents an unrecorded dirty checkout from
becoming a release kernel.

## Build prerequisites

Install a current Rust toolchain and `dotslash` (`cargo install dotslash`). The
upstream's pinned protobuf compiler is launched through dotslash; the gorkX
build gate rejects an environment that lacks it before compiling.

Use `scripts/sync-grok-kernel-source.sh` to create or refresh the ignored
`vendor/grok-build` checkout from the pinned upstream commit. It refuses an
unexpected origin or local source edits.
