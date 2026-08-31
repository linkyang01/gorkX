#!/usr/bin/env bash
# Strict macOS release-signing gate. Ad-hoc signatures are intentionally not
# accepted here; the limited arm64_adhoc candidate gate remains separate.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 /absolute/path/to/gorkX.app" >&2
  exit 2
fi

app="$1"
if [[ "$app" != /* || "$app" != *.app || ! -d "$app/Contents" ]]; then
  echo "BLOCKED: expected an absolute macOS .app bundle: $app" >&2
  exit 2
fi
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "BLOCKED: Developer ID and notarization verification requires macOS" >&2
  exit 2
fi
command -v codesign >/dev/null 2>&1 || {
  echo "BLOCKED: codesign is unavailable" >&2
  exit 2
}
command -v spctl >/dev/null 2>&1 || {
  echo "BLOCKED: spctl is unavailable" >&2
  exit 2
}

codesign --verify --deep --strict --verbose=2 "$app"
details="$(codesign --display --verbose=4 "$app" 2>&1)"
if grep -Eiq 'Signature=adhoc|Authority=adhoc' <<<"$details"; then
  echo "BLOCKED: ad-hoc signature is not a distributable release signature" >&2
  exit 3
fi
grep -Eq '^Authority=Developer ID Application:' <<<"$details" || {
  echo "BLOCKED: missing Developer ID Application authority" >&2
  exit 3
}
grep -Eq '^TeamIdentifier=[A-Z0-9]+' <<<"$details" || {
  echo "BLOCKED: missing Apple team identifier" >&2
  exit 3
}

# Gatekeeper assessment is deliberately required after codesign. A valid
# local signature alone does not prove the notarized artifact opens cleanly.
spctl --assess --type execute --verbose=4 "$app"
echo "PASS: Developer ID signed and Gatekeeper-assessed app bundle ($app)"
