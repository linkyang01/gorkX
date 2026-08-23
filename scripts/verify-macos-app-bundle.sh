#!/usr/bin/env bash
# Verify an already-built gorkX.app without launching its UI or touching ~/.grok.
set -euo pipefail

app_input="${1:?usage: scripts/verify-macos-app-bundle.sh /path/to/gorkX.app}"

if [[ ! -d "$app_input/Contents" ]]; then
  echo "Not a macOS app bundle: $app_input" >&2
  exit 2
fi

app_parent="$(cd "$(dirname "$app_input")" && pwd -P)"
app_path="$app_parent/$(basename "$app_input")"
expected_app_version="${GORKX_EXPECTED_APP_VERSION:-}"
engine="$app_path/Contents/Resources/grok"
engine_license="$app_path/Contents/Resources/grok-LICENSE"
engine_notices="$app_path/Contents/Resources/grok-THIRD-PARTY-NOTICES"
info_plist="$app_path/Contents/Info.plist"

if [[ ! -f "$engine" || ! -x "$engine" ]]; then
  echo "Missing executable bundled engine: $engine" >&2
  exit 3
fi
if [[ ! -s "$engine_license" || ! -s "$engine_notices" ]]; then
  echo "Missing bundled Grok Build license notices" >&2
  exit 3
fi
if [[ ! -s "$info_plist" ]]; then
  echo "Missing app Info.plist: $info_plist" >&2
  exit 3
fi

bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$info_plist" 2>/dev/null || true)"
if [[ -z "$bundle_version" ]]; then
  echo "Missing CFBundleShortVersionString in: $info_plist" >&2
  exit 3
fi
if [[ -n "$expected_app_version" && "$bundle_version" != "$expected_app_version" ]]; then
  echo "App version mismatch: expected $expected_app_version, bundle reports $bundle_version" >&2
  exit 3
fi

exe="$(find "$app_path/Contents/MacOS" -type f -perm +111 2>/dev/null | head -1 || true)"
if [[ -z "$exe" ]]; then
  echo "Missing executable app binary under: $app_path/Contents/MacOS" >&2
  exit 3
fi

command -v lipo >/dev/null || { echo "Apple lipo is required to verify bundle architectures" >&2; exit 3; }
main_archs="$(lipo -archs "$exe" 2>/dev/null || true)"
engine_archs="$(lipo -archs "$engine" 2>/dev/null || true)"
if [[ -z "$main_archs" || -z "$engine_archs" ]]; then
  echo "Unable to read Mach-O architectures from app or bundled engine" >&2
  exit 3
fi
for arch in $main_archs; do
  if [[ " $engine_archs " != *" $arch "* ]]; then
    echo "Architecture mismatch: app requires $arch but bundled engine has: $engine_archs" >&2
    exit 3
  fi
done

echo "PASS: main binary: $(file -b "$exe")"
echo "PASS: engine binary: $(file -b "$engine")"
echo "PASS: bundled architectures: main=$main_archs engine=$engine_archs"
echo "PASS: app version: $bundle_version"
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
