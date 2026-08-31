#!/usr/bin/env bash
# Fail-closed dependency security gate.
#
# This script deliberately does not claim that a local lockfile is safe when
# the advisory databases or scanners are unavailable. Install the mature
# scanners in the developer/CI environment, then run this gate from the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/apps/desktop"
RUST="$DESKTOP/src-tauri"
missing=0

echo "=== gorkX supply-chain gate ==="
echo "npm lockfile: $DESKTOP/package-lock.json"
echo "cargo lockfile: $RUST/Cargo.lock"

if command -v cargo-deny >/dev/null 2>&1; then
  (cd "$ROOT" && cargo deny check --manifest-path "$RUST/Cargo.toml")
  echo "PASS: cargo-deny advisories, bans, licenses and sources"
else
  echo "BLOCKED: cargo-deny is not installed; refusing to claim Rust dependency safety" >&2
  missing=1
fi

if command -v osv-scanner >/dev/null 2>&1; then
  osv-scanner scan source \
    --lockfile="$DESKTOP/package-lock.json" \
    --lockfile="$RUST/Cargo.lock"
  echo "PASS: OSV-Scanner npm and Cargo lockfiles"
else
  echo "BLOCKED: osv-scanner is not installed; refusing to claim dependency vulnerability coverage" >&2
  missing=1
fi

if command -v cargo-audit >/dev/null 2>&1 || command -v cargo >/dev/null 2>&1 && cargo audit --version >/dev/null 2>&1; then
  cargo audit --file "$RUST/Cargo.lock"
  echo "PASS: RustSec cargo-audit"
else
  echo "INFO: cargo-audit is not installed; cargo-deny and OSV-Scanner remain the required gates" >&2
fi

if (( missing != 0 )); then
  exit 2
fi
