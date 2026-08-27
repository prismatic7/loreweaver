# Increment A — Plugin Ecosystem: Hook Event Bus + World State Persistence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Land Increment A from `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (Phase 3, lines 154-157): give the plugin system an **event bus** so plugins can react to app events (image generated, note saved, world state changed), and make plugin `__state` **survive restarts** by persisting it to disk. Today `run_plugin_hook` (plugins.rs) already delivers named hook calls with a permission guard, 32 KiB payload cap, hook-name sanitization, 5 s timeout, and in-memory `PLUGIN_STATES`; the gaps are (1) no event → hook fan-out layer, (2) plugin state is process-local only and lost on restart, (3) no app code emits events. The Marketplace CLI (`bb marketplace install/list`) is **out of scope** — it needs network/accounts; deferred as future work (see Deferred section).

**Architecture:** Tauri v2 monorepo — React 19 + TypeScript frontend (`src/`), Rust backend (`src-tauri/`). New module `src-tauri/src/event_bus.rs` (does not exist yet) fans events out to plugins via the existing `run_plugin_hook`. State persistence lives in `plugins.rs` (a new on-disk layer under the plugins dir — deliberately OUTSIDE the vault so the vault watcher never sees it).

**Gate:** *A plugin can receive an image event and persist world state* — covered by cargo tests: an event bus test registers a plugin with `on_image_generated`, emits the event, asserts the hook ran and `__state` mutated; a persistence test asserts the state is written to disk and restored on the next `load_all_plugins`.

## Global Constraints

- **Do NOT widen the plugin permission surface.** `ALLOWED_PERMISSIONS` stays `["hooks"]`. The event bus calls existing hooks with the existing guard — no new permissions.
- **No new Tauri commands.** The event bus is internal Rust; `verify-docs` only demands API.md coverage for `#[tauri::command]` functions, but keep docs current anyway (ARCHITECTURE.md, INTEGRATIONS.md, PLUGIN_AUTHORING.md).
- **No new crates.** Everything is std + serde_json (already in Cargo.toml).
- **Never emit the image bytes.** The 32 KiB payload cap means `image_generated` events carry a *summary* (prompt/style/provider/model), never the base64 data URL. Document this in PLUGIN_AUTHORING.md.
- **State files go under `<plugins_dir>/.state/<sanitized-vault>/`**, never inside the vault — the notify watcher must not see plugin runtime state.
- **Event hooks that a plugin doesn't define** ("is not callable") are skipped silently; real errors (eval/timeout) are logged and surfaced by `emit_sync`'s return value.
- **Blocking discipline:** command call sites use the fire-and-forget `emit` (detached thread); tests use `emit_sync`. Never hold DB/vault locks across event fan-out.
- Do not modify command signatures, plugin permissions, or vault-write paths. All gates green before commit.

---

## Task 1: Event bus module (`src-tauri/src/event_bus.rs`)

**Files:**
- New: `src-tauri/src/event_bus.rs`
- Modify: `src-tauri/src/lib.rs` (`mod event_bus;`)

- [x] **Step 1: Public event constants** — `EVENT_IMAGE_GENERATED = "image_generated"`, `EVENT_NOTE_SAVED = "note_saved"`, `EVENT_WORLD_STATE_CHANGED = "world_state_changed"`.
- [x] **Step 2: `hook_name_for_event(event) -> String`** — `format!("on_{}", event)` (e.g. `on_image_generated`). Event names are validated (alphanumeric + `_`); invalid names are skipped defensively.
- [x] **Step 3: `emit_sync(vault_path, event, payload: serde_json::Value) -> Vec<String>`** — iterates active plugin ids (new public accessor in plugins.rs), calls `run_plugin_hook(vault_path, id, &hook_name, &payload_string)` for each, silently drops `"is not callable"` errors, collects the rest. Returns collected errors.
- [x] **Step 4: `emit(vault_path, event, payload)`** — fire-and-forget: spawns a detached thread that runs `emit_sync`; errors go to `eprintln!`. Safe to call from async commands.
- [x] **Step 5: Wire the module** — `mod event_bus;` in lib.rs (private module, no specta types crossing IPC).

## Task 2: World state persistence (`src-tauri/src/plugins.rs`)

**Files:**
- Modify: `src-tauri/src/plugins.rs`

- [x] **Step 1: Global plugins dir** — `static PLUGINS_DIR: OnceLock<Mutex<String>>`; set inside `load_all_plugins` from `plugins_dir_str`.
- [x] **Step 2: State file path helper** — `fn plugin_state_file(plugin_id) -> PathBuf` = `<plugins_dir>/.state/<sanitized-vault>/<plugin_id>.json`; sanitize vault path by replacing `/`, `\`, `:` with `_`.
- [x] **Step 3: Restore on load** — in `load_all_plugins`, when initialising `PLUGIN_STATES`, read the on-disk file if present (fall back to `"{}"`).
- [x] **Step 4: Persist after hook** — in `run_plugin_hook`'s worker thread, after updating `PLUGIN_STATES`, write the new state JSON to disk (create dirs as needed; best-effort — a write failure logs, never fails the hook).
- [x] **Step 5: Active-plugin accessor** — `pub fn active_plugin_ids() -> Vec<String>` (cloned ids, for event_bus iteration).

## Task 3: Wire events into commands (`src-tauri/src/lib.rs`)

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [x] **Step 1: `image_generated`** — in `generate_image`, after a successful provider call inside the blocking closure, `event_bus::emit(&vault_path, EVENT_IMAGE_GENERATED, json!({ "prompt": ..., "style": ..., "provider": ..., "model": ... }))`. Capture a vault path clone into the closure.
- [x] **Step 2: `note_saved`** — in `save_note`, after the DB upsert, `event_bus::emit(...)` with `{ "id", "title", "path", "word_count" }` (word count from `note.content`).
- [x] **Step 3: `world_state_changed`** — in `update_bible_files`, after `save_manifest`, emit `{ "world_id", "name", "bible_files" }`.

## Task 4: Tests

**Files:**
- Modify: `src-tauri/src/plugins.rs` (tests module)
- New: tests inside `src-tauri/src/event_bus.rs`

- [x] **Step 1: Event bus gate test** (`event_bus.rs`) — register a test plugin whose `on_image_generated(payload)` parses the payload, stores `__state.last_event = payload`, returns `"ok"`; `emit_sync` → assert no errors, and `PLUGIN_STATES` (via a test-only accessor or by re-running a hook) shows the mutation.
- [x] **Step 2: Persistence round-trip test** (`plugins.rs`) — `load_all_plugins` with a temp plugins dir + vault; run a hook that mutates `__state`; assert the `.state/<vault>/<id>.json` file exists with the mutated JSON; call `load_all_plugins` again (simulating restart) and assert state restored.
- [x] **Step 3: Non-listener skip test** — a plugin without the hook produces no error from `emit_sync`.

## Task 5: Docs

**Files:**
- Modify: `docs/codebase/ARCHITECTURE.md` (plugin model section + evidence link)
- Modify: `docs/codebase/INTEGRATIONS.md` (plugins section + evidence link)
- Modify: `docs/developer/PLUGIN_AUTHORING.md` (event bus section: event names, payload summaries, state persistence location)

- [x] **Step 1: ARCHITECTURE.md** — note `event_bus.rs` in the module list and the plugin model; add evidence link to `src-tauri/src/event_bus.rs`.
- [x] **Step 2: INTEGRATIONS.md** — plugins section: event fan-out + disk persistence; evidence link.
- [x] **Step 3: PLUGIN_AUTHORING.md** — new "Event Hooks" section: `on_<event>` naming, the three events, payload summary rule (never the image bytes), state persistence across restarts.
- [x] **Step 4: Verify** — `npm run verify-docs` passes.

## Task 6: Full gate set + commit

- [x] **Step 1: Rust gates** — from `src-tauri/`: `cargo test --locked` (86 existing + new tests; keychain test self-skips headless).
- [x] **Step 2: Frontend gates** — from repo root: `npm run lint`, `npm run build`, `npm run test` (100+ tests, no new frontend code so count unchanged), `npm run coverage` (thresholds 46/45/38/38 — no frontend change, must stay green), `npm run verify-docs`.
- [x] **Step 3: Commit** — `git add` the plan doc + code + docs; commit on main with a descriptive message (no push). Mark checkboxes `- [x]` → `- [x]` in this plan as each step completes.

## Deferred (future work)

- **Marketplace CLI** (`bb marketplace install/list`) — needs network/accounts; out of scope overnight. The manifest + load pipeline is the stable contract a marketplace would target.
- **Event subscription filtering / async event queues** — the bus is a synchronous fan-out over the existing hook mechanism; fine for a handful of trusted, user-installed plugins.
- **Frontend event surfacing** — the bus is backend-internal; UI wiring (e.g. plugin activity panel) is a later increment.

## Phase gate

- [x] `src-tauri/src/event_bus.rs` exists with `emit`/`emit_sync` and the three event constants
- [x] Plugin `__state` persists to disk under `<plugins_dir>/.state/<sanitized-vault>/` and restores on load
- [x] `generate_image`, `save_note`, `update_bible_files` emit their events
- [x] Gate test green: plugin receives `image_generated` event and state persists (in-memory + on disk)
- [x] `ALLOWED_PERMISSIONS` unchanged (`["hooks"]`)
- [x] No new Tauri commands; no new crates; no vault writes
- [x] Docs updated; `npm run verify-docs` passes

## Quality Checklist

- [x] `npm run lint` clean
- [x] `npm run build` clean
- [x] `NODE_ENV=test npm run test` → 100 passed (or 100 + new, frontend untouched)
- [x] `npm run coverage` → thresholds 46/45/38/38 hold
- [x] `cargo test --locked` from `src-tauri/` → 86 + new tests passed
- [x] `npm run verify-docs` passes
- [x] No permission surface widened; no command signatures changed; no vault note writes

## Anti-patterns

- ❌ **Widening `ALLOWED_PERMISSIONS`** to add "events" — the bus uses the existing `"hooks"` permission.
- ❌ **Emitting the image data URL** — payloads must stay well under 32 KiB.
- ❌ **Writing state into the vault** — the watcher would index it; state lives under the plugins dir.
- ❌ **Blocking the async runtime** with `emit_sync` in commands — commands use `emit` (detached thread); only tests use `emit_sync`.
- ❌ **New crates** for what std + serde_json already cover.

## Integration

- `loreweaver-dev-workflow` (the file-to-file recipe; this increment is backend-only so the frontend phases don't apply)
- `loreweaver-phase-review-gate` — run the gate on the completed increment
- `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (parent plan; Increment A is the first sequenced move)
- `docs/developer/PLUGIN_AUTHORING.md` (the plugin contract this increment extends)
- `docs/codebase/CONCERNS.md` (plugin sandbox accepted-risk section — unchanged, but the event bus adds a fan-out layer to note)
