# Design QA — graphite workspace refresh

## Comparison target

- **Source visual truth:** `/private/tmp/gork-app-v018-workbench.jpg`
- **Implementation screenshot:** `/private/tmp/gorkx-workspace-dark-current.jpg`
- **Combined comparison:** `/private/tmp/gorkx-visual-comparison.jpg`
- **Scope:** replicate the reference's visual language and workspace rhythm only. Its product name, logo, copy, and other branded assets were deliberately not copied.

## Capture details

- **Source:** 738 × 720 px screenshot, density unknown.
- **Implementation:** 1280 × 720 px browser-rendered screenshot at a 1280 × 720 CSS viewport, device scale factor 1.
- **Normalization:** both captures were placed on a common 1440 × 720 comparison canvas without scaling their content regions.
- **State:** empty/home workspace, dark appearance, no project selected.
- **Primary interaction checked:** switching the appearance setting to dark and returning to the empty workspace.
- **Console/runtime state:** the browser preview cannot provide Tauri's `invoke` bridge, so it displays the engine-unavailable development banner. The native desktop shell has not yet been captured in this QA pass.

## Full-view comparison

The revised screen now shares the source's graphite, low-contrast visual hierarchy: a compact left rail, a dark quiet canvas, subtle surface separation, restrained borders, and a centered composer. gorkX intentionally retains its task starter content, while the reference is a blank conversation state, so content density is not a fidelity target.

No focused crop was needed: the sidebar, canvas, card density, and composer are legible in the combined full-view evidence.

## Findings

- **[P1] Native desktop state has not been visually verified.**
  - **Location:** top of the browser implementation capture.
  - **Evidence:** the screenshot contains the development-only engine-unavailable banner because a browser preview has no Tauri command bridge; the source has no equivalent error state.
  - **Impact:** this prevents a clean comparison of the actual shipped desktop workspace and makes the above-the-fold state materially different.
  - **Fix:** launch the Tauri development window with the bundled Grok engine available, capture its same empty-workspace state at 1280 × 720, then rerun the comparison.

## Comparison history

1. **Initial implementation:** the new-install fallback followed the system theme and the dark palette used blue-black surfaces with looser sidebar and card spacing. This did not match the reference's neutral graphite hierarchy.
2. **Fix applied:** changed new-install fallback to dark; refined dark tokens to neutral graphite; tightened sidebar, home cards, and composer spacing; reduced borders and increased surface consistency in `apps/desktop/src/App.css` and `apps/desktop/src/lib/appearance.ts`.
3. **Post-fix evidence:** `/private/tmp/gorkx-visual-comparison.jpg` confirms the intended graphite shell and dense workbench rhythm. The P1 native-shell evidence gap remains.

## Implementation checklist

1. Run the native Tauri window with an available engine bridge.
2. Capture the dark empty-workspace state at 1280 × 720.
3. Compare the new capture with the source and resolve any remaining P0/P1/P2 visual issues.

## Follow-up polish

- **[P3]** Consider a more compact starter-card treatment at short desktop heights after native-shell validation, while preserving access to all task templates.

final result: blocked
