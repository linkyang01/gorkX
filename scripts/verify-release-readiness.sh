#!/usr/bin/env bash
# Stage G: release-readiness orchestration.
# Never creates tags, GitHub Releases, or DMGs. See PRODUCT_DEVELOPMENT_PLAN §7.6.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/apps/desktop"
APP_DEFAULT="$DESKTOP/src-tauri/target/release/bundle/macos/gorkX.app"
APP_PATH="${GORKX_APP_PATH:-$APP_DEFAULT}"
USER_APPROVED_SHIP="${GORKX_USER_APPROVED_SHIP:-0}"

echo "=== gorkX release readiness ==="
echo "root: $ROOT"
echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "user_approved_ship: $USER_APPROVED_SHIP (only set GORKX_USER_APPROVED_SHIP=1 with explicit user approval)"
echo

stage_ok=0
bundle_ok=0
signing_level="none"
arch_host="$(uname -m)"

echo "--- Stage A–F tests ---"
if (cd "$DESKTOP" && npm run test:stages); then
  stage_ok=1
  echo "PASS: test:stages"
else
  echo "FAIL: test:stages" >&2
fi

echo
echo "--- Desktop typecheck + web build ---"
if (cd "$DESKTOP" && npm run typecheck && npm run build); then
  echo "PASS: typecheck + build"
else
  echo "FAIL: typecheck/build" >&2
  stage_ok=0
fi

echo
echo "--- App bundle engine ---"
if [[ -d "$APP_PATH" ]]; then
  if "$ROOT/scripts/verify-macos-app-bundle.sh" "$APP_PATH"; then
    bundle_ok=1
  fi
  if [[ -x "$ROOT/scripts/verify-macos-signing.sh" ]]; then
    signing_out="$("$ROOT/scripts/verify-macos-signing.sh" "$APP_PATH" 2>&1 || true)"
    printf '%s\n' "$signing_out"
    signing_level="$(printf '%s\n' "$signing_out" | sed -n 's/^SIGNING_LEVEL=//p' | tail -1)"
    signing_level="${signing_level:-none}"
  fi
else
  echo "SKIP: no app at $APP_PATH (build with scripts/mac-build.sh first)"
fi

echo
echo "--- doctor ---"
"$ROOT/scripts/doctor.sh" || true

echo
echo "--- host architecture ---"
echo "host: $arch_host"
echo "NOTE: dual-arch evidence needs separate arm64 and x86_64 install verifications."

echo
echo "--- Stage G matrix (honest) ---"
echo "macos: real track (signing/notarization may still be incomplete)"
echo "windows: trial — data dir / secrets / kernel / install-uninstall checklist not automated here"
echo "linux: eval — secrets/sandbox/desktop cost not approved for Beta"

echo
echo "--- public ship decision ---"
cd "$ROOT"
export STAGE_OK="$stage_ok" BUNDLE_OK="$bundle_ok" SL="$signing_level" ARCH="$arch_host"
export GORKX_USER_APPROVED_SHIP="$USER_APPROVED_SHIP"
node --experimental-strip-types -e '
import { evaluateReleaseGates } from "./apps/desktop/src/lib/releaseGates.ts";
const arch = process.env.ARCH || "";
const r = evaluateReleaseGates({
  stageTestsPass: process.env.STAGE_OK === "1",
  bundleEngineOk: process.env.BUNDLE_OK === "1",
  signingLevel: (process.env.SL || "none"),
  archVerified: arch === "arm64" || arch === "x86_64" ? [arch] : [],
  windowsTrialPassed: false,
  linuxBetaApproved: false,
  userApprovedShip: process.env.GORKX_USER_APPROVED_SHIP === "1",
});
console.log(JSON.stringify(r, null, 2));
if (!r.canShipPublicArtifacts) {
  console.log("\nNO PUBLIC SHIP: fix blockers or obtain explicit user approval for tag/Release/DMG.");
  process.exit(2);
}
console.log("\nPUBLIC SHIP ALLOWED by automated gates (still require human final check).");
'
