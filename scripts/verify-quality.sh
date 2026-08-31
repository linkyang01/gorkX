#!/usr/bin/env bash
# Reproducible source-quality gate. It never tags, publishes, builds a DMG, or
# changes the bundled kernel. Release packaging remains a separate explicit
# owner action after these checks and the real-device gates.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/apps/desktop"
RUST="$DESKTOP/src-tauri"
CARGO_FLAGS=(--locked)
if [[ "${GORKX_CARGO_OFFLINE:-0}" == "1" ]]; then
  CARGO_FLAGS+=(--offline)
fi

echo "=== gorkX source quality ==="
(cd "$DESKTOP" && npm run test:stages)
(cd "$DESKTOP" && npm run typecheck)
(cd "$DESKTOP" && npm run build)
"$ROOT/scripts/verify-desktop-web-build.sh"
cargo fmt --manifest-path "$RUST/Cargo.toml" --all -- --check
cargo check --manifest-path "$RUST/Cargo.toml" "${CARGO_FLAGS[@]}"
cargo clippy --manifest-path "$RUST/Cargo.toml" --lib --all-targets "${CARGO_FLAGS[@]}" -- -D warnings
cargo test --manifest-path "$RUST/Cargo.toml" --lib "${CARGO_FLAGS[@]}"
"$ROOT/scripts/verify-supply-chain.sh"
echo "PASS: gorkX source-quality gate"
