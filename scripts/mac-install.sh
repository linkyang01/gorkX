#!/usr/bin/env bash
# Build gorkX and install to ~/Applications (ad-hoc signed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"

cd "$ROOT/apps/desktop"
npm install
npm run tauri build -- --bundles app

APP_SRC="$ROOT/apps/desktop/src-tauri/target/release/bundle/macos/gorkX.app"
DEST_DIR="${GORKX_INSTALL_DIR:-$HOME/Applications}"
APP_DEST="$DEST_DIR/gorkX.app"

if [[ ! -d "$APP_SRC" ]]; then
  echo "Build failed: $APP_SRC not found" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
# quit if running
osascript -e 'tell application id "app.gorkx.desktop" to quit' >/dev/null 2>&1 || true
rm -rf "$APP_DEST"
ditto "$APP_SRC" "$APP_DEST"

# re-register with LaunchServices
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f "$APP_DEST" >/dev/null 2>&1 || true

echo "Installed: $APP_DEST"
echo "Open with: open \"$APP_DEST\""
echo "If Gatekeeper blocks: xattr -dr com.apple.quarantine \"$APP_DEST\""

open "$APP_DEST" 2>/dev/null || true
