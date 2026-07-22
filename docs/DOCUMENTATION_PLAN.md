# Loreweaver Documentation Phase Plan

An overnight, local-model-friendly plan to bring Loreweaver's docs from "architecture notes" to a complete, consistent, and maintainable documentation suite. This plan is designed to be handed off to a local coding agent and executed in bounded chunks without requiring human interaction until final review.

## Scope

**In scope:**
- Reconcile aspirational root docs (`README.md`, `ARCHITECTURE.md`) with the actual codebase.
- Complete and refresh `docs/codebase/*.md` (architecture, stack, structure, conventions, integrations, concerns, testing).
- Generate user-facing docs: quickstart, feature guide, settings reference.
- Generate developer docs: API/command reference, plugin authoring guide, contributor setup.
- Add lightweight doc-validation checks (link consistency, code sample freshness, build gate).

**Out of scope (do not change without explicit user approval):**
- No code behavior changes unless a doc reveals a real bug that must be fixed to make the doc accurate.
- No new plugin permissions or sandbox changes.
- No embedding model/dimension changes.
- No new image-generation backend wiring.

## Current State

The repo already has a solid skeleton:

- `docs/codebase/ARCHITECTURE.md` — system shape, data flow, backend layers, plugin model.
- `docs/codebase/STACK.md` — dependencies and tooling.
- `docs/codebase/STRUCTURE.md` — directory layout and entry points.
- `docs/codebase/CONVENTIONS.md` — naming and data shapes.
- `docs/codebase/INTEGRATIONS.md` — filesystem, DB, search, AI providers, plugins.
- `docs/codebase/CONCERNS.md` — highest-risk areas and intent-vs-reality gaps.
- `docs/codebase/TESTING.md` — build-only verification, no test suite.
- `AGENTS.md` — project guide for AI agents, links to the docs above.
- `.github/agents/*.agent.md` — three role-scoped subagents.

Gaps to close:

1. Root `README.md` and `ARCHITECTURE.md` still claim features not implemented (real image generation, memory backends, PDF/HTML rulebook ingestion, TTS/STT backends).
2. No user-facing quickstart or feature walkthrough.
3. No generated API/command reference for the 30+ Tauri commands in `src-tauri/src/lib.rs`.
4. No plugin authoring guide beyond the two small examples.
5. No `CONTRIBUTING.md` or build troubleshooting guide.
6. `docs/codebase/*.md` still contain `[TODO]` and `[ASK USER]` markers that should be resolved or turned into tracked decisions.
7. No automated doc consistency check.

## Deliverables

### D1. Root README Refresh
**File:** `README.md`
**Goal:** Accurate, user-facing landing page that matches what the app actually does today.
**Content:**
- One-paragraph product description.
- "What works today" feature list (vault notes, wikilinks, semantic search, AI chat, rule ingestion, plugins, canvas, dice roller).
- "Known gaps" callout (image gen is placeholder, TTS/STT not wired, plugin sandbox is lightweight).
- Quickstart: `npm install`, `npm run tauri dev`.
- Link to `docs/user/QUICKSTART.md` and `docs/developer/CONTRIBUTING.md`.

### D2. Root Architecture Refresh
**File:** `ARCHITECTURE.md`
**Goal:** High-level architecture doc that is honest about current implementation vs future vision.
**Content:**
- Keep the Tauri + React + Rust diagram.
- Mark each subsystem as `Implemented`, `Partial`, or `Planned`.
- Remove or clearly label speculative technologies not in use (`sqlite-vec`, `pulldown-cmark`, `deno_core`, Lexical/Milkdown, Zustand/Signals).
- Cross-link to `docs/codebase/ARCHITECTURE.md` for the ground-truth details.

### D3. Codebase Docs Refresh
**Files:** `docs/codebase/*.md`
**Goal:** Resolve `[TODO]` markers, remove stale claims, add evidence links.
**Tasks per file:**
- `ARCHITECTURE.md` — add command surface summary, note image-gen placeholder.
- `STACK.md` — confirm actual deps from `package.json` and `Cargo.toml`; remove unverified claims.
- `STRUCTURE.md` — add `docs/` and `.github/agents/` layout; remove the stale "no source docs directory" TODO.
- `CONVENTIONS.md` — document the `data-od-id` automation selectors, strict TS rules, `Result<T, String>` pattern.
- `INTEGRATIONS.md` — add provider matrix (which providers are actually implemented vs listed in UI).
- `CONCERNS.md` — resolve the two `[ASK USER]` questions by documenting the current decision (placeholder stays, Boa sandbox stays lightweight until explicitly hardened).
- `TESTING.md` — add a "how to add tests" section and a manual QA checklist.

### D4. User Docs
**Files:**
- `docs/user/QUICKSTART.md` — install, first vault, first note, first search, first AI chat.
- `docs/user/FEATURES.md` — vault editor, wikilinks, search, rules/ingestion, AI architect, asset generator (with caveat), canvas, dice roller, plugins.
- `docs/user/SETTINGS.md` — provider tabs, model fields, connection test, embedding dimension caveat.

### D5. Developer Docs
**Files:**
- `docs/developer/CONTRIBUTING.md` — setup, build commands, agent file usage, PR conventions.
- `docs/developer/API.md` — generated reference of all `#[tauri::command]` functions in `src-tauri/src/lib.rs`: name, args, return type, one-line purpose, frontend call site in `App.tsx` if any.
- `docs/developer/PLUGIN_AUTHORING.md` — manifest format, hook function contract, state persistence, Boa limitations, examples.
- `docs/developer/TROUBLESHOOTING.md` — common failures (Cargo missing, model download offline, plugin permission error, vault switch not refreshing).

### D6. Doc Consistency Guard
**File:** `scripts/verify-docs.sh` (or `docs/verify.mjs` if Node-only)
**Goal:** Cheap, local-model-runnable check that docs do not drift from code.
**Checks:**
- Every `docs/codebase/*.md` evidence link points to a file that exists.
- Every Tauri command in `lib.rs` is mentioned in `docs/developer/API.md`.
- Every `invoke("...")` in `src/App.tsx` has a matching command in `lib.rs`.
- No broken internal markdown links (relative paths).
- `npm run build` passes.

## Execution Chunks (Overnight Friendly)

Each chunk is bounded to ~30–60 minutes of local-model work and produces a single commit-worthy artifact.

### Chunk 1: Ground Truth Refresh
**Inputs:** `docs/codebase/*.md`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
**Output:** Updated `docs/codebase/STACK.md`, `docs/codebase/STRUCTURE.md`, `docs/codebase/CONVENTIONS.md`
**Stop condition:** All `[TODO]` markers in those three files resolved or converted into tracked issues.
**Verification:** `npm run build` passes; no broken internal links.

### Chunk 2: Architecture Honesty Pass
**Inputs:** `docs/codebase/ARCHITECTURE.md`, `docs/codebase/INTEGRATIONS.md`, `docs/codebase/CONCERNS.md`, `src-tauri/src/lib.rs`, `src/App.tsx`
**Output:** Updated `docs/codebase/ARCHITECTURE.md`, `docs/codebase/INTEGRATIONS.md`, `docs/codebase/CONCERNS.md`
**Stop condition:** Every "intent vs reality" gap is explicitly labeled; the two `[ASK USER]` questions in `CONCERNS.md` are answered with the current default decision.
**Verification:** `AGENTS.md` still links correctly to all updated docs.

### Chunk 3: Root Docs Reconciliation
**Inputs:** `README.md`, `ARCHITECTURE.md`, `docs/codebase/*.md`
**Output:** New `README.md` and `ARCHITECTURE.md`
**Stop condition:** No root doc claims a feature that is not implemented in code; all "planned" features are clearly marked as such.
**Verification:** A human could read only `README.md` and know exactly what the app does today.

### Chunk 4: API Reference Generation
**Inputs:** `src-tauri/src/lib.rs`, `src/App.tsx`
**Output:** `docs/developer/API.md`
**Stop condition:** Every `#[tauri::command]` function is listed with name, parameters, return type, and frontend usage (or "no frontend usage" if internal-only).
**Verification:** A script diff shows no commands missing from the reference.

### Chunk 5: Plugin Authoring Guide
**Inputs:** `src-tauri/src/plugins.rs`, `plugins/character-roller/`, `plugins/threat-evaluator/`, `public/sample_vault/plugins/5e-dice-roller/`
**Output:** `docs/developer/PLUGIN_AUTHORING.md`
**Stop condition:** A new plugin author can write a manifest + `index.js` without reading the Rust host code.
**Verification:** The guide's example plugin loads successfully in the existing host.

### Chunk 6: User Docs
**Inputs:** `src/App.tsx`, `docs/codebase/*.md`
**Output:** `docs/user/QUICKSTART.md`, `docs/user/FEATURES.md`, `docs/user/SETTINGS.md`
**Stop condition:** Each doc covers only features that exist today; every UI label matches the code.
**Verification:** Screenshots not required, but every `data-od-id` control mentioned must exist in `App.tsx`.

### Chunk 7: Contributor + Troubleshooting Docs
**Inputs:** `AGENTS.md`, `.github/agents/*.agent.md`, `run.sh`, `docs/codebase/TESTING.md`
**Output:** `docs/developer/CONTRIBUTING.md`, `docs/developer/TROUBLESHOOTING.md`, updated `docs/codebase/TESTING.md`
**Stop condition:** A new contributor can set up, build, and run the app using only these docs.
**Verification:** Follow the setup steps literally; if Cargo is unavailable, note it but do not block.

### Chunk 8: Doc Verification Script
**Inputs:** All docs, `src-tauri/src/lib.rs`, `src/App.tsx`
**Output:** `scripts/verify-docs.sh`
**Stop condition:** Script runs locally and reports pass/fail for link existence, command coverage, and build gate.
**Verification:** Run the script; fix any failures it surfaces.

## Handoff Format for Each Chunk

When a chunk finishes, the agent must produce a short handoff block:

```markdown
## Chunk N Handoff
- Files changed: ...
- Decisions made: ...
- Verification run: ...
- Blockers / needs human: ...
```

This block should be appended to `docs/DOCUMENTATION_PROGRESS.md` so the next session can resume without re-reading the entire repo.

## Boundaries and Safeguards

- **No speculative code changes.** If a doc inconsistency reveals a bug, document it in `docs/codebase/CONCERNS.md` or file a TODO rather than silently fixing behavior.
- **No permission/sandbox expansion.** Plugin docs must repeat that only `"hooks"` is allowed and that Boa is not a hardened sandbox.
- **No embedding model changes.** Docs must keep the 384-dimension caveat and the full-reindex warning.
- **No image-gen backend wiring.** Docs must describe the current placeholder UI and the backend functions that already exist (`generate_image`, ComfyUI/Stable Diffusion/Stability branches) but note they are not yet invoked from the UI.
- **Build gate.** Every chunk ends with `npm run build` if it touches frontend or docs that reference frontend types. Rust changes are not expected; if any occur, `cargo check` from `src-tauri/` must be attempted and the result recorded.

## Success Criteria

1. A new user can install and run Loreweaver using only `README.md` + `docs/user/QUICKSTART.md`.
2. A new contributor can set up and build using only `docs/developer/CONTRIBUTING.md`.
3. A plugin author can write a plugin using only `docs/developer/PLUGIN_AUTHORING.md`.
4. `docs/codebase/*.md` contain no unresolved `[TODO]` or `[ASK USER]` markers.
5. `scripts/verify-docs.sh` passes on `main`.
6. `npm run build` passes after the final chunk.

## Suggested Commit Strategy

One commit per chunk, conventional-commit style:

```
docs: refresh codebase stack/structure/conventions
docs: reconcile architecture and concerns with current implementation
docs: rewrite root README and ARCHITECTURE for accuracy
docs: add generated Tauri command API reference
docs: add plugin authoring guide
docs: add user quickstart, features, and settings guides
docs: add contributing, troubleshooting, and testing updates
tool: add docs verification script
```

## First Step for the Local Model

Read `AGENTS.md` and `docs/codebase/CONCERNS.md`, then execute **Chunk 1: Ground Truth Refresh**. Stop after that chunk and record the handoff block in `docs/DOCUMENTATION_PROGRESS.md`.
