# TASK: autosave-navigation-guard

## Goal
Stop silent data loss when a GM edits a note and then navigates away or switches views without toggling Preview mode: add debounced autosave and a navigation guard.

## Scope
Files the agent MAY touch:
- `src/hooks/useNotes.ts`
- `src/components/CampaignVaultView.tsx`
- `src/App.tsx` (only the view-switching path — see Out of scope)
- `src/hooks/` (only if a small new hook is genuinely cleaner; prefer in-file)

## Out of scope
- NO backend/Rust changes (`src-tauri/`)
- NO changes to `save_note` / `load_notes` command semantics
- NO dependency changes (no new npm packages)
- NO formatting churn / unrelated refactors
- Do NOT change the "Preview" toggle behaviour itself — autosave must coexist with it
- Do NOT use `/tmp` paths — work only inside this worktree
- Do NOT commit

## Acceptance criteria
- [ ] Debounced autosave: while a note is being edited, changes auto-save after ~1500ms of inactivity (no manual action required)
- [ ] Autosave does not fire when the note is unmodified (no spurious `save_note` invocations)
- [ ] Navigation guard: switching note, folder, or view with unsaved changes warns the user (confirm dialog) instead of silently discarding
- [ ] Acknowledged "discard" still works (user can leave without saving)
- [ ] `npm test` passes (existing tests, no new failures)
- [ ] `npm run build` passes (tsc + vite)

## Harness & budget
- Harness: opencode
- Budget: quick win — max ~4 files, no new deps, finish under 15 minutes of work

## Status
- [x] In progress
- [x] Done — agent writes a summary of what changed here on exit

## Summary (agent exit note)
Implemented debounced autosave + navigation guard in the frontend only (no backend/Rust, no deps, no Preview-toggle changes).

- `src/hooks/useNotes.ts`: added a `useEffect` that schedules `immediateSave()` ~1500ms after the last edit (title/content/frontmatter). `immediateSave()` already no-ops when the note is unmodified, so no spurious `save_note` invocations fire.
- `src/App.tsx`: added `hasUnsavedChanges` (mirrors the dirty check in `immediateSave`) and two guarded setters — `guardedSetActiveView` and `guardedSetSelectedNoteId` — that show a confirm dialog ("You have unsaved changes. Leave without saving?") before navigating away from an unsaved note. Confirming still discards and leaves. Wired the guarded setters through AppShell ribbon, Dashboard, CampaignVaultView, search results, backlinks, canvas/character-sheet/graph/timeline open-note paths, and the NewRule modal.

Verification: `npm test` → 16 files / 91 tests pass. `npm run build` (tsc + vite) → passes. No commit made.

## Evidence
_State vocabulary — record every transition in the ledger
(`~/Development/agent-dispatch/evidence <repo> <task> <state>`). Missing
records remain missing evidence; never infer a state from text._

- `prepared` — dispatch created the worktree. Recorded automatically.
- `running` — _you are executing now_
- `reported` — _you claim done. NOT verified. Write this before exit:_
  `~/Development/agent-dispatch/evidence loreweaver autosave-navigation-guard reported "exit 0, unverified"`
- `verified` — Hermes checked the diff against the acceptance criteria
  (then `merged`). `reported` ≠ `verified`.
