# gorkX Grok Build patches

Each kernel patch must be one numbered `.patch` file with a short companion
Markdown note covering: upstream commit, reason, affected ACP behavior, risk,
and regression command. Add the patch filename once to `series`; build order is
the line order in that file. Do not patch a bundled binary in place.

No gorkX patches are applied at the current source lock. When `series` is
non-empty, `scripts/verify-grok-kernel-patches.sh` first checks every patch
against the clean locked checkout. `scripts/build-grok-kernel.sh` then creates
a temporary detached Git worktree, applies exactly that reviewed series there,
and builds only from it. The source checkout remains clean; unrecorded edits
cannot become a release kernel.

## Build prerequisites

Install a current Rust toolchain and `dotslash` (`cargo install dotslash`). The
upstream's pinned protobuf compiler is launched through dotslash; the gorkX
build gate rejects an environment that lacks it before compiling.

Use `scripts/sync-grok-kernel-source.sh` to create or refresh the ignored
`vendor/grok-build` checkout from the pinned upstream commit. It refuses an
unexpected origin or local source edits.
