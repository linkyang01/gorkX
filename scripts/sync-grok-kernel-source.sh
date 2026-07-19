#!/usr/bin/env bash
# Materialize the exact Grok Build revision in kernel/grok-build.lock.toml.
# The checkout is intentionally untracked: source provenance lives in the lock.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
lock="$root/kernel/grok-build.lock.toml"
destination="${1:-$root/vendor/grok-build}"
repository="$(sed -n 's/^repository = "\([^"]*\)"/\1/p' "$lock")"
commit="$(sed -n 's/^commit = "\([0-9a-f]*\)"/\1/p' "$lock")"

[[ -n "$repository" && -n "$commit" ]] || { echo "Invalid kernel lock: $lock" >&2; exit 2; }
command -v git >/dev/null || { echo "git is required to sync Grok Build." >&2; exit 2; }

if [[ -e "$destination" && ! -d "$destination/.git" ]]; then
  echo "Kernel destination is not a git checkout: $destination" >&2
  exit 3
fi

if [[ ! -d "$destination/.git" ]]; then
  mkdir -p "$(dirname "$destination")"
  git clone --no-checkout "$repository" "$destination"
fi

actual_remote="$(git -C "$destination" remote get-url origin)"
[[ "$actual_remote" == "$repository" ]] || {
  echo "Kernel origin is $actual_remote; lock requires $repository" >&2
  exit 4
}

git -C "$destination" diff --quiet || {
  echo "Kernel checkout has uncommitted changes; record them as patches first." >&2
  exit 5
}
git -C "$destination" fetch --depth=1 origin "$commit"
git -C "$destination" checkout --detach --force FETCH_HEAD
actual="$(git -C "$destination" rev-parse HEAD)"
[[ "$actual" == "$commit" ]] || {
  echo "Kernel checkout is $actual; lock requires $commit" >&2
  exit 6
}

echo "Synced locked Grok Build $actual → $destination"
