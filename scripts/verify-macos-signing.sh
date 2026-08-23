#!/usr/bin/env bash
# Stage G: report codesign / Gatekeeper / arch for a built gorkX.app.
# Does not notarize or invent credentials. Exit 0 with report, or non-zero if bundle unusable.
set -euo pipefail

app_input="${1:?usage: scripts/verify-macos-signing.sh /path/to/gorkX.app}"

if [[ ! -d "$app_input/Contents" ]]; then
  echo "FAIL: not a macOS app bundle: $app_input" >&2
  exit 2
fi

# Apple tooling is inconsistent with relative bundle paths (notably
# `stapler validate`). Resolve the bundle once so every check observes the
# exact same target and reports an actionable path.
app_parent="$(cd "$(dirname "$app_input")" && pwd -P)"
app_path="$app_parent/$(basename "$app_input")"
codesign_report="$(mktemp -t gorkx-codesign.XXXXXX)"
trap 'rm -f "$codesign_report"' EXIT

exe="$(find "$app_path/Contents/MacOS" -type f -perm +111 2>/dev/null | head -1 || true)"
engine="$app_path/Contents/Resources/grok"

echo "=== gorkX macOS signing report ==="
echo "app: $app_path"
echo "host_arch: $(uname -m)"
echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

if [[ -n "$exe" ]]; then
  main_archs="$(lipo -archs "$exe" 2>/dev/null || true)"
  echo "main_binary: $exe"
  echo "main_file: $(file -b "$exe" 2>/dev/null || echo unknown)"
  echo "MAIN_ARCHS=${main_archs:-unknown}"
else
  echo "main_binary: MISSING" >&2
  exit 3
fi

if [[ -x "$engine" ]]; then
  engine_archs="$(lipo -archs "$engine" 2>/dev/null || true)"
  echo "engine_file: $(file -b "$engine" 2>/dev/null || echo unknown)"
  echo "ENGINE_ARCHS=${engine_archs:-unknown}"
else
  echo "engine: MISSING or not executable" >&2
  exit 3
fi

echo
echo "--- codesign ---"
if codesign -dv --verbose=2 "$app_path" 2>&1 | tee "$codesign_report"; then
  :
else
  echo "codesign -dv failed (unsigned or invalid)"
fi

authority="$(sed -n 's/^Authority=//p' "$codesign_report" | head -1 || true)"
signature_line="$(sed -n 's/^Signature=//p' "$codesign_report" | head -1 || true)"
echo "authority: ${authority:-none}"
echo "signature: ${signature_line:-none}"

level="none"
if [[ -n "$signature_line" || -n "$authority" ]]; then
  if [[ "${signature_line:-}" == "adhoc" || "${authority:-}" == *"adhoc"* || -z "$authority" ]]; then
    level="adhoc"
  elif [[ "${authority:-}" == *"Developer ID"* ]]; then
    level="developer_id"
  else
    level="adhoc"
  fi
fi

echo
echo "--- Gatekeeper (spctl) ---"
if spctl -a -vv "$app_path" 2>&1; then
  echo "spctl: accepted"
else
  echo "spctl: rejected or unavailable (expected for ad-hoc/unsigned local builds)"
fi

echo
echo "--- notarization staple (if any) ---"
if [[ "$level" == "developer_id" ]]; then
  if xcrun stapler validate "$app_path" 2>&1; then
    level="notarized"
    echo "stapler: valid"
  else
    echo "stapler: Developer ID signature present, but no valid notarization ticket"
  fi
else
  echo "stapler: skipped — notarization requires a Developer ID signature first"
fi

echo
echo "SIGNING_LEVEL=$level"
if [[ "$level" == "notarized" ]]; then
  echo "Gatekeeper download path: users should open without Terminal quarantine bypass"
else
  echo "Gatekeeper download path: NOT ready — need Developer ID + notarization for public DMG"
  echo "Local/dev tip (only if user chooses): xattr -dr com.apple.quarantine \"$app_path\""
fi

echo
echo "PASS: signing report complete (level=$level)"
exit 0
