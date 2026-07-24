#!/usr/bin/env bash
# Build the locked Grok Build source and prove its no-login ACP baseline.
#
# This intentionally does not replace the app's bundled binary.  It is a
# source-build acceptance gate: run it before deciding to update a bundle.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
lock="$root/kernel/grok-build.lock.toml"
expected_version="$(sed -n 's/^version = "\([^"]*\)"/\1/p' "$lock")"

[[ -n "$expected_version" ]] || { echo "Invalid kernel lock: $lock" >&2; exit 2; }

if [[ $# -gt 1 ]]; then
  echo "usage: $0 [output-path]" >&2
  exit 2
fi

if [[ $# -eq 1 ]]; then
  out="$1"
else
  verification_dir="$(mktemp -d "${TMPDIR:-/tmp}/gorkx-kernel-build-verify.XXXXXX")"
  out="$verification_dir/grok"
fi

"$root/scripts/verify-grok-kernel-source.sh"
"$root/scripts/verify-grok-kernel-patches.sh"
"$root/scripts/build-grok-kernel.sh" "$out"

actual_version="$("$out" --version)"
[[ "$actual_version" == "$expected_version"* ]] || {
  echo "Built kernel reports '$actual_version'; lock requires '$expected_version'" >&2
  exit 3
}
echo "PASS: locked kernel version ($actual_version)"

# This runs without user credentials or the user's GROK_HOME and exercises the
# exact stdio initialization contract the desktop client relies on.
node "$root/scripts/verify-grok-acp.mjs" "$out"
echo "PASS: locked source-build ACP baseline ($out)"
