# TASK: fate-of-cthulhu — Phase 2: Build (foundation + architectural core)

## Goal
Build the foundation and architectural core of the FATE of Cthulhu campaign
tool per DESIGN_SKETCH.md (the signed-off phase 1 output). This phase makes
the repo's docs real, corrects the agent constitution, and builds the
backend architecture for provenance, bible conditioning, and capture.

## Context
Loreweaver is a local-first TTRPG campaign manager (Tauri v2, React 19 + TS
frontend, Rust backend, SQLite, hybrid search, RAG Architect, Boa plugin
runtime). Phase 0 recon (RECON.md) established: all 7 campaign-loop features
are real; DESIGN.md / PRODUCT.md / FEATURE_PROPOSAL.md exist in the main repo
but are UNTRACKED (hence invisible to worktree agents — the docs problem);
AGENTS.md test claims are stale; no campaign-bible conditioning exists.
Phase 1 devising produced DESIGN_SKETCH.md — the contract for this phase.

## Doc precedence (read before making claims)
1. **DESIGN_SKETCH.md** — the signed-off design for THIS campaign build
2. **DESIGN.md** — the design north star ("The Tactile Ledger")
3. **PRODUCT.md** — product intent
4. **docs/codebase/*** — current code reality (source of truth for what exists)

## Scope

### 1. Docs foundation
- Commit DESIGN.md, PRODUCT.md, FEATURE_PROPOSAL.md, DESIGN_SKETCH.md,
  RECON.md, PIPELINE.md, TASK.md to this worktree branch
- Update AGENTS.md:
  - Add doc precedence: DESIGN_SKETCH.md > DESIGN.md > PRODUCT.md >
    docs/codebase/*
  - Correct the stale test claims (8 Vitest suites + ~29 Rust tests exist;
    `npm run test` and `cargo test` are real verification paths)
- Fix ARCHITECTURE.md:71 hardcoded absolute path (points at a different
  repo dir — `loreweaver`, not this worktree)

### 2. Provenance model (depth depth depth)
- Add provenance to notes: source type (canon / history / invention as
  default taxonomy, user-definable), title, author, source, date
- Source nodes in the entity graph: sources appear as nodes, notes link to
  their sources
- Filtering by provenance as a first-class interaction: "show me only
  canon", "show me what's connected to X"
- Design the data model (db.rs) and frontend graph integration; keep the
  taxonomy extensible (custom types)

### 3. Bible conditioning (always-on)
- Campaign bible folder convention: `bible/` with TONE.md, TOUCHSTONES.md,
  THE_PLAN.md, CONSPIRACY.md, PEOPLE.md, PLACES.md, RULES.md, SESSION_LOG.md
- Always-on injection into build_system_context (agent.rs): the bible is
  injected as a fixed conditioning block, NOT retrieved-by-similarity
- The Muse can't generate off-tone even when the query is vague

### 4. Capture inbox (the shoggoth's mouth)
- First-class scratchpad surface: one place, always open, accepts anything
  (text, paste, URL, file drop)
- Things land first, get triaged, get linked
- Backend: capture command(s) in lib.rs; frontend: inbox view

### 5. Web clipping (app pulls the page)
- In-app fetch: paste URL → app fetches → readability extraction → markdown
  note with provenance (URL, site, fetch date)
- Backend module + frontend flow

## Out of scope (later phases)
- Live STT mic dictation (speech.rs local STT)
- Era-hopping timeline UI (eras as first-class, era-switch navigation)
- Interactive entity graph (force layout, drag, zoom)
- Auto post-session capture
- Muse sidebar in every view
- PDF import → markdown pipeline
- Comics image handling

## Acceptance criteria
- [ ] Docs committed; AGENTS.md updated with precedence + correct test claims
- [ ] Provenance fields on notes; sources visible as graph nodes; filtering works
- [ ] Bible folder convention documented; bible injected always-on in
      build_system_context (evidence: agent.rs diff)
- [ ] Capture inbox accepts text/paste/URL/file; captures land as notes
- [ ] Web clipping fetches a URL → readable markdown note with provenance
- [ ] `npm run build` passes; `npm run test` passes; `cargo test` passes
- [ ] No regressions in existing features (timeline, graph, canvas, chat,
      session memory, STT/TTS, plugins)

## Harness & budget
- Harness: opencode
- Budget: this is the architectural core — take the time to do it right,
  but keep changes minimal and focused. Commit work on this branch. Write
  status to the Status section of this file and the handoff log in
  PIPELINE.md on exit.

## Status
- [ ] In progress
