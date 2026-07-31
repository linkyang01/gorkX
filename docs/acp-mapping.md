# gorkX ↔ Grok ACP mapping

Probed against `grok 0.2.103` `agent stdio` (2026-07).

## Lifecycle (required)

```
spawn: grok agent stdio
     [+ --always-approve  when permission mode = full]

1. initialize
   clientInfo: { name: "gorkX", version }
   clientCapabilities: { fs: { readTextFile }, terminal }

2. authenticate
   { methodId: "cached_token" }   // uses ~/.grok/auth.json
   // also: "grok.com" browser login

3. session/new
   { cwd, mcpServers: [] }
   → { sessionId, models: { currentModelId, availableModels } }

4. session/prompt
   { sessionId, prompt: [{ type: "text", text }] }
   → streams session/update, then result { stopReason }

5. session/cancel (optional)
   { sessionId }

6. session/load  (resume)
   { sessionId, cwd, mcpServers: [] }
   → models + _meta.sessionId; history may stream as session/update

7. _x.ai/sessions/list
   { cwd? }
   → { result: { sessions: [{ sessionId, title, cwd, modelId, lastChangeUnixMs, … }] } }
```

## Diff panel note

Current grok `agent stdio` does **not** expose plain `x.ai/git/status|diffs` RPCs
(`Method not found`). gorkX Diff dock uses **local `git`** via Tauri
(`git status --porcelain`, `git diff`, `git diff --cached`).

## Cloud environments

Settings → Environment uses the authenticated Grok Build cloud control plane:

```
_x.ai/cloud/env/list    {}
_x.ai/cloud/env/create  { name, description?, repository?, default_branch?, container_image?, setup_script? }
_x.ai/cloud/env/update  { environment_id, name, description?, repository?, default_branch?, container_image?, setup_script? }
_x.ai/cloud/env/delete  { environment_id }
```

The desktop shows only bounded environment metadata and never handles tokens or
secret variables. Create/update/delete are explicit settings actions; delete is
confirmation-gated. The ACP adapter falls back to the public `x.ai/*` spelling
for compatible engine builds.

## Plan mode

```
session/set_mode { sessionId, modeId: "plan" | "default" | "code" | … }
```

gorkX UI toggle Agent/Plan → after `session/new|load`, call `set_mode`.

**Apply plan gate:** in Plan threads, **Apply plan** calls
`session/set_mode default` then `session/prompt` with the last plan card +
implement instructions (Codex-like plan → execute).

## Worktree

```
_x.ai/git/worktree/create
  { sessionId, sourcePath, name? }
  → { result: { status: "creating", sessionId, worktreePath, sourceGitRoot } }

_x.ai/git/worktree/list → { result: [...] }
_x.ai/git/worktree/status (notification while creating)
```

gorkX **wt** button: new session → create worktree → optional load linked sessionId → Diff uses worktree cwd.

## Notifications (agent → UI)

| Method | Use |
|--------|-----|
| `session/update` | Nested `params.update.sessionUpdate` |
| `… agent_thought_chunk` | Thinking stream (`content.text`) |
| `… agent_message_chunk` | Answer stream |
| `… tool_call` / `tool_call_update` | Tool cards |
| `… user_message_chunk` | Echo of user (optional display) |
| `… available_commands_update` | Slash commands |
| `_x.ai/*` | Extensions (MCP, queue, sessions, models) — log/ignore in P1 |

## Permission request

Agent → client **request** (has `id`):

- method: `session/request_permission` (or snake_case variant)
- respond: `{ outcome: { outcome: "selected", optionId } }`

## gorkX permission modes (Codex trio)

| Mode | Agent spawn | UI on permission |
|------|-------------|------------------|
| Default | plain stdio | Modal ask |
| Auto | plain stdio | Auto-select allow-once |
| Full Access | `--always-approve` | Auto-allow if still asked |

## Kernel upgrade (independent of UI)

- Official: `grok update`
- Source: `git pull` on `xai-org/grok-build` + `cargo build -p xai-grok-pager-bin --release`
- Point gorkX Kernel path at new binary; **new threads** only

## Reasoning effort

Spawn: `grok agent --reasoning-effort low|medium|high stdio`

gorkX stores preferred effort; changing effort on an **active** thread stops the
agent process, respawns with the new flag, and `session/load`s the same sessionId.

## Plan apply (selected steps)

UI checkboxes on plan entries → Apply plan prompts only checked steps.
