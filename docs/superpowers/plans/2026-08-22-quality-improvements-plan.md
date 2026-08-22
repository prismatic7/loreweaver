# Quality Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all Rust backend clippy warnings, update integrations documentation, and document all 21 missing Tauri commands to make the documentation validation script (`verify.mjs`) pass clean.

**Architecture:** Scope Mutex guard locks to avoid holding them across async awaits, clean up unused types/imports, update markdown documents to align documentation with implementation reality.

**Tech Stack:** Rust (Tauri), Node.js (verification), Markdown.

## Global Constraints
- Do not modify existing code behavior or interfaces.
- Silenced dead code lints should use explicit `#[allow(dead_code)]` annotations rather than deleting exported Specta structures.
- All tests must pass: `npm run test` and `cargo test -- --skip test_api_key_round_trip`.

---

### Task 1: Resolve Rust Backend Clippy Warnings

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/plugins.rs`
- Modify: `src-tauri/src/export_types.rs`
- Modify: `src-tauri/src/watcher.rs`
- Modify: `src-tauri/src/search.rs`

- [ ] **Step 1: Scope Mutex guards in `src-tauri/src/lib.rs` tests**
  Modify line 2957-2979 in `src-tauri/src/lib.rs` to restrict the lexical lifetimes of `binding` and `conn_guard` within an inner scope `{ ... }`:
  ```rust
          tauri::async_runtime::block_on(async {
              // Create notes in DB from disk content
              {
                  let binding = state.conn.lock().await;
                  let conn_guard = binding.lock().map_err(|e| e.to_string()).unwrap();
                  let _ = db::upsert_note(
                      &conn_guard,
                      "Worldbuilding/50% discount.md",
                      "50% discount",
                      "content",
                      &HashMap::new(),
                  )
                  .unwrap();
                  let _ = db::upsert_note(
                      &conn_guard,
                      "Worldbuilding/Goblin.md",
                      "Goblin",
                      "content",
                      &HashMap::new(),
                  )
                  .unwrap();
              }
  ```

- [ ] **Step 2: Remove unused imports in `src-tauri/src/plugins.rs`**
  Modify line 34 in `src-tauri/src/plugins.rs` to remove unused imports `Deserialize, Serialize`:
  ```rust
  use crate::PluginInfo;
  use std::collections::HashMap;
  ```

- [ ] **Step 3: Allow dead code for exported Specta types in `src-tauri/src/export_types.rs`**
  Add `#[allow(dead_code)]` above `VaultSettings` and `export_bindings_to` in `src-tauri/src/export_types.rs`:
  ```rust
  #[allow(dead_code)]
  #[derive(Serialize, Deserialize, Clone, Debug, Default, Type)]
  pub struct VaultSettings {
  ```
  and
  ```rust
  #[allow(dead_code)]
  pub fn export_bindings_to(path: impl AsRef<std::path::Path>) {
  ```

- [ ] **Step 4: Update map_or and get checks in `src-tauri/src/watcher.rs` and `src-tauri/src/lib.rs`**
  - In `src-tauri/src/watcher.rs:430`, change:
    `assert!(frontmatter.get("tags").is_some());` -> `assert!(frontmatter.contains_key("tags"));`
  - In `src-tauri/src/lib.rs`, replace map_or helpers with modern equivalents:
    - Line 467: `serde_json::from_str(&meta.1).unwrap_or(Value::String(meta.1))`
    - Line 770: `if path.is_file() && path.extension().is_some_and(|ext| ext == "md") {`
    - Line 880: `if path.is_file() && path.extension().is_some_and(|ext| ext == "md") {`
    - Line 1397: `if !path.is_file() || path.extension().is_none_or(|ext| ext != "md") {`
    - Line 1499: `if path.is_file() && path.extension().is_some_and(|ext| ext == "md") {`
    - Line 2301: `if path.is_file() && path.extension().is_some_and(|ext| ext == "md") {`

- [ ] **Step 5: Replace vec! with arrays in `src-tauri/src/search.rs` test**
  Modify lines 760-762 in `src-tauri/src/search.rs` to use raw arrays:
  ```rust
          let vec_a = [1.0f32, 0.0f32, 0.0f32];
          let vec_b = [1.0f32, 0.0f32, 0.0f32];
          let vec_c = [0.0f32, 1.0f32, 0.0f32];
  ```

- [ ] **Step 6: Run cargo clippy & cargo test**
  Run: `cargo clippy --all-targets` and `cargo test -- --skip test_api_key_round_trip` from `src-tauri/`
  Expected: 0 warnings, all tests pass.

- [ ] **Step 7: Commit clippy fixes**
  ```bash
  git add src-tauri/src/
  git commit -m "chore: resolve rust clippy and compilation warnings"
  ```

---

### Task 2: Correct TTS/STT Integrations Documentation

**Files:**
- Modify: `docs/codebase/INTEGRATIONS.md`

- [ ] **Step 1: Update Audio Processing description**
  Update the "Future Integrations Status" or "Audio Processing" section in `docs/codebase/INTEGRATIONS.md` to show that TTS (OpenAI, ElevenLabs, espeak-ng) and STT (OpenAI Whisper, sherpa-onnx) are fully implemented.

- [ ] **Step 2: Commit documentation correction**
  ```bash
  git add docs/codebase/INTEGRATIONS.md
  git commit -m "docs: correct integrations documentation for TTS/STT"
  ```

---

### Task 3: Document All 21 Missing Commands in API.md

**Files:**
- Modify: `docs/developer/API.md`

- [ ] **Step 1: Document missing commands in API.md**
  Add detailed documentation block (name, arguments, return type, description) for each of the 21 missing commands:
  - `reindex_vault`
  - `convert_pdf_to_markdown`
  - `save_session_memory`
  - `list_session_memory`
  - `delete_session_memory`
  - `list_sources`
  - `save_source`
  - `delete_source`
  - `get_source`
  - `capture_note`
  - `get_world_manifest`
  - `list_worlds`
  - `create_world`
  - `export_world`
  - `import_world`
  - `list_liminal_notes`
  - `claim_liminal_note`
  - `make_world_from_liminal`
  - `clip_webpage`
  - `summarize_session`
  - `transcribe_speech`

- [ ] **Step 2: Run verification script**
  Run: `node docs/verify.mjs`
  Expected: SUCCESS

- [ ] **Step 3: Commit API docs update**
  ```bash
  git add docs/developer/API.md
  git commit -m "docs: add documented commands in API.md"
  ```
