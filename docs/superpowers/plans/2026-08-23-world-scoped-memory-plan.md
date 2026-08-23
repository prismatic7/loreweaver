# World-Scoped Memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make good on the design claim that each world has its own scoped agent memory that remembers nothing about other worlds. Storage is *already* per-world (each world = its own vault folder + `loreweaver_vault.db`; `switch_vault` swaps the whole connection). What's missing: the memory table never learns on its own, has no boundary guard, and one UI state leaks across worlds. This arc adds **auto-extraction** (the agent writes durable facts after each exchange), an **explicit isolation boundary** in the system prompt, and closes the **summary leak**.

**Architecture:** Worlds are vaults. `session_memory` lives in the world's DB (`db.rs:138`), injected into the system prompt each turn (`agent.rs:63-76`), newest-first, capped at 20 in context. Frontend chat is partitioned per-vault (`chatMessagesByVault[vaultPath]`). The Cascade pattern from the Creator's Instrument applies: memory is inherently per-world; the knobs we add are *extraction behaviour* and *hygiene*, not storage location.

**Tech Stack:** Rust (Tauri), React + TypeScript, SQLite, Markdown.

## Global Constraints

- **World isolation is sacred.** Nothing written by this arc may read or write memory outside the active world's DB. The active world is always `state.conn` — never a path-constructed connection.
- **Backward compatibility:** new settings get defaults that match current behaviour; existing worlds load unchanged.
- All tests must pass: `npm run test` and `cargo test -- --skip test_api_key_round_trip`.
- Do not modify existing command signatures unless a step says so (Tauri invoke contract).
- Build gotcha: Hermes sessions carry `NODE_ENV=production`, which omits devDeps. Use `NODE_ENV=development npm install` before frontend builds; `NODE_ENV=test` for vitest.
- Extraction is best-effort and silent. A failed extraction pass must never break the chat turn that triggered it. Failures log to console, never to the user's face.

---

## Phase 1 — The World Remembers (priority 1)

### Task 1: Backend extraction module (`memory.rs`)

The agent currently *reads* memory but never *writes* it. Add a dedicated module that turns a chat transcript into durable facts, mirroring the existing `summarize_session` shape (provider dispatch, settings loading, `run_blocking`).

**Files:**
- New: `src-tauri/src/memory.rs`
- Modify: `src-tauri/src/main.rs` (module declaration)
- Modify: `src-tauri/src/lib.rs` (command registration)

- [x] **Step 1: `extract_facts` function**
  Signature mirrors `summarize_session`'s internals:
  ```rust
  pub fn extract_facts(
      transcript: &str,
      provider: &str,
      model: &str,
      api_key: Option<&str>,
      base_url: Option<&str>,
      allow_local: bool,
      params: crate::providers::llm::SamplingParams,
      agent: &ureq::Agent,
  ) -> Result<Vec<(String, String)>, String>  // (fact, category)
  ```
  System prompt: "You are a campaign memory recorder. From the following GM/agent exchange, extract only durable, useful facts worth remembering across sessions — NPCs, factions, decisions made, plot threads opened or closed, world state changes. Skip chit-chat, pleasantries, and anything already implied by campaign notes. Return JSON: {\"facts\": [{\"fact\": \"...\", \"category\": \"npc|faction|decision|thread|world\"}]}. If nothing is worth remembering, return {\"facts\": []}."
  Call `llm::generate_response` with a minimal `SystemContext` (like `summarize_session` does).

- [x] **Step 2: Response parser**
  Parse the LLM's JSON response. Tolerate:
  - Markdown code fences around the JSON
  - Leading/trailing prose before/after the JSON object
  - Missing `facts` key → empty vec
  If JSON parse fails, fall back to treating each line starting with `- ` as a fact with category `general`.

- [x] **Step 3: Dedupe + cap helpers**
  In `memory.rs`:
  - `normalise(s: &str) -> String`: lowercase, trim, collapse internal whitespace.
  - `is_duplicate(new: &str, existing: &[String]) -> bool`: true when normalised forms are equal, or one contains the other (90%+ overlap via containment). Pragmatic, not fancy.
  - `insert_facts_deduped(conn, facts: Vec<(String,String)>) -> usize`: for each fact, skip if duplicate of any existing fact (normalised equality OR containment either direction); else `db::insert_session_memory`.
  - Cap: after insert, if count > 200, delete oldest beyond cap (`DELETE FROM session_memory WHERE id NOT IN (SELECT id FROM session_memory ORDER BY created_at DESC LIMIT 200)`).

- [x] **Step 4: Tauri command `extract_session_memories`**
  In `lib.rs`, mirror `summarize_session`:
  ```rust
  #[tauri::command]
  async fn extract_session_memories(
      state: State<'_, AppState>,
      messages_json: &str,
      provider: &str,
      model: &str,
      api_key: Option<&str>,
      base_url: Option<&str>,
  ) -> Result<usize, String>
  ```
  Loads `allow_local` + `SamplingParams` from settings (same block as `summarize_session`), validates provider URL, builds the transcript prompt, `run_blocking` → `extract_facts` → `insert_facts_deduped` (needs the DB connection inside the blocking closure) → returns count inserted.
  Register in the invoke_handler.

- [x] **Step 5: Tests**
  - `test_normalise`: case/whitespace collapse.
  - `test_is_duplicate`: exact, substring, near-match (90% containment), distinct.
  - `test_parse_extraction_response`: clean JSON, fenced JSON, prose-wrapped JSON, plain `- ` bullets, empty.
  - `test_insert_facts_deduped`: inserts new, skips dupes, returns correct count, caps at 200.
  - Run: `cargo test -- --skip test_api_key_round_trip` → all pass.

### Task 2: Explicit isolation boundary in the system prompt

Storage is isolated by construction; make the invariant visible to the model so a future shared-context refactor can't silently leak.

- [x] **Step 1: Boundary line in `build_system_context`**
  In `agent.rs`, after the memory block (`agent.rs:71-75`), append: "You have no memory of any other world or campaign. All context above belongs to the current world only."
- [x] **Step 2: Test**
  `test_build_system_context_states_world_isolation`: assert the boundary sentence is present in the assembled prompt. Run `cargo test`.

### Task 3: Frontend — auto-extract after each agent turn

- [x] **Step 1: Fire extraction in `useAgent.ts`**
  In `sendMessage` (the `orchestrate_agent` success path, after `botResponse` is appended to `updateVaultChatMessages`): invoke `extract_session_memories` with `messagesJson: JSON.stringify([...currentChatMessages, userMsg, botMsg])` and the same provider/model/key/base from `settings` that `orchestrate_agent` used. `.then(() => loadMemoryFacts())` so the RightDrawer panel refreshes; `.catch(console.error)` — silent failure.
- [x] **Step 2: Guard against empty transcripts**
  Skip extraction if the user message is blank or the conversation has no bot response. (Cheap guard; the LLM pass itself returns `[]` for chit-chat.)
- [x] **Step 3: Verify**
  `npx tsc --noEmit` clean; `NODE_ENV=test npx vitest run` all pass. Manual (local LLM): chat in World A → facts appear in RightDrawer memory panel; switch to World B → memory empty; return to A → facts still there.

### Task 4: Close the summary leak (cheap)

- [x] **Step 1: Key `summaryText` by vault**
  In `useAgent.ts`, change `summaryText: string` to `summaryByVault: Record<string, string>`; `currentSummaryText = summaryByVault[vaultPath] || ""`. Update `handleSummarizeSession` to write to `summaryByVault[vaultPath]`.
- [x] **Step 2: Verify** — summarize in World A, switch to B, summary panel shows nothing (not A's). `tsc` + `vitest`.

---

## Phase 2 — Memory Hygiene (deferred, not now)

- Auto-extract toggle (global setting, default on) + per-world override in the Cascade style.
- Memory panel upgrades: category chips, importance, manual "remember this" from a message.
- Age-out/consolidation: periodic summarisation of old facts into canon notes (SESSION_LOG) instead of blind cap.
- Cross-world *deliberate* sharing (session clone exists; consider an explicit "shared canon" pin) — only if play demands it.

## Verification

- Backend: `cargo test -- --skip test_api_key_round_trip` (expect 60+ passing, incl. new memory tests).
- Frontend: `npx tsc --noEmit` clean; `NODE_ENV=test npx vitest run` (92 passing).
- Manual isolation check: World A chat creates facts; World B shows none; World A still shows them after round-trip.
- Commit per task; commit messages follow `feat(memory): ...` / `test(memory): ...` convention.
