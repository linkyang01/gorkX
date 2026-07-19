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
license_hash="$(sed -n 's/^license_sha256 = "\([0-9a-f]*\)"/\1/p' "$lock")"
notices_hash="$(sed -n 's/^third_party_notices_sha256 = "\([0-9a-f]*\)"/\1/p' "$lock")"

[[ -n "$expected" && -n "$package" && -n "$binary" && -n "$license_hash" && -n "$notices_hash" ]] || { echo "Invalid kernel lock: $lock" >&2; exit 2; }
command -v cargo >/dev/null || { echo "Rust cargo is required to build Grok Build." >&2; exit 2; }
command -v dotslash >/dev/null || { echo "Grok Build requires dotslash for its pinned protoc; run: cargo install dotslash" >&2; exit 2; }
hash_file() {
  if command -v shasum >/dev/null; then shasum -a 256 "$1" | awk '{print $1}';
  else sha256sum "$1" | awk '{print $1}'; fi
}
"$root/scripts/verify-grok-kernel-source.sh" "$source_dir"
actual="$expected"
cargo build --quiet --manifest-path "$source_dir/Cargo.toml" -p "$package" --release
artifact="$source_dir/target/release/$binary"
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
