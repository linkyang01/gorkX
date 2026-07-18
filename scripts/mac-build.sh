#!/usr/bin/env bash
# Build gorkX .app (ad-hoc sign). Requires Rust + Node + Tauri macOS deps.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
cd "$ROOT/apps/desktop"
npm install
npm run tauri build -- --bundles app
echo
echo "Bundle (if success):"
find src-tauri/target/release/bundle -name '*.app' 2>/dev/null || true
echo "Tip: first open may need: xattr -dr com.apple.quarantine <App>.app"
