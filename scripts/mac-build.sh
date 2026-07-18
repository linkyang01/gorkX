#!/usr/bin/env bash
# Build gorkX .app and bundle open-source Grok Build engine (not "user installs CLI").
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

DESKTOP="$ROOT/apps/desktop"
RESOURCES_BIN="$DESKTOP/src-tauri/resources/grok"
RUNTIME_DIR="${HOME}/Library/Application Support/gorkX/runtime"

bundle_engine() {
  local src=""
  if [[ -n "${GORKX_ENGINE_BIN:-}" && -f "${GORKX_ENGINE_BIN}" ]]; then
    src="$GORKX_ENGINE_BIN"
  elif [[ -f "$HOME/.grok/bin/grok" ]]; then
    src="$HOME/.grok/bin/grok"
  elif command -v grok >/dev/null 2>&1; then
    src="$(command -v grok)"
  elif [[ -f "$HOME/projects/grok-build/target/release/xai-grok-pager" ]]; then
    src="$HOME/projects/grok-build/target/release/xai-grok-pager"
  fi

  mkdir -p "$(dirname "$RESOURCES_BIN")"
  mkdir -p "$RUNTIME_DIR"

  if [[ -n "$src" ]]; then
    echo "Bundling engine from: $src"
    cp -f "$src" "$RESOURCES_BIN"
    chmod +x "$RESOURCES_BIN"
    cp -f "$src" "$RUNTIME_DIR/grok"
    chmod +x "$RUNTIME_DIR/grok"
    echo "  → $RESOURCES_BIN"
    echo "  → $RUNTIME_DIR/grok"
  else
    echo "WARNING: No Grok engine binary found to bundle."
    echo "  Set GORKX_ENGINE_BIN=/path/to/grok or build xai-org/grok-build,"
    echo "  or install once so ~/.grok/bin/grok exists for packaging."
    echo "  Product goal: ship engine inside the .app (Resources/grok)."
  fi
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
