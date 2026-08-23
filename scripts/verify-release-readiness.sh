#!/usr/bin/env bash
# Stage G: release-readiness orchestration.
# Never creates tags, GitHub Releases, or DMGs. See PRODUCT_DEVELOPMENT_PLAN §7.6.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP="$ROOT/apps/desktop"
APP_DEFAULT="$DESKTOP/src-tauri/target/release/bundle/macos/gorkX.app"
APP_PATH="${GORKX_APP_PATH:-$APP_DEFAULT}"
USER_APPROVED_SHIP="${GORKX_USER_APPROVED_SHIP:-0}"
REAL_PROMPT_PASSED="${GORKX_REAL_PROMPT_PASSED:-0}"
CLEAN_INSTALL_PASSED="${GORKX_CLEAN_INSTALL_PASSED:-0}"
THIRD_PARTY_MODEL_PASSED="${GORKX_THIRD_PARTY_MODEL_PASSED:-0}"
MICROPHONE_PASSED="${GORKX_MICROPHONE_PASSED:-0}"
ARCH_VERIFIED="${GORKX_ARCH_VERIFIED:-}"

if [[ -n "$ARCH_VERIFIED" && ! "$ARCH_VERIFIED" =~ ^(arm64|x86_64)(,(arm64|x86_64))*$ ]]; then
  echo "Invalid GORKX_ARCH_VERIFIED: $ARCH_VERIFIED (expected arm64,x86_64 or one architecture)" >&2
  exit 2
fi

echo "=== gorkX release readiness ==="
echo "root: $ROOT"
echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "user_approved_ship: $USER_APPROVED_SHIP (only set GORKX_USER_APPROVED_SHIP=1 with explicit user approval)"
echo "real_prompt_passed: $REAL_PROMPT_PASSED (requires a recorded real authenticated Grok Build reply)"
echo "clean_install_passed: $CLEAN_INSTALL_PASSED (requires a recorded clean-machine install/login/reopen run)"
echo "third_party_model_passed: $THIRD_PARTY_MODEL_PASSED (requires a recorded real provider reply)"
echo "microphone_passed: $MICROPHONE_PASSED (requires a recorded macOS dictation run)"
echo "arch_verified: ${ARCH_VERIFIED:-none} (requires separate install+login+project evidence for every listed architecture)"
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
echo "NOTE: host architecture is diagnostic only; it is never counted as acceptance evidence."
echo "NOTE: dual-arch evidence needs separate arm64 and x86_64 install verifications."

echo
echo "--- Stage G matrix (honest) ---"
echo "macos: real track (signing/notarization may still be incomplete)"
echo "windows: trial — data dir / secrets / kernel / install-uninstall checklist not automated here"
echo "linux: eval — secrets/sandbox/desktop cost not approved for Beta"

echo
echo "--- public ship decision ---"
cd "$ROOT"
export STAGE_OK="$stage_ok" BUNDLE_OK="$bundle_ok" SL="$signing_level"
export GORKX_USER_APPROVED_SHIP="$USER_APPROVED_SHIP"
export GORKX_REAL_PROMPT_PASSED="$REAL_PROMPT_PASSED"
export GORKX_CLEAN_INSTALL_PASSED="$CLEAN_INSTALL_PASSED"
export GORKX_THIRD_PARTY_MODEL_PASSED="$THIRD_PARTY_MODEL_PASSED"
export GORKX_MICROPHONE_PASSED="$MICROPHONE_PASSED"
export GORKX_ARCH_VERIFIED="$ARCH_VERIFIED"
node --experimental-strip-types -e '
import { evaluateReleaseGates } from "./apps/desktop/src/lib/releaseGates.ts";
const archVerified = (process.env.GORKX_ARCH_VERIFIED || "")
  .split(",")
  .filter((arch) => arch === "arm64" || arch === "x86_64");
const r = evaluateReleaseGates({
  stageTestsPass: process.env.STAGE_OK === "1",
  bundleEngineOk: process.env.BUNDLE_OK === "1",
  realPromptPassed: process.env.GORKX_REAL_PROMPT_PASSED === "1",
  cleanInstallPassed: process.env.GORKX_CLEAN_INSTALL_PASSED === "1",
  thirdPartyModelPassed: process.env.GORKX_THIRD_PARTY_MODEL_PASSED === "1",
  microphonePassed: process.env.GORKX_MICROPHONE_PASSED === "1",
  signingLevel: (process.env.SL || "none"),
  archVerified,
  windowsTrialPassed: false,
  linuxBetaApproved: false,
  userApprovedShip: process.env.GORKX_USER_APPROVED_SHIP === "1",
});
console.log(JSON.stringify(r, null, 2));
if (!r.canShipPublicArtifacts) {
  if (process.env.GORKX_USER_APPROVED_SHIP === "1") {
    console.log("\nNO PUBLIC SHIP: explicit user approval is recorded; every listed blocker must still be resolved with real evidence.");
  } else {
    console.log("\nNO PUBLIC SHIP: resolve every listed blocker and obtain explicit user approval for tag/Release/DMG.");
  }
  process.exit(2);
}
console.log("\nPUBLIC SHIP ALLOWED by automated gates (still require human final check).");
'
