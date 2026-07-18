#!/usr/bin/env bash
# gorkX environment doctor — kernel + toolchain
set -euo pipefail

echo "=== gorkX doctor ==="
echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

GROK_CMD="${GORKX_GROK_CMD:-grok}"
echo "kernel command: $GROK_CMD"
if command -v "$GROK_CMD" >/dev/null 2>&1 || [[ -x "$GROK_CMD" ]]; then
  echo "version: $($GROK_CMD --version 2>&1 | head -1)"
  echo "path: $(command -v "$GROK_CMD" 2>/dev/null || echo "$GROK_CMD")"
else
  echo "kernel: NOT FOUND"
  echo "  install: curl -fsSL https://x.ai/cli/install.sh | bash"
  echo "  or build: https://github.com/xai-org/grok-build"
fi

echo
if [[ -f "$HOME/.grok/auth.json" ]] || [[ -d "$HOME/.grok/auth" ]]; then
  echo "auth: cached login present (~/.grok)"
elif [[ -n "${XAI_API_KEY:-}" ]]; then
  echo "auth: XAI_API_KEY set"
else
  echo "auth: missing — run: grok login"
fi

echo
echo "node: $(node -v 2>/dev/null || echo missing)"
echo "npm:  $(npm -v 2>/dev/null || echo missing)"
if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
fi
echo "rustc: $(rustc --version 2>/dev/null || echo missing)"
echo "cargo: $(cargo --version 2>/dev/null || echo missing)"

for d in "$HOME/projects/grok-build" "$HOME/code/grok-build"; do
  if [[ -f "$d/Cargo.toml" ]]; then
    echo "source checkout: $d"
    if [[ -f "$d/SOURCE_REV" ]]; then
      echo "  SOURCE_REV: $(head -c 12 "$d/SOURCE_REV")…"
    fi
  fi
done

echo
echo "upgrade official:  grok update"
echo "upgrade source:    cd <grok-build> && git pull && cargo build -p xai-grok-pager-bin --release"
echo "done."
