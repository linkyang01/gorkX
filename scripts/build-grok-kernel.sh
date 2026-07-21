#!/usr/bin/env bash
# Build the exact Grok Build revision locked by kernel/grok-build.lock.toml.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
lock="$root/kernel/grok-build.lock.toml"
source_dir="${GORKX_KERNEL_SOURCE:-$root/vendor/grok-build}"
base_source_dir="$source_dir"
patch_series="$root/kernel/patches/series"
out="${1:-$root/apps/desktop/src-tauri/resources/grok}"
expected="$(sed -n 's/^commit = "\([0-9a-f]*\)"/\1/p' "$lock")"
package="$(sed -n 's/^package = "\([^"]*\)"/\1/p' "$lock")"
binary="$(sed -n 's/^binary = "\([^"]*\)"/\1/p' "$lock")"
license_hash="$(sed -n 's/^license_sha256 = "\([0-9a-f]*\)"/\1/p' "$lock")"
notices_hash="$(sed -n 's/^third_party_notices_sha256 = "\([0-9a-f]*\)"/\1/p' "$lock")"

[[ -n "$expected" && -n "$package" && -n "$binary" && -n "$license_hash" && -n "$notices_hash" ]] || { echo "Invalid kernel lock: $lock" >&2; exit 2; }
command -v cargo >/dev/null || { echo "Rust cargo is required to build Grok Build." >&2; exit 2; }
command -v dotslash >/dev/null || { echo "Grok Build requires dotslash for its pinned protoc; run: cargo install dotslash" >&2; exit 2; }
[[ -f "$patch_series" ]] || { echo "Missing kernel patch series: $patch_series" >&2; exit 2; }
hash_file() {
  if command -v shasum >/dev/null; then shasum -a 256 "$1" | awk '{print $1}';
  else sha256sum "$1" | awk '{print $1}'; fi
}
"$root/scripts/verify-grok-kernel-patches.sh" "$source_dir"
actual="$expected"
patches=()
while IFS= read -r name; do
  patches+=("$name")
done < <(sed -e 's/#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$patch_series" | sed '/^$/d')
patch_worktree=""
cleanup_patch_worktree() {
  if [[ -n "$patch_worktree" ]]; then
    git -C "$base_source_dir" worktree remove --force "$patch_worktree" >/dev/null 2>&1 || rm -rf "$patch_worktree"
  fi
}
trap cleanup_patch_worktree EXIT
if [[ ${#patches[@]} -gt 0 ]]; then
  patch_worktree="$(mktemp -d "${TMPDIR:-/tmp}/gorkx-kernel-patches.XXXXXX")"
  rm -rf "$patch_worktree"
  git -C "$source_dir" worktree add --detach "$patch_worktree" "$expected" >/dev/null
  for name in "${patches[@]}"; do
    git -C "$patch_worktree" apply "$root/kernel/patches/$name"
  done
  source_dir="$patch_worktree"
  echo "Applied ${#patches[@]} recorded kernel patch(es) in temporary worktree"
fi
# Keep compiler and build-script diagnostics visible: a source lock is not a
# verified runtime until this exact build has produced its binary and notices.
cargo build --manifest-path "$source_dir/Cargo.toml" -p "$package" --release
# CI and local verification may isolate Cargo output with CARGO_TARGET_DIR.
# Resolve the artifact from that directory instead of assuming a source-local
# `target/`, while retaining the normal Cargo default when it is unset.
target_dir="${CARGO_TARGET_DIR:-$source_dir/target}"
artifact="$target_dir/release/$binary"
[[ -x "$artifact" ]] || { echo "Expected built binary missing: $artifact" >&2; exit 5; }
[[ -f "$source_dir/LICENSE" ]] || { echo "Missing upstream LICENSE: $source_dir/LICENSE" >&2; exit 6; }
[[ -f "$source_dir/THIRD-PARTY-NOTICES" ]] || { echo "Missing upstream third-party notices: $source_dir/THIRD-PARTY-NOTICES" >&2; exit 6; }
[[ "$(hash_file "$source_dir/LICENSE")" == "$license_hash" ]] || { echo "Upstream LICENSE does not match kernel lock" >&2; exit 6; }
[[ "$(hash_file "$source_dir/THIRD-PARTY-NOTICES")" == "$notices_hash" ]] || { echo "Upstream third-party notices do not match kernel lock" >&2; exit 6; }
mkdir -p "$(dirname "$out")"
install -m 755 "$artifact" "$out"
install -m 644 "$source_dir/LICENSE" "$out-LICENSE"
install -m 644 "$source_dir/THIRD-PARTY-NOTICES" "$out-THIRD-PARTY-NOTICES"
echo "Built locked Grok Build $actual → $out"
echo "Bundled upstream notices → $out-LICENSE, $out-THIRD-PARTY-NOTICES"
