#!/usr/bin/env bash
# Build gorkX .app with the pinned open-source Grok Build engine.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

DESKTOP="$ROOT/apps/desktop"
RESOURCES_BIN="$DESKTOP/src-tauri/resources/grok"

bundle_engine() {
  "$ROOT/scripts/build-grok-kernel.sh" "$RESOURCES_BIN"
}

bundle_engine

cd "$DESKTOP"
npm install
# Tauri bundle.resources maps src-tauri/resources/* into Contents/Resources
npm run tauri build -- --bundles app

echo
echo "Bundle (if success):"
find src-tauri/target/release/bundle -name '*.app' 2>/dev/null || true
echo "Tip: first open may need: xattr -dr com.apple.quarantine <App>.app"
echo "Engine in app: Contents/Resources/grok (if bundled)"
echo "GROK_HOME default: ~/Library/Application Support/gorkX/grok-home"
