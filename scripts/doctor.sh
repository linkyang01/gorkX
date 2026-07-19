#!/usr/bin/env bash
# gorkX environment doctor — only reports the app-owned engine/data contract.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
lock="$root/kernel/grok-build.lock.toml"
engine="${GORKX_ENGINE_BIN:-$root/apps/desktop/src-tauri/resources/grok}"
default_home="$HOME/Library/Application Support/gorkX/grok-home"
grok_home="${GORKX_GROK_HOME:-${GROK_HOME:-$default_home}}"
locked_commit="$(sed -n 's/^commit = "\([0-9a-f]*\)"/\1/p' "$lock")"

echo "=== gorkX doctor ==="
echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "kernel source lock: ${locked_commit:-missing}"
echo "kernel path: $engine"
if [[ -x "$engine" ]]; then
  echo "kernel version: $($engine --version 2>&1 | head -1)"
else
  echo "kernel: NOT FOUND at app resource path"
  echo "  build a controlled resource: scripts/build-grok-kernel.sh <output>"
fi

echo
echo "App GROK_HOME: $grok_home"
if [[ -d "$grok_home" ]]; then
  echo "data folder: present"
  if [[ -w "$grok_home" ]]; then
    echo "data folder access: writable by this shell"
  else
    echo "data folder access: not writable by this shell (the desktop app may run with different sandbox permissions)"
  fi
else
  echo "data folder: absent (it is created on first app launch)"
fi
if [[ -s "$grok_home/auth.json" ]]; then
  echo "auth: cached App login present"
elif [[ -n "${XAI_API_KEY:-}" ]]; then
  echo "auth: XAI_API_KEY is set for this shell (not inspected)"
else
  echo "auth: no App login found — sign in from gorkX Settings"
fi

echo
echo "node: $(node -v 2>/dev/null || echo missing)"
echo "npm:  $(npm -v 2>/dev/null || echo missing)"
echo "rustc: $(rustc --version 2>/dev/null || echo missing)"
echo "cargo: $(cargo --version 2>/dev/null || echo missing)"

source_dir="${GORKX_KERNEL_SOURCE:-$root/vendor/grok-build}"
echo
if [[ -d "$source_dir/.git" ]]; then
  echo "locked source checkout: $source_dir"
  "$root/scripts/verify-grok-kernel-source.sh" "$source_dir"
else
  echo "locked source checkout: absent ($source_dir)"
  echo "  materialize it with: scripts/sync-grok-kernel-source.sh"
fi

echo
echo "upgrade rule: do not run grok update; sync the lock, build, and run ACP gates"
echo "done."
