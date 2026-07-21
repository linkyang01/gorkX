#!/usr/bin/env bash
# Validate the recorded gorkX kernel patch series against a clean locked source.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
source_dir="${1:-${GORKX_KERNEL_SOURCE:-$root/vendor/grok-build}}"
patch_dir="$root/kernel/patches"
series="$patch_dir/series"

[[ -f "$series" ]] || { echo "Missing kernel patch series: $series" >&2; exit 2; }
"$root/scripts/verify-grok-kernel-source.sh" "$source_dir"

patches=()
while IFS= read -r name; do
  patches+=("$name")
done < <(sed -e 's/#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$series" | sed '/^$/d')
if [[ ${#patches[@]} -eq 0 ]]; then
  echo "PASS: kernel patch series is empty"
  exit 0
fi

seen=""
for name in "${patches[@]}"; do
  [[ "$name" != */* && "$name" == *.patch ]] || {
    echo "Invalid patch series entry: $name" >&2; exit 3;
  }
  [[ ",$seen," != *",$name,"* ]] || { echo "Patch listed more than once: $name" >&2; exit 3; }
  seen="$seen,$name"
  patch="$patch_dir/$name"
  [[ -f "$patch" ]] || { echo "Patch missing: $patch" >&2; exit 3; }
  git -C "$source_dir" apply --check "$patch" || {
    echo "Patch no longer applies cleanly: $name" >&2; exit 4;
  }
  echo "PASS: patch applies cleanly: $name"
done
