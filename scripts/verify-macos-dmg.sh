#!/usr/bin/env bash
# Mount and verify the exact public DMG without installing or launching it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dmg_input="${1:?usage: scripts/verify-macos-dmg.sh /path/to/gorkX_X.Y.Z_aarch64.dmg}"
expected_version="${GORKX_EXPECTED_APP_VERSION:-}"

if [[ ! -f "$dmg_input" ]]; then
  echo "DMG not found: $dmg_input" >&2
  exit 2
fi

dmg_parent="$(cd "$(dirname "$dmg_input")" && pwd -P)"
dmg_path="$dmg_parent/$(basename "$dmg_input")"
mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/gorkx-dmg-verify.XXXXXX")"
attached=0

cleanup() {
  if [[ "$attached" == "1" ]]; then
    hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf "$mount_dir"
}
trap cleanup EXIT

hdiutil attach "$dmg_path" -readonly -nobrowse -mountpoint "$mount_dir" -quiet
attached=1

app_path="$mount_dir/gorkX.app"
if [[ ! -d "$app_path/Contents" ]]; then
  echo "Mounted DMG does not contain gorkX.app at its root" >&2
  exit 3
fi

GORKX_EXPECTED_APP_VERSION="$expected_version" "$root/scripts/verify-macos-app-bundle.sh" "$app_path"
"$root/scripts/verify-macos-signing.sh" "$app_path"

echo "PASS: mounted DMG app verified"
echo "SHA256=$(shasum -a 256 "$dmg_path" | awk '{print $1}')"
