# gorkX Grok Build patches

Each kernel patch must be one numbered `.patch` file with a short companion
Markdown note covering: upstream commit, reason, affected ACP behavior, risk,
and regression command. Do not patch a bundled binary in place.

No gorkX patches are applied at the current source lock.

## Build prerequisites

Install a current Rust toolchain and `dotslash` (`cargo install dotslash`). The
upstream's pinned protobuf compiler is launched through dotslash; the gorkX
build gate rejects an environment that lacks it before compiling.
