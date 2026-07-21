#!/usr/bin/env bash
# Verify the desktop web bundle after `npm run build`.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
assets="$root/apps/desktop/dist/assets"
max_bytes="${GORKX_INITIAL_JS_GZIP_MAX_BYTES:-512000}"

[[ -d "$assets" ]] || {
  echo "Missing web build assets: $assets (run: cd apps/desktop && npm run build)" >&2
  exit 2
}

# Vite names the eagerly loaded product chunk index-<hash>.js. Runtime and
# terminal chunks are separate by design and should not be counted as initial
# application code.
entries=()
while IFS= read -r file; do
  entries+=("$file")
done < <(find "$assets" -maxdepth 1 -type f -name 'index-*.js' -print | sort)
[[ "${#entries[@]}" -eq 1 ]] || {
  echo "Expected exactly one initial index chunk, found ${#entries[@]}" >&2
  exit 3
}

entry="${entries[0]}"
bytes="$(gzip -c "$entry" | wc -c | tr -d '[:space:]')"
if (( bytes > max_bytes )); then
  echo "FAIL: initial JS gzip ${bytes} bytes exceeds ${max_bytes}: $entry" >&2
  exit 4
fi

echo "PASS: initial JS gzip ${bytes}/${max_bytes} bytes: $(basename "$entry")"
