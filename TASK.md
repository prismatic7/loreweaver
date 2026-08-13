# TASK: feature-ideas-polish

## Goal

Produce a **feature-ideas and polish report** for the Loreweaver app: a
prioritised list of new feature ideas and UI/UX polish opportunities, grounded
in the actual design truth and the actual codebase. This is a devising run —
the output is a written report, not code.

## Scope

- Read the design truth docs in this worktree:
  - `PRODUCT.md` (product intent + brand commitments)
  - `DESIGN.md` (design north star — "The Tactile Ledger")
  - `DESIGN_SKETCH.md` (arc 1: FATE of Cthulhu campaign build)
  - `DESIGN_SKETCH_WORLDS.md` (arc 2: World Objects build, supersedes where conflicting)
  - `FEATURE_PROPOSAL.md`
- Read the codebase reality docs in `docs/codebase/` (ARCHITECTURE, STACK,
  STRUCTURE, CONVENTIONS, INTEGRATIONS, CONCERNS) so ideas match what exists.
- Write the report to `FEATURE_IDEAS.md` in this worktree.

## Out of scope

- NO code changes, NO commits of code
- NO campaign content — design the instrument, never campaign content
- NO implementation plans — ideas and polish suggestions only
- Do NOT touch anything outside this worktree (no /tmp paths)

## Acceptance criteria

- [ ] `FEATURE_IDEAS.md` exists in the worktree root
- [ ] Ideas are grouped: (1) new features, (2) polish/UX improvements
- [ ] Each idea is grounded: cite the doc or code file it builds on (path:line where possible)
- [ ] Each idea states why it matters for GMs prepping/running campaigns
- [ ] Ideas are prioritised (e.g. quick win / strategic / moonshot, or P1/P2/P3)
- [ ] Honest about existing gaps (e.g. image generation is a placeholder)
- [ ] Written in professional international English, Australian spelling

## Harness & budget

- Harness: agy (devising partner — idea generation)
- Budget: sketch-level thinking, no exploration beyond the listed docs
- Sandbox guard: work only inside this worktree. Do NOT use /tmp paths.
- Do not commit. Write the report file and your status into this file when done.

## Status

- **Status**: Completed
- **Devising Output**: A comprehensive prioritised feature ideas and UX polish report has been created at [FEATURE_IDEAS.md](file:///Users/chris/Development/loreweaver-feature-ideas-polish/FEATURE_IDEAS.md).
- **Core Findings**:
  - Gaps such as unimplemented local Speech-to-Text, mock/placeholder image generation UI, transient plugin states, and lack of autosave logic have been detailed and mapped to their exact source positions.
  - New features for customisable world manifest bibles, offline STT backend engines, and persistent SQLite-backed plugin states were proposed.
  - Polish items such as debounced autosave/unsaved change warnings, base URL overrides for speech services, and accessibility theme overrides were documented.
- **Verification**: Verified that all proposals are fully grounded, aligned with "The Tactile Ledger" styling guidelines, and written in Australian spelling.

