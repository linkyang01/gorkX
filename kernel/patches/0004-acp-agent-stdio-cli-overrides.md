# 0004 — ACP agent stdio root CLI overrides

| Field | Value |
|------|--------|
| Upstream commit | `47348d13ec4508dcfe440e34c6d511bb02998fb2` (Grok Build 0.2.112) |
| Patch file | `0004-acp-agent-stdio-cli-overrides.patch` |
| Affected surface | `grok agent stdio` process startup |

## Reason

Desktop gorkX starts the engine as `grok [root flags] agent stdio`. Root flags such as
`--no-memory`, `--no-subagents`, `--max-turns`, `--disallowed-tools`, and `--allow`/`--deny`
are accepted by clap on the pager binary, but the `agent` subcommand path only forwarded
`--disable-web-search`. Headless (`-p`) already applied tool limits via
`cli_agent_overrides`; the stdio ACP path hard-coded `cli_no_memory: false` and left
`max_turns` / `disallowed_tools` unset.

Without this patch, gorkX task controls that pass those documented root flags are silently
ignored for live ACP tasks.

## Behavior change

When `grok agent stdio` is launched, the following root flags now configure the agent:

| Flag | Effect |
|------|--------|
| `--no-memory` | `cli_no_memory` → kernel memory resolution force-off |
| `--no-subagents` | `subagents_enabled = false` after resolve (force-off) |
| `--max-turns N` | `cli_agent_overrides.max_turns` for every new session |
| `--disallowed-tools a,b` | `cli_agent_overrides.disallowed_tools` |
| `--allow` / `--deny` | permission rules on `cli_agent_overrides` |

## Risk

- Scoped to the agent subcommand path; TUI and headless paths unchanged.
- Permission rule parse uses the existing lenient helper (invalid rules warn, do not abort).
- Force-disabling subagents clamps the resolved runtime field; config.toml enable cannot
  re-enable for that process.

## Regression

```bash
scripts/verify-grok-kernel-patches.sh
scripts/build-grok-kernel.sh apps/desktop/src-tauri/resources/grok
node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok
# Optional authenticated gate after rebuild:
# GORKX_ACP_TEST_HOME=… GORKX_ACP_TEST_CWD=… \
#   node scripts/verify-grok-acp.mjs apps/desktop/src-tauri/resources/grok --authenticated
```
