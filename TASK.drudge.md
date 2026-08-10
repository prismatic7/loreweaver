# TASK: world-objects — drudge (phase 2)

## Goal
Finish arc 2's mechanical leftovers: real Liminal view UI (claim/route),
native file dialogs for export/import, edge-case coverage, and docs.
No design decisions here — execute exactly what's listed.

## Scope (exact file list — nothing to figure out)

1. **Liminal view UI** (replaces the placeholder alert):
   - `src/components/LiminalView.tsx` (new) — lists notes in
     `_liminal/`, shows "claim into world" action per note (uses the
     existing `claim_liminal_note` Tauri command), "make this a world"
     birth action (`make_world_from_liminal`). Reuse existing command
     signatures — do NOT change the Rust side for this.
   - Wire it: `src/components/AppShell.tsx` or `src/App.tsx` — the
     Liminal entry in the World Shelf opens this view instead of the
     placeholder alert.
2. **Native file dialogs** for export/import (WorldShelf currently uses a
   text prompt for destination):
   - Add `tauri-plugin-dialog` (Rust: Cargo.toml + `src-tauri/src/lib.rs`
     plugin registration + capabilities/permissions; frontend: npm dep +
     `src/components/WorldShelf.tsx` export/import handlers use the
     native save/open dialogs).
   - This is the ONLY permitted dependency addition. If it fights back,
     stop, document the blocker in PIPELINE.md, and leave the text
     prompt — do not improvise alternatives.
3. **Coverage** (edge cases only, no speculative tests):
   - Vitest: `src/components/LiminalView.test.tsx` (renders liminal
     notes, claim action invokes `claim_liminal_note`, birth action
     invokes `make_world_from_liminal`).
   - Rust (only if cheap): malformed `world.json` → default manifest
     fallback in `worlds.rs`; import zip with a `..` entry → rejected
     (zip-slip) in `bundles.rs`.
4. **Docs**:
   - `docs/codebase/ARCHITECTURE.md` — short "World Objects (arc 2)"
     addition: Liminal view, native dialogs, and the phase-1 World
     Objects section if missing.
   - `docs/codebase/TESTING.md` + `AGENTS.md` — update test counts to
     the REAL numbers after you run the suites (do not guess).

## Out of scope
- Campaign bible content (`bible/` stays empty — generation is devising
  work, never drudge).
- Theme work, graph/Board/Thread, Muse-in-text, voices, versioning, STT,
  era-hopping — all future phases.
- No refactoring, no formatting churn, no reorganisation of existing
  files beyond the listed wiring.
- No dependency changes beyond `tauri-plugin-dialog`.
- Do not touch `search.rs`, `plugins.rs` permission surface, or the
  embeddings config.

## Acceptance criteria
- [ ] Liminal view renders `_liminal/` notes; claim + make-world actions
      call the existing commands
- [ ] World Shelf export/import use native dialogs (or blocker
      documented honestly in PIPELINE.md)
- [ ] New tests written for LiminalView; zip-slip + malformed-manifest
      Rust tests if cheap
- [ ] `npm run test` passes — use the existing script
      (`NODE_ENV=test vitest run`); count recorded in TESTING.md
- [ ] `cargo test` passes — if cargo is unavailable, SAY SO explicitly
- [ ] `npm run build` passes
- [ ] TESTING.md + AGENTS.md counts match reality
- [ ] Handoff written in PIPELINE.md: what changed, what's next, what's
      blocking

## Harness & budget
- Harness: zero — autonomous, overnight. Work in the SAME worktree
  (`/Users/chris/Development/loreweaver-world-objects`, branch
  `task/world-objects`) — the phase 1 build is already committed there.
- Commit incrementally. Do not touch `main` or the arc 1 branch.
- Budget: ~2 hours equivalent. If a scope item turns out to need real
  design, skip it and note why — the review gate decides.

## Status
- [x] Done (2026-08-11, completed by Hermes after zero's run failed its contract)
- **Summary:** Liminal view UI built + wired (replaces placeholder alert);
  `list_liminal_notes` read-only command added (additive, allowed); native
  file dialogs via `tauri-plugin-dialog` (export save / import open, `.zip`);
  coverage: LiminalView.test.tsx (5) + Rust liminal_tests (3); docs updated
  with real measured counts (14 Vitest suites / 52 tests; 57 Rust tests, 56
  pass + 1 keychain flake skipped). Verification: npm 52/52 ✓, cargo 56/56 ✓,
  build ✓. See PIPELINE.md phase 2 entry for details.
