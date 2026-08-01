# Formal parity gap table (Grok Build → desktop-primary)

> Snapshot for the formal completeness bar.  
> Legend: **Real** / **Kernel-wired** / **Soon** / **gap** (code or evidence).  
> Evidence types: code wiring, unit test, ACP probe, human GUI, blocked.

| # | Capability | Desktop primary entry | FEATURES status | Evidence / gap |
|---|---|---|---|---|
| 1 | New/restore/delete task | Sidebar + auto-reconnect | Real | Code; offline reconnect banner |
| 2 | Stream + tools + permissions | Composer / cards | Real | Code; humanize for denial shapes; **ACP `session/prompt` short turn PASS 2026-08-01** (`one-shot-complete-20260801/b1-prompt-probe.log`, model grok-4.5); App GUI stream still human |
| 3 | Terminal PTY | Chrome terminal / ⇧⌘J | Real | Code |
| 4 | Review diff / stage | Review panel / ⌘D | Real (boundary) | Code |
| 5 | Agent changes / git / code nav | Review tabs | Kernel-wired | ACP desktop-controls; tab hidden if unadvertised |
| 6 | Worktree create/list/switch | Worktree panel | Real | Code + ACP worktree |
| 7 | Memory Remember/Forget/Flush | Memory panel / ⇧⌘M | Real (+ flush Kernel) | Code |
| 8 | Skills Run / MCP / plugins | Extensions / ⇧⌘E | Real | Code; empty-state CTAs |
| 9 | Subagent spawn/tree/stop/inspect | Composer / Process / ⇧⌘B | Kernel-wired | ACP **real** spawn→running→**completed**+output reconfirmed (`smoke`, one-shot-complete); cancel/list routes OK; **GUI 点按仍未验收** |
| 10 | Hooks trust/reload/enable | Settings → Hooks | Kernel-wired | ACP hooks; **human click 未验收** |
| 11 | Computer screenshot/click/stop | Settings → Computer | Real w/ boundary | Emergency stop code; **live Accessibility 未验收** |
| 12 | GitHub OAuth + verify + PR | Settings → Git / Review | Real confirmation-gated | githubFeedback; **web revoke live 未验收** |
| 13 | Voice dictation | Composer mic | Kernel-wired | ACP voice; need-task click; **H3 mic 未验收** |
| 14 | Third-party models | Settings → Models | Real (verify-first) | Code; **H2 endpoint 未提供** |
| 15 | Billing / usage | Settings → Usage | Kernel-wired | ACP billing when auth |
| 16 | Task info / session info | Chrome i / ⇧⌘I | Kernel-wired | ACP session/info; reconnect CTA |
| 17 | Btw / interject / queue | Composer running modes | Kernel-wired | ACP desktop-controls |
| 18 | Workflow pause/stop/save | Cards + + menu | Kernel-wired | ACP workflow routes |
| 19 | Fork / Rewind | Header / + | Kernel-wired | ACP routes; **auth two-turn rewind 未验收** |
| 20 | Calendar/Slack/飞书/Notion/Drive | Connector catalog | **Soon** | Non-executable; no fake connected |
| 21 | Multi web-subscription OAuth | — | **Soon** | Explicitly not Real |
| 22 | TUI vim/pager | — | Unavailable | Deliberate non-goal |

## Structural lock
- `apps/desktop/src/lib/desktopPrimaryEntries.test.ts` asserts **25** desktop primary path symbols in shipped sources.
- `findLightSurfaceHardcodes` in `designTokens.ts` blocks light-gray component backgrounds that flash white on dark theme.

## Remaining honest blocks (not code-fakeable)
- **H1** clean-machine install→login→first task→reopen.
- **H2** user-supplied third-party endpoint true reply.
- **H3** microphone dictation → draft, no auto-send.
- **B1 ACP** short prompt: **PASS** (2026-08-01 one-shot-complete). **B1 App GUI** stream in `gorkX.app`: still human acceptance.
- **B3 GUI** subagent spawn → tree → stop/inspect in App (ACP real completion already evidenced).
- Tag / notarized DMG / GitHub Release: **user approval only**.
