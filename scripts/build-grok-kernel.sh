#!/usr/bin/env bash
# Build the exact Grok Build revision locked by kernel/grok-build.lock.toml.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
lock="$root/kernel/grok-build.lock.toml"
source_dir="${GORKX_KERNEL_SOURCE:-$root/vendor/grok-build}"
out="${1:-$root/apps/desktop/src-tauri/resources/grok}"
expected="$(sed -n 's/^commit = "\([0-9a-f]*\)"/\1/p' "$lock")"
package="$(sed -n 's/^package = "\([^"]*\)"/\1/p' "$lock")"
binary="$(sed -n 's/^binary = "\([^"]*\)"/\1/p' "$lock")"

[[ -n "$expected" && -n "$package" && -n "$binary" ]] || { echo "Invalid kernel lock: $lock" >&2; exit 2; }
[[ -d "$source_dir/.git" ]] || { echo "Missing Grok Build checkout: $source_dir" >&2; exit 2; }
command -v cargo >/dev/null || { echo "Rust cargo is required to build Grok Build." >&2; exit 2; }
command -v dotslash >/dev/null || { echo "Grok Build requires dotslash for its pinned protoc; run: cargo install dotslash" >&2; exit 2; }
actual="$(git -C "$source_dir" rev-parse HEAD)"
[[ "$actual" == "$expected" ]] || { echo "Kernel checkout is $actual; lock requires $expected" >&2; exit 3; }

git -C "$source_dir" diff --exit-code -- . ':(exclude)target' >/dev/null || { echo "Kernel checkout has uncommitted changes; record them as patches first." >&2; exit 4; }
cargo build --quiet --manifest-path "$source_dir/Cargo.toml" -p "$package" --release
artifact="$source_dir/target/release/$binary"
[[ -x "$artifact" ]] || { echo "Expected built binary missing: $artifact" >&2; exit 5; }
mkdir -p "$(dirname "$out")"
install -m 755 "$artifact" "$out"
echo "Built locked Grok Build $actual → $out"
