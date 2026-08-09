# gorkX ↔ Grok ACP mapping

Probed against the bundled `grok 1.0.0 (8a14c91)` `agent stdio` (2026-08).

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

## 1.0.0 route-diff audit

The locked 1.0.0 source was compared with the previous 0.2.x route inventory
before rebuilding. The visible additions are `x.ai/closeOutcome`,
`x.ai/local_workspace`, `x.ai/queue/changed`, and
`x.ai/session/add_local_workspace`. The first two are internal/local-workspace
coordination surfaces and the last is the queue/session notification path; no
new user-facing desktop flow is inferred from their names alone.

The old reload spellings disappeared from some source string inventories during
the 1.0 refactor, but the `InternalMethod` dispatch still exposes
`_x.ai/internal/reload_models` (the route gorkX calls). The 1.0.0 ACP probe
confirmed that route, plus the standard spelling fallback policy for the
session-control adapters. A `Method not found` response is never treated as a
successful capability.

The complete repeatable route evidence is in the 2026-08-08 section of
`VALIDATION_EVIDENCE.md`; it covers baseline lifecycle, voice, desktop actions,
billing, search, prompt history/suggestion, session bundles, model reload and
all 0001–0007 patch-backed extensions.

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

## Billing and quota

The Usage settings surface reads the same authenticated billing extensions used
by Grok Build's native `/usage` flow:

```
_x.ai/billing          {}
_x.ai/auto-topup-rule  {}
```

The desktop parser converts only the kernel's bounded cents/percentage fields
to display values. It never turns a missing percentage into `0%`, and the
auto-top-up route is read-only in gorkX because this kernel exposes no write
operation for changing the account rule.

## Cross-session search

The global task search dialog keeps its local SQLite index as the offline path,
then asks the authenticated kernel for additional history hits:

```
_x.ai/session/search {
  query, cwd?, limit, offset: 0, includeContent: true
}
```

Opening a native hit writes only bounded session metadata into the gorkX task
index and reconnects with the normal `session/load` path. It never imports raw
transcript files just to render search results.

## Prompt history

The **最近提问 / Recent prompts** panel reads Grok Build's durable per-directory
history and merges it with the current task's visible prompts:

```
_x.ai/prompt_history {
  cwd,
  sessionId?,
  filterSessionId?
}
→ { prompts: string[] }
```

The desktop bounds and de-duplicates strings, puts the selected prompt back into
the composer, and waits for the user to press Send. It never sends a model
request, imports raw transcripts, or treats history as a provider quota.

## Next-prompt suggestion

The composer exposes a user-triggered **建议下一步 / Suggest next step** button
after a completed assistant turn. It calls Grok Build's prediction extension only
when clicked:

```
_x.ai/suggestPrompt {
  sessionId,
  generation
}
→ { suggestion: string | null, generation }
```

The result is a short editable chip. It is never auto-sent; the user can insert,
edit, or dismiss it. Because this is a model-backed prediction, the button tells
the user that it may consume provider quota.

## Native prompt queue

When a task is already running, the desktop sends an ordinary `session/prompt`
through Grok Build's pending-input queue instead of maintaining a private
single-string shadow queue. Grok Build broadcasts the authoritative state:

```
x.ai/queue/changed
  { sessionId, entries: [{ id, version, owner, lastEditor, kind, text, position, combinedTexts? }],
    runningPromptId?, runningText?, runningKind?, runningCombinedTexts? }
```

The composer renders every bounded native entry and exposes desktop controls for
edit, remove, reorder, clear, and send-now (interject). Those controls send the
kernel notifications below; they do not execute slash commands or mutate a
client-only queue:

```
x.ai/queue/edit     { sessionId, id, newText, owner, expectedVersion }
x.ai/queue/remove   { sessionId, id, owner, expectedVersion }
x.ai/queue/reorder  { sessionId, orderedIds }
x.ai/queue/clear    { sessionId, owner }
x.ai/queue/interject { sessionId, id, owner, expectedVersion }
```

Queue notifications are scoped to the matching live session and bounded before
rendering. Attachments still use the next-turn fallback until the shared native
queue content encoder supports resource links. If the live route fails, gorkX
keeps the submitted text in its recoverable local fallback and labels that
degradation instead of claiming native queue control succeeded.

## Portable task bundles

The **导出可恢复任务包 / Export portable task package** and **导入任务包 /
Import task package** actions use Grok Build's durable session storage rather
than exporting a rendered transcript:

```
_x.ai/session/state   { sessionId, cwd }
_x.ai/session/updates { sessionId, cwd, offset, limit }
_x.ai/session/import  { sessionId, cwd, state, updates }
```

Export is paginated and bounded at the desktop boundary. The resulting local
`.gorkx-task.json` file includes the native metadata columns and update
envelopes, so it can be restored into a selected project on another gorkX
installation. Import is picker-, project-selection- and confirmation-gated;
the file is treated as sensitive project data, and an existing session with the
same id is left unchanged by the kernel. The ACP smoke gate probes the read and
invalid-import guards without mutating a real session; authenticated export and
import remain a manual acceptance path because they read/write user task data.

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
