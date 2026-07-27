# gorkX UI design notes (Stage A)

## Themes

| Preference | Behavior |
|------------|----------|
| **Dark (primary full theme)** | Near-black-blue layered surfaces (`--bg-app` → sidebar → main → elevated). Cold accent highlights for focus/status; not neon. |
| **Light (equally maintained)** | Airy gray rails, white main stage, soft user pills. Same token names and component rules as dark. |
| **System** | Follows OS `prefers-color-scheme` via `data-theme` on `<html>`. |

Both themes are first-class. Values live only in CSS custom properties under `:root` and `:root[data-theme="dark"]` in `src/App.css`. Density adjusts type scale via `data-density`.

Do **not** hard-code chrome colors in components. Shell, sidebar, composer, buttons, empty states, and session layers consume tokens (`--text`, `--icon-muted`, `--status-*`, `--space-*`, `--focus-ring-*`, etc.).

## Layout principles

1. **Task first** — conversation / home goal input is the visual center.
2. **Opt-in secondary panels** — empty Review and Terminal stay closed by default (`panelLayout.isOptInPanelOpen`). Open only when the user toggles them or a flow explicitly needs them.
3. **Narrow windows** — at ≤960px Review overlays instead of stealing grid columns; at ≤720px sidebar collapses so main stage remains usable.
4. **Chinese-first copy** — short, actionable; English is equally complete.

## Session visual hierarchy

| Layer | Class / role | Role |
|-------|----------------|------|
| Message (user) | `.tl-user` | End-aligned pill |
| Tool / thought | `.tl-tool` / `.tl-meta` | Compact collapsible activity |
| Plan | `.tl-plan` | Plan accent rail + soft wash |
| Decision / system | `.tl-decision` | Approval-adjacent system notes |
| Result (assistant) | `.tl-result` / `.tl-assistant` | Document body + deliverables |

## Home / new-task

- Goal composer (center action)
- Project chip + picker
- Quick-entry starter cards
- Recent tasks when the current scope has history; otherwise first-use empty guidance

## Token checklist source

Machine-readable required token names: `src/lib/designTokens.ts`.  
Panel open defaults: `src/lib/panelLayout.ts`.
