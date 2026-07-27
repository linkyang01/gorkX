#!/usr/bin/env bash
# Verify an already-built gorkX.app without launching its UI or touching ~/.grok.
set -euo pipefail

app_path="${1:?usage: scripts/verify-macos-app-bundle.sh /path/to/gorkX.app}"
engine="$app_path/Contents/Resources/grok"
engine_license="$app_path/Contents/Resources/grok-LICENSE"
engine_notices="$app_path/Contents/Resources/grok-THIRD-PARTY-NOTICES"

if [[ ! -d "$app_path/Contents" ]]; then
  echo "Not a macOS app bundle: $app_path" >&2
  exit 2
fi
if [[ ! -f "$engine" || ! -x "$engine" ]]; then
  echo "Missing executable bundled engine: $engine" >&2
  exit 3
fi
if [[ ! -s "$engine_license" || ! -s "$engine_notices" ]]; then
  echo "Missing bundled Grok Build license notices" >&2
  exit 3
fi

exe="$(find "$app_path/Contents/MacOS" -type f -perm +111 2>/dev/null | head -1 || true)"
if [[ -n "$exe" ]]; then
  echo "PASS: main binary: $(file -b "$exe")"
fi
echo "PASS: engine binary: $(file -b "$engine")"
echo "PASS: host arch: $(uname -m)"

probe_dir="$(mktemp -d "${TMPDIR:-/tmp}/gorkx-bundle-check.XXXXXX")"
trap 'rm -rf "$probe_dir"' EXIT
version="$(GROK_HOME="$probe_dir/grok-home" "$engine" --version 2>&1)"
if [[ -z "$version" ]]; then
  echo "Bundled engine returned no version" >&2
  exit 4
fi

echo "PASS: bundled engine: $engine"
echo "PASS: bundled Grok Build license notices"
echo "PASS: isolated GROK_HOME: $probe_dir/grok-home"
echo "PASS: version: $version"
