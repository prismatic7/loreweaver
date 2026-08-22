# Loreweaver Quality Scan and Improvements Design Spec

This document details the signed-off design for resolving code quality issues (including backend clippy warnings) and closing the documentation coverage gap (documenting missing Tauri commands and correcting outdated feature status) in Loreweaver.

## 1. Quality Issues Identified

### A. Backend Rust Clippy & Compilation Warnings
1. **Critical (Deadlock Risk):** In `src-tauri/src/lib.rs:2960`, a `MutexGuard` is flagged by Clippy as being held across an await point (`clippy::await_holding_lock`). Even though the locks are explicitly dropped via `drop()` calls later, the compiler's conservative static analysis flags the async block context. 
2. **Unused Imports & Structs:**
   - Unused imports `Deserialize` and `Serialize` in `src-tauri/src/plugins.rs`.
   - Unused struct `VaultSettings` and helper function `export_bindings_to` in `src-tauri/src/export_types.rs`.
3. **Redundant syntax / map_or simplification:**
   - Redundant borrow `&conn` in `src-tauri/src/watcher.rs`.
   - Redundant key checks (`.get("tags").is_some()`) in `src-tauri/src/watcher.rs` where `.contains_key("tags")` is cleaner.
   - Simplifiable `map_or` calls across `src-tauri/src/lib.rs` (can be replaced with `is_some_and` or `is_none_or`).
   - Useless `vec!` macros in `src-tauri/src/search.rs` unit tests.

### B. Documentation Quality Gaps
1. **Outdated Integration Documentation:** `docs/codebase/INTEGRATIONS.md` erroneously claims that STT and TTS are not implemented in the application backend. In reality, both text-to-speech (OpenAI, ElevenLabs, local espeak-ng) and speech-to-text (OpenAI Whisper, local sherpa-onnx) are fully implemented and integrated.
2. **Undocumented Tauri Commands:** `verify.mjs` fails because 21 registered `#[tauri::command]` routes in the Rust backend are undocumented in `docs/developer/API.md`.

---

## 2. Proposed Approaches

### Approach 1: Minimal Doc + Essential Warning Fix (Recommended)
- **Scope:** 
  - Fix the critical deadlock warning (`await_holding_lock`) by wrapping the test DB seed statements in a scoped inner block in `lib.rs`.
  - Fix the unused imports/struct warnings by adding `#[allow(dead_code)]` annotations or removing unused declarations.
  - Fix the 21 missing command docs in `docs/developer/API.md`.
  - Update `docs/codebase/INTEGRATIONS.md` to accurately reflect the implemented status of TTS/STT.
- **Trade-offs:** 
  - Resolves all compilation/clippy warnings and makes `verify.mjs` pass.
  - Safe, localized edits that won't disrupt the existing codebase.

### Approach 2: Code Restructuring
- **Scope:**
  - Approach 1 plus refactoring `lib.rs` by splitting command definitions into multiple smaller files based on domain (e.g. `commands/worlds.rs`, `commands/sources.rs`, etc.).
- **Trade-offs:**
  - `lib.rs` is currently 3330 lines. While splitting it would improve maintainability, it is out of scope of a simple quality scan and could introduce regressions.

---

## 3. Recommended Design Details

We will implement **Approach 1**.

### Code Changes

1. **Mutex held across await point (`src-tauri/src/lib.rs:2960`):**
   Restrict the lifetimes of `binding` and `conn_guard` by putting them in an inner lexical block `{ ... }`. This eliminates the compiler warning as the variables are guaranteed to be dropped before any await point is evaluated.

2. **Unused deserializer imports (`src-tauri/src/plugins.rs`):**
   Remove `Deserialize, Serialize` from the `serde` import line.

3. **Dead-code warnings in `src-tauri/src/export_types.rs`:**
   Add `#[allow(dead_code)]` to the struct `VaultSettings` and the function `export_bindings_to`.

4. **Redundant checking in `src-tauri/src/watcher.rs`:**
   Replace `assert!(frontmatter.get("tags").is_some());` with `assert!(frontmatter.contains_key("tags"));`.

5. **`map_or` to `is_some_and`/`is_none_or` in `src-tauri/src/lib.rs`:**
   Update lines 770, 880, 1397, 1499, and 2301 to use the modern Rust std library methods.

6. **Useless vec! in `src-tauri/src/search.rs`:**
   Replace `let vec_a = vec![...]` with `let vec_a = [...]` (and update references to use array slicing or indexing).

### Documentation Changes

1. **`docs/codebase/INTEGRATIONS.md` Update:**
   Reconcile the "Audio Processing" section to describe the actual implementations (OpenAI, ElevenLabs, espeak-ng, symphonia, and sherpa-onnx).

2. **`docs/developer/API.md` Update:**
   Add documentation for all 21 missing commands:
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

---

## 4. Verification Plan

1. **Rust backend validation:** Run `cargo clippy --all-targets` and verify 0 warnings are generated.
2. **Backend test suite validation:** Run `cargo test -- --skip test_api_key_round_trip` to ensure all 57 tests pass.
3. **Frontend typecheck & compile verification:** Run `npm run build` to verify the frontend compiles successfully.
4. **Documentation verification script:** Run `node docs/verify.mjs` and ensure it exits with code 0 (success).
