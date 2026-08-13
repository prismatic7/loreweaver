# TASK: map-change-detection

## Goal
Stop silent data loss in the map builder: warn the GM before navigating away when a map has unsaved changes (tokens, fog, drawings, background, or annotations).

## Context (verified on main)
- `src/components/MapBuilderView.tsx`:
  - `saveMap()` calls `save_canvas_file` then `alert("Map saved successfully!")`.
  - State: `tokens`, `fog`, `background`, `drawings` — loaded via `loadMap()` from the `.canvas` JSON.
  - NO dirty tracking exists today. Navigating away silently discards changes.
- `src/App.tsx` owns `activeView` / `setActiveView` and exposes a `confirm` helper (used elsewhere, e.g. `confirm(\`Save "${title}" as a note?\`, ...)`).

## Scope
Files the agent MAY touch:
- `src/components/MapBuilderView.tsx` (dirty tracking + guard)
- `src/App.tsx` (ONLY the minimum needed to route a confirm prompt through the existing dialog system when leaving the map view — do not restructure view state)

## Out of scope
- NO backend/Rust changes (`src-tauri/`)
- NO changes to the `.canvas` file format or `save_canvas_file` / `load_canvas_file` commands
- NO dependency changes
- NO formatting churn / unrelated refactors
- Do NOT use `/tmp` paths — work only inside this worktree
- Do NOT commit

## Acceptance criteria
- [ ] Dirty state is tracked: any change to tokens / fog / background / drawings marks the map dirty; a save (or reload) clears it
- [ ] Navigating away from the map view with unsaved changes shows a warning (confirm dialog): e.g. "You have unsaved map changes" with Save / Discard / Cancel options (or equivalent — the key is no silent discard)
- [ ] Cancel keeps the user on the map; Discard navigates without saving; Save persists then navigates
- [ ] Saving the map clears the dirty flag (no false warnings after save)
- [ ] `npm run build` passes (tsc + vite)

## Harness & budget
- Harness: opencode
- Budget: quick win — max ~2-3 files, no new deps

## Status
- [x] In progress
- [x] Done — agent writes a summary of what changed here on exit

## Summary (agent exit note)
Implemented unsaved-changes protection for the map builder.

**`src/components/MapBuilderView.tsx`**
- Added `isDirty` state. A `useEffect` watching `tokens` / `fog` / `background` / `drawings` marks the map dirty on any post-load mutation. The initial `loadMap()` commit is excluded via a `loadCompletedRef`/`hasLoadedRef` pair (flag flips in an effect that runs *after* the dirty-tracking effect on the load render, so the load is never counted as a user edit).
- `saveMap()` now clears the dirty flag on success (no false warnings after save).
- Added two optional props: `onDirtyChange(dirty)` reports dirty state to the parent, and `registerSave(fn)` exposes a save that resolves `true`/`false` so the parent can persist before navigating away.

**`src/App.tsx`**
- Added a navigation guard: `requestViewChange` wraps `setActiveView`. When leaving the map view with unsaved changes, it shows a Save / Discard / Cancel dialog instead of silently discarding.
  - **Cancel** stays on the map.
  - **Discard** navigates without saving.
  - **Save** persists via the registered save fn, then navigates (stays on the map if the save fails).
- Wired `onDirtyChange` / `registerSave` into `<MapBuilderView>` and passed `requestViewChange` to `<AppShell>`.
- No view-state restructuring; the guard is additive.

**Verification**
- `npm run build` (tsc + vite) passes.
- `npm run test` passes: 16 suites / 91 tests.
- No backend/Rust, `.canvas` format, dependency, or formatting changes. No commit made.

## Evidence
_State vocabulary — record every transition in the ledger
(`~/Development/agent-dispatch/evidence <repo> <task> <state>`). Missing
records remain missing evidence; never infer a state from text._

- `prepared` — dispatch created the worktree. Recorded automatically.
- `running` — _you are executing now_
- `reported` — _you claim done. NOT verified. Write this before exit:_
  `~/Development/agent-dispatch/evidence loreweaver map-change-detection reported "exit 0, unverified"`
- `verified` — Hermes checked the diff against the acceptance criteria
  (then `merged`). `reported` ≠ `verified`.
