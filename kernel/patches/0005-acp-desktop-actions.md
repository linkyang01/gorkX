# 0005 — structured desktop actions

Adds maintained ACP adapters for the desktop shell:

- `x.ai/desktop/workflow/launch` and `x.ai/desktop/workflow/manage` dispatch through the existing session `WorkflowManager`.
- `x.ai/desktop/goal` dispatches a real Goal turn through the existing prompt/goal orchestrator while keeping the compatibility spelling internal.
- `x.ai/desktop/command` is a narrow bridge for advertised Grok Build commands whose current release has no dedicated ACP method (skills, image generation, and scheduler prompts). The kernel's normal command availability and execution path remain authoritative.
- Desktop-originated prompt echoes are marked synthetic and hidden from the conversation scrollback; gorkX renders the friendly action label instead.

This patch does not add a second agent loop or duplicate workflow state. It is applied to the locked Grok Build `1.0.12` source at the revision recorded in `kernel/grok-build.lock.toml`.
