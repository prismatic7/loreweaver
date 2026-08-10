# TASK: fate-of-cthulhu — Phase 3: Drudge (boilerplate, coverage, docs)

## Goal
Fix the pre-existing frontend test breakage, then fill in the mechanical
gaps around the phase 2 build — coverage, error handling, docs — without
inventing any campaign content.

## Context
Phase 2 (opencode, `9a5e8ff`) delivered provenance, bible conditioning,
capture inbox, and web clipping. Hermes review verified: `cargo test` 34 ✓,
`npm run build` ✓, but **`npm run test` FAILS — all 27 tests, 9 files** with
`TypeError: React.act is not a function`. This is a PRE-EXISTING dependency
drift, not a phase 2 regression: the main repo fails identically (23 tests
at `3bb1103`). react/react-dom resolved to 19.2.7 (declared `^19.1.0`) and
@testing-library/react 16.3.2's act-compat breaks against it. The phase 2
TASK.md status line claiming "npm run test passes (27)" is inaccurate — the
review gate caught it; this phase fixes it.

## Doc precedence (read before making claims)
1. **DESIGN_SKETCH.md** — the signed-off design for THIS campaign build
2. **DESIGN.md** — the design north star ("The Tactile Ledger")
3. **PRODUCT.md** — product intent
4. **docs/codebase/*** — current code reality (source of truth for what exists)

## Scope

### 1. Dep alignment fix (GATE — do this FIRST, nothing else until it's green)
- Make `npm run test` pass. Minimal change preferred:
  - Pin react + react-dom to 19.1.x exact (matches @testing-library/react
    16.3.2's act-compat), OR
  - Upgrade @testing-library/react to a release compatible with react
    19.2.x, if one exists and the upgrade is clean
- Update package.json + package-lock.json; commit both
- Verify with a clean install (`rm -rf node_modules && npm install`) so the
  lockfile is consistent, then `npm run test` green
- If the fix requires a real design decision (upgrade breaks other tests,
  pin conflicts with another dep), STOP and flag it in Status — do not
  improvise a workaround

### 2. Coverage for phase 2 features
- Rust: webclip.rs has no tests. Add unit tests for the non-network error
  paths (invalid URL, non-http scheme, malformed input). Do NOT add tests
  that hit the network
- Frontend: RightDrawer.test.tsx (capture inbox) exists but is failing with
  the dep issue — it must pass after item 1. Add tests for the provenance
  filter in EntityGraphView (All/Canon/History/Invention) and the capture
  inbox interactions (text capture, URL clip flow)

### 3. Obvious fills (mechanical, no design decisions)
- Error handling in webclip.rs: non-HTML content types, oversized pages,
  empty responses — return clean human-readable errors
- Loading/empty states in the Capture Inbox UI (clip_webpage is a network
  call with a 30s timeout — the UI must not hang silently)
- Empty state for the provenance filter when a category has no nodes

### 4. Docs
- Update docs/codebase/ARCHITECTURE.md to reflect phase 2 reality:
  webclip module, provenance model (sources table + frontmatter keys),
  bible conditioning (always-on injection), capture inbox
- Verify AGENTS.md test claims are accurate AFTER the dep fix (the count
  will change if new tests are added)

## Out of scope (MUST NOT touch)
- **NO campaign content.** Do NOT create or invent bible/ files —
  THE_PLAN.md, TONE.md, etc. are devising work (research + Muse generation),
  not drudge work. The conditioning code skips missing bible files
  gracefully; leave it that way
- No new features: live STT, era-hopping timeline, interactive entity
  graph, auto post-session capture, Muse sidebar, PDF pipeline, comics
- No refactoring beyond what the dep fix requires
- No changes to the provenance data model or bible conditioning logic
- No main-repo changes (worktree branch only; merge happens in phase 4)

## Acceptance criteria
- [ ] `npm run test` passes — ALL suites, including RightDrawer.test.tsx
- [ ] `cargo test` still passes (34+)
- [ ] `npm run build` passes
- [ ] New tests added: webclip error paths (Rust), provenance filter +
      capture inbox (frontend)
- [ ] docs/codebase/ARCHITECTURE.md reflects phase 2 reality
- [ ] No bible/ content invented; no new features; no regressions
- [ ] Committed on this branch; Status section + PIPELINE.md handoff log
      written on exit

## Harness & budget
- Harness: zero (stagehand — mechanical work, no thinking required)
- Budget: minimal diffs, one commit per item (or one per logical group).
  If anything needs a design decision, stop and flag it — do not improvise.
  Write status to the Status section of this file and the handoff log in
  PIPELINE.md on exit.

## Status
- [ ] In progress
- [ ] Done — _agent writes a summary of what changed here on exit_
