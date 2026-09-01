#!/usr/bin/env bash
# Build a macOS DMG while preserving the embedded app code signature.
# Tauri's generated create-dmg script may use /Volumes and can leave
# com.apple.FinderInfo on HFS+ copies; that metadata makes codesign reject
# an otherwise valid app after the DMG is mounted.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/apps/desktop"
DEFAULT_APP="$DESKTOP/src-tauri/target/release/bundle/macos/gorkX.app"
APP_PATH="${1:-$DEFAULT_APP}"

if [[ ! -d "$APP_PATH/Contents" ]]; then
  echo "App bundle not found: $APP_PATH" >&2
  exit 2
fi

APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print:CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist")"
OUTPUT_PATH="${2:-$DESKTOP/src-tauri/target/release/bundle/dmg/gorkX_${APP_VERSION}_aarch64.dmg}"
if [[ "${OUTPUT_PATH: -4}" != ".dmg" ]]; then
  echo "Output file name must end with .dmg: $OUTPUT_PATH" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
GORKX_EXPECTED_APP_VERSION="$APP_VERSION" "$ROOT/scripts/verify-macos-app-bundle.sh" "$APP_PATH"

WORK_DIR="$(mktemp -d /private/tmp/gorkx-dmg-build.XXXXXX)"
MOUNT_DIR="$WORK_DIR/mount"
STAGING_DIR="$WORK_DIR/staging"
RW_IMAGE="$WORK_DIR/interstitial.dmg"
DEVICE=""
mkdir -p "$MOUNT_DIR" "$STAGING_DIR"

cleanup() {
  if [[ -n "$DEVICE" ]]; then
    hdiutil detach "$DEVICE" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT

ditto "$APP_PATH" "$STAGING_DIR/gorkX.app"
hdiutil create -srcfolder "$STAGING_DIR" -volname "gorkX_${APP_VERSION}" \
  -fs HFS+ -format UDRW "$RW_IMAGE"

attach_output="$(hdiutil attach -mountpoint "$MOUNT_DIR" -readwrite -noverify \
  -noautoopen -nobrowse "$RW_IMAGE")"
DEVICE="$(printf '%s\n' "$attach_output" | sed -n 's#^\(/dev/[^[:space:]]*\).*#\1#p' | head -1)"
if [[ -z "$DEVICE" ]]; then
  echo "Could not identify the mounted interstitial disk image" >&2
  exit 3
fi

# HFS+ may add Finder metadata while copying the app into the image. Remove
# only metadata that codesign classifies as resource-fork/Finder detritus;
# leave the signed files and the provenance xattr untouched.
xattr -r -d com.apple.FinderInfo "$MOUNT_DIR/gorkX.app" 2>/dev/null || true
xattr -r -d com.apple.ResourceFork "$MOUNT_DIR/gorkX.app" 2>/dev/null || true
ln -s /Applications "$MOUNT_DIR/Applications"
chmod -Rf go-w "$MOUNT_DIR" || true
codesign --verify --deep --strict "$MOUNT_DIR/gorkX.app"

hdiutil detach "$DEVICE"
DEVICE=""
hdiutil convert "$RW_IMAGE" -format UDZO -imagekey zlib-level=9 -o "$OUTPUT_PATH"
hdiutil verify "$OUTPUT_PATH"
GORKX_EXPECTED_APP_VERSION="$APP_VERSION" "$ROOT/scripts/verify-macos-dmg.sh" "$OUTPUT_PATH"
echo "DMG=$OUTPUT_PATH"
echo "SHA256=$(shasum -a 256 "$OUTPUT_PATH" | awk '{print $1}')"
