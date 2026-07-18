#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
[[ -f "$HOME/.cargo/env" ]] && source "$HOME/.cargo/env"
cd "$ROOT/apps/desktop"
if [[ ! -d node_modules ]]; then
  npm install
fi
exec npm run tauri dev
