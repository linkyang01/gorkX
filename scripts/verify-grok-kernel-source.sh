#!/usr/bin/env bash
# Verify source provenance before compiling a Grok Build kernel.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
lock="$root/kernel/grok-build.lock.toml"
source_dir="${1:-${GORKX_KERNEL_SOURCE:-$root/vendor/grok-build}}"
repository="$(sed -n 's/^repository = "\([^"]*\)"/\1/p' "$lock")"
expected="$(sed -n 's/^commit = "\([0-9a-f]*\)"/\1/p' "$lock")"

[[ -n "$repository" && -n "$expected" ]] || { echo "Invalid kernel lock: $lock" >&2; exit 2; }
[[ -d "$source_dir/.git" ]] || { echo "Missing Grok Build checkout: $source_dir" >&2; exit 2; }

actual_remote="$(git -C "$source_dir" remote get-url origin)"
[[ "$actual_remote" == "$repository" ]] || {
  echo "Kernel origin is $actual_remote; lock requires $repository" >&2
  exit 3
}
actual="$(git -C "$source_dir" rev-parse HEAD)"
[[ "$actual" == "$expected" ]] || {
  echo "Kernel checkout is $actual; lock requires $expected" >&2
  exit 4
}
git -C "$source_dir" diff --exit-code -- . ':(exclude)target' >/dev/null || {
  echo "Kernel checkout has uncommitted changes; record them as patches first." >&2
  exit 5
}

echo "PASS: locked Grok Build source ($actual)"
