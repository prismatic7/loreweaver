# TASK: world-objects

## Goal
Implement the World Object: a `world.json` manifest per campaign that
declares note types, provenance taxonomy, and theme, plus the `_liminal`
holding pen, zip world bundles, and a World Shelf UI — turning loreweaver
from one campaign tool into an instrument for many worlds.

## North star
`DESIGN_SKETCH_WORLDS.md` (committed, in this worktree — READ IT FIRST).
It supersedes DESIGN_SKETCH.md where they conflict: DESIGN_SKETCH.md is
the campaign-build contract (arc 1, shipped); DESIGN_SKETCH_WORLDS.md is
the contract for THIS build (arc 2). Chris signed off all six open
questions — the sketch's "Resolved decisions" section is binding.

## Scope
Files/dirs you MAY touch — explicit list:
- `src-tauri/src/worlds.rs` (new) — WorldManifest schema v1 (per sketch),
  load/validate, fallback chain (manifest → defaults), auto-generate
  `world.json` for existing campaigns on first launch (zero-touch
  migration, additive only — never rewrite existing folders).
- `src-tauri/src/lib.rs` — register manifest/bundle/liminal commands;
  wire the first-launch migration hook. Vault writes MUST go through
  `validate_safe_path`.
- `src-tauri/src/bundles.rs` (new) — zip export/import/archive; folder
  scaffold ("start a new world like this one" = structure, no content).
- `src-tauri/src/agent.rs` — only if bible conditioning needs a manifest
  flag (`bible: true/false`); keep the always-on injection behaviour.
- `src/types.ts` — WorldManifest types; `SOURCE_TYPES` becomes the DEFAULT
  taxonomy (now including `speculation` — the Provisional ships for ALL
  worlds); note-type defaults = the current 5 (npc/location/faction/
  item/event) so legacy notes keep working.
- `src/components/EntityGraphView.tsx` — read note types + provenance
  taxonomy from the active world's manifest (TYPE_COLORS → default set).
- `src/components/` (editor Metadata panel, sources UI, graph filter) —
  taxonomy + type reads from manifest; `speculation` appears as a
  provenance option everywhere provenance is chosen/filtered.
- `src/` theme plumbing (CSS var resolution) — world tokens → global
  tokens → defaults. Accent + palette + serif toggle ONLY (no full
  typography override — signed-off decision 1).
- `src/components/WorldShelf.tsx` (new) + `src/App.tsx`/`src/components/
  AppShell.tsx` — the switcher: icon, name, description, last-opened,
  new world (with scaffold choice), `_liminal` entry, export/import.
- Capture inbox (`capture_note` + `useCaptureInbox`) — captures default
  to `_liminal/` until routed to a world (claim/route action; "make this
  a world" birth action).
- `AGENTS.md` — doc precedence block: DESIGN_SKETCH_WORLDS.md above
  DESIGN_SKETCH.md (arc 2 supersedes where they conflict).
- `docs/codebase/ARCHITECTURE.md` — World Objects section.
- Tests: Rust unit tests for worlds.rs + bundles.rs (parse, fallback,
  validate, zip round-trip, scaffold); Vitest for type registry, theme
  resolution, provenance taxonomy (incl. speculation default), World
  Shelf basics.

## Out of scope
- Muse-in-text, auto post-session capture, voice bank UI, versioned note
  history, live STT, interactive graph layout/clusters/Thread, era-hopping
  — all logged as future phases, DO NOT build.
- Campaign bible content — `bible/` folders stay empty; no generation.
- `search.rs` embeddings (384-dim hardcode stays), plugin permission
  surface (`plugins.rs` allow-list stays), dependency changes.
- No refactoring/formatting churn beyond what the task requires.
- Do NOT migrate, rewrite, or move any existing campaign vault data —
  the manifest generation is additive and default-only.

## Acceptance criteria
- [ ] `world.json` schema v1 loads with fallback chain; existing
      campaigns get auto-generated manifests on first launch
- [ ] Note-type registry: graph, canvas, metadata UI read the world's
      types; legacy 5 still render for old vaults
- [ ] Provenance: `speculation` in default taxonomy everywhere;
      per-world taxonomy override respected in sources UI + graph filter
- [ ] Theme override: accent + palette + serif toggle per world,
      resolution order world → global → defaults; 10% accent rule and
      rest restraint rule preserved
- [ ] `_liminal` exists; captures land there; claim/route + "make this
      a world" work
- [ ] Zip export/import + folder scaffold work (round-trip verified)
- [ ] World Shelf UI: switcher with identity, new world (scaffold
      choice), Liminal entry, export/import actions
- [ ] `npm run test` passes (existing 32 + new)
- [ ] `cargo test` passes (existing 43 + new) — if cargo is unavailable
      in your environment, SAY SO explicitly, do not assume
- [ ] `npm run build` passes
- [ ] AGENTS.md precedence + ARCHITECTURE.md updated in the same change

## Harness & budget
- Harness: opencode — autonomous. This is a 7-deliverable build; commit
  incrementally (logical units), don't wait for one mega-commit.
- Budget: work in phases within the task — manifest+registry first,
  then liminal+bundles, then shelf+theme. Verify each unit as you go.
- Gate: diff vs DESIGN_SKETCH_WORLDS.md — every deliverable must map to
  a signed-off decision. Write the handoff in PIPELINE.md when done.

## Status
- [x] In progress
- [x] Done — _agent writes a summary of what changed here on exit_

## Exit summary (phase 1 build, 2026-08-10)
All 7 deliverables shipped, each mapped to a signed-off decision in
DESIGN_SKETCH_WORLDS.md. Backend (`worlds.rs` manifest + fallback chain +
auto-generate, `bundles.rs` zip/scaffold, `_liminal` + claim/birth, bible
gating) and frontend (note-type + provenance registries, theme override,
World Shelf, liminal capture) built in parallel lanes and reconciled.
Verification: `cargo test` 54 ✓, `npm run test` 47 ✓, `npm run build` ✓.
Docs: AGENTS.md precedence + ARCHITECTURE.md World Objects section.
Commits: `8789626` (backend), `afc0215` (frontend), `0ac6dc3` (docs).
Handoff written in PIPELINE.md. Known gaps (future phases): dedicated Liminal
view is a placeholder alert; export uses a text prompt for destination.
