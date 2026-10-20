# Loreweaver Feature Set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 12-feature set proposed from the codebase gap analysis: capability audit, embedding-dimension safety, offline model bundle, vault lifecycle tests, settings round-trip test, plugin host command test, plugin heap-memory cap (decision pending), Architect tool-call audit log, App.tsx split, `any` replacement, offline-mode toggle, synonym lexicon editor.

**Architecture:** Each feature is an independent subsystem with its own task list; features 1–6 are mechanical/safety work that can ship in any order, 7 needs an explicit user decision before implementation, 8–10 are maintainability work that touches the monolithic `App.tsx`, and 11–12 are experimental UX additions. No feature depends on another's code except 11 (offline mode) building on 3 (offline bundle) and 8 depending on 9's split only if done first.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Tauri v2, Rust 2021, SQLite (rusqlite bundled), Vitest + RTL, cargo test.

**Spec:** `docs/codebase/CONCERNS.md`, `docs/codebase/TESTING.md`, `docs/codebase/CONVENTIONS.md` (source of truth for gaps).

## Global Constraints

- All vault file writes go through `validate_safe_path` (Rust) / existing backend commands (frontend) — never bypass.
- New Tauri commands return `Result<T, String>` and get a matching `allow-*` entry in `src-tauri/capabilities/default.json`.
- No new dependencies without explicit approval; prefer stdlib/platform features.
- Strict TypeScript: no new `any`; `npm run build` is the type-check gate.
- Cross-vault state bleed forbidden: new global state must be keyed by vault path (`scoped_state_key` pattern).
- Plugin permission allow-list (`validate_permissions`) stays `"hooks"` only unless user explicitly widens it.
- Embedding dimensionality stays 384; any change requires a full reindex and user sign-off.
- Australian English in prose; no idioms.

## Review Focus

1. A missing capability entry silently rejects the frontend `invoke` at runtime — the audit must be verified by actually calling each command from the frontend, not just diffing lists.
2. A dimension mismatch in search must fail loudly (error/panic) rather than truncate — verify with a deliberately wrong-length vector test.
3. Cross-vault state bleed in the new Architect tool-call log and offline-mode toggle — must be keyed by vault path / run id, mirroring `agent_runs`.
4. Plugin heap cap cannot be enforced in Boa 0.19 — the decision must be recorded before any code ships, not silently worked around.
5. App.tsx split must not change behavior — every existing test must still pass unchanged; no logic moves, only extraction.

---

## Feature 1: Capability Entries Audit

**Files:** Modify `src-tauri/capabilities/default.json`; possibly `src-tauri/src/lib.rs` (handler registration check).

**Interfaces:** None new — verification only.

- [ ] **Step 1: Enumerate all `#[tauri::command]` handlers in `lib.rs` and all `allow-*` entries in `default.json`; diff.**
  Run: `grep -oE '#\[tauri::command\]' ...` cross-check with `grep allow- default.json`.
  Expected: list of mismatches.
- [ ] **Step 2: Add missing `allow-*` entries for each of: cancel_agent_stream, approve_agent_tool, reject_agent_tool, scaffold_plugin, run_schedule_now, evaluate_expression, extract_session_memories, list_bible_files, update_bible_files.**
- [ ] **Step 3: Add a `verify-docs`-style check (extend `docs/verify.mjs` or add `scripts/verify-capabilities.mjs`) that fails if any command lacks an entry.**
  Run: `npm run verify-docs` (extended). Expected: PASS.
- [ ] **Step 4: Commit** `git commit -m "fix: add missing capability allow entries"`.

## Feature 2: Embedding-Dimension Safety

**Files:** Modify `src-tauri/src/search.rs` (similarity helper); Test `src-tauri/src/search.rs` (unit tests).

**Interfaces:** `fn cosine_similarity(a: &[f32], b: &[f32]) -> Result<f32, String>` (change from infallible to fallible) or assert-equal inside; callers in `search.rs` propagate.

- [ ] **Step 1: Write failing test** — `test_cosine_similarity_rejects_mismatched_dims` asserting `Err` when lengths differ.
- [ ] **Step 2: Run test** `cargo test search::` — Expected: FAIL (currently infallible).
- [ ] **Step 3: Implement** — change helper to return `Result`; on mismatch return `Err("embedding dimension mismatch: ...")`; update call sites to propagate (or skip with logged warning at search boundary, not silently).
- [ ] **Step 4: Run tests** `cargo test` — Expected: PASS.
- [ ] **Step 5: Commit.**

## Feature 3: Offline Model Bundle / Cached Embeddings

**Files:** Modify `src-tauri/src/search.rs` (model load path); possibly `src-tauri/src/lib.rs` (settings for model path); frontend `src/hooks/useSettings.ts` or new `src/components/ModelStatus.tsx`.

**Interfaces:** `load_embedding_model() -> Result<Model, String>` gains a `model_available: bool` signal surfaced to UI.

- [ ] **Step 1: Audit current model-download code path** (search.rs download from Hugging Face). Document failure mode.
- [ ] **Step 2: Add a graceful "model missing" state** — search returns a typed error `ModelNotAvailable` instead of panicking; frontend shows a "download model" affordance.
- [ ] **Step 3: Add optional local-model path setting** — user can point at a pre-downloaded ONNX model dir; validate existence before use.
- [ ] **Step 4: Tests** — unit test for missing-model path returns `ModelNotAvailable`; frontend test for status indicator.
- [ ] **Step 5: Commit.**

## Feature 4: Vault Lifecycle Command Tests

**Files:** Test `src-tauri/src/lib.rs` (integration tests) or new `src-tauri/tests/vault_lifecycle.rs`.

**Interfaces:** Existing commands `switch_vault`, `create_vault`, `delete_vault` — no change.

- [ ] **Step 1: Write failing tests** for create → switch → delete round-trip using temp dir DB.
- [ ] **Step 2: Run** `cargo test vault` — Expected: FAIL (no tests) or PASS if already covered (verify).
- [ ] **Step 3: If commands have bugs surfaced, fix in lib.rs**; otherwise tests only.
- [ ] **Step 4: Run** `cargo test` — Expected: PASS.
- [ ] **Step 5: Commit.**

## Feature 5: Settings Round-Trip Test

**Files:** Test `src-tauri/src/lib.rs` or `db.rs`.

- [ ] **Step 1: Write failing test** — save settings, reload, assert equality including keyring handle shape.
- [ ] **Step 2: Run** — Expected: FAIL/PASS.
- [ ] **Step 3: Fix any surfacing bug.**
- [ ] **Step 4: Run** `cargo test`.
- [ ] **Step 5: Commit.**

## Feature 6: Plugin Host Command-Level Test

**Files:** Test `src-tauri/src/lib.rs`.

- [ ] **Step 1: Write failing test** for `execute_plugin_hook` command (permission rejection, missing file, timeout).
- [ ] **Step 2: Run** `cargo test plugin`.
- [ ] **Step 3: Fix surfacing gaps.**
- [ ] **Step 4: Run** `cargo test`.
- [ ] **Step 5: Commit.**

## Feature 7: Plugin Heap-Memory Cap (DECISION PENDING)

**Status:** Boa 0.19 exposes no heap cap. Options: (a) accept residual risk (current), (b) pre-scan plugin JS for unbounded allocation patterns (heuristic, bypassable), (c) migrate plugin host to a runtime with memory limits (large). **No code until user picks.**

- [ ] **Step 1: Record decision** in `docs/codebase/CONCERNS.md` (Decided Decisions section) with rationale.
- [ ] **Step 2: If (b) chosen, implement heuristic scanner in `plugins.rs` + test.**
- [ ] **Step 3: If (c) chosen, separate plan required (out of scope here).**

## Feature 8: Architect Tool-Call Audit Log

**Files:** Modify `src-tauri/src/agent.rs` (emit tool calls already via AgentEvent; persist per-run log), `src-tauri/src/lib.rs` (new command `list_agent_tool_calls(run_id)` or include in done event), frontend `src/hooks/useAgent.ts` (accumulate), `src/components/AgentMessageBlock.tsx` (render).

**Interfaces:** `AgentEvent::ToolCall { name, args, result }` already exists; add `run_id: String` to log entries keyed by run id in `AppState` (mirroring `agent_runs`).

- [ ] **Step 1: Write failing frontend test** — `AgentMessageBlock` renders a collapsible "Tools" list with name + result.
- [ ] **Step 2: Run** `npm run test` — Expected: FAIL.
- [ ] **Step 3: Implement** minimal accumulation + render; persist run log in AppState keyed by run id (cleared on command return, like agent_runs).
- [ ] **Step 4: Run** `npm run build && npm run test`.
- [ ] **Step 5: Commit.**

## Feature 9: App.tsx Split

**Files:** Create `src/components/<Panel>.tsx` per domain (SettingsPanel, ChatPanel, SearchPanel, DicePanel); Modify `src/App.tsx` (compose).

**Interfaces:** Props interfaces extracted; no new Tauri commands.

- [ ] **Step 1: Identify extraction candidates** in App.tsx (state hooks already in `src/hooks/` — components are the thin render layer).
- [ ] **Step 2: Extract one panel at a time**, keeping all tests green after each.
- [ ] **Step 3: Run** `npm run build && npm run test` after each extraction.
- [ ] **Step 4: Commit** per panel.

Constraint: behavior-preserving refactor; existing tests must pass unchanged.

## Feature 10: Replace `any` with Typed Shapes

**Files:** `src/App.tsx` and hooks/components flagged by `grep -rn ': any' src/`.

- [ ] **Step 1: Enumerate all `any` usages** with locations.
- [ ] **Step 2: Replace each with the documented data shape** from CONVENTIONS.md (notes: id/title/path/frontmatter/content; rules: id/title/category/source/path/content; search results: type/title/snippet/score/path).
- [ ] **Step 3: Run** `npm run build && npm run lint`.
- [ ] **Step 4: Commit.**

## Feature 11: Offline-Mode Toggle for Architect

**Files:** Modify `src-tauri/src/agent.rs` (provider selection), `src-tauri/src/lib.rs` (setting `offline_mode`), frontend settings UI.

**Interfaces:** Depends on Feature 3 (model availability signal). New setting `offline_mode: bool` in app settings table.

- [ ] **Step 1: Add `offline_mode` setting** to db schema (migration) + load/save commands.
- [ ] **Step 2: In agent orchestration, when offline_mode true, reject cloud providers** with a clear error and require Ollama/local.
- [ ] **Step 3: Frontend toggle** in settings panel + status indicator.
- [ ] **Step 4: Tests** — backend unit test for rejection; frontend test for toggle.
- [ ] **Step 5: Commit.**

## Feature 12: Synonym Lexicon Editor

**Files:** New `src/components/LexiconEditor.tsx`; modify `src-tauri/src/lib.rs` (commands `load_lexicon`, `save_lexicon` with validate_safe_path), `src-tauri/src/search.rs` (already reads `<vault>/lexicon/synonyms.json`).

**Interfaces:** `load_lexicon(vault_path) -> Result<Lexicon, String>`, `save_lexicon(vault_path, lexicon) -> Result<(), String>`.

- [ ] **Step 1: Add backend commands** load/save with path validation; ensure `create_vault` seeds the file (already does).
- [ ] **Step 2: Frontend editor** — table of synonym pairs, add/remove, save.
- [ ] **Step 3: Tests** — backend command test; frontend render test.
- [ ] **Step 4: Commit.**

---

## Execution Order Recommendation

Mechanical/safety first (1, 2, 4, 5, 6), then maintainability (9, 10), then features needing decisions (7 needs your call), then experimental (3, 11, 12) which build on earlier ones, then 8 (audit log, independent). Feature 7 must not start without your decision recorded.

Each feature is independently shippable; pick any subset.