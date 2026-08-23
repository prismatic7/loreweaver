# The Creator's Instrument — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the settings surface from plumbing into an instrument (per `DESIGN_SKETCH_CREATOR.md`, committed 2026-08-22 as `203b0fa`). Make the Muse *feel* like the world without editing a JSON file or a Rust constant: per-world persona voice, pinnable Bible, image style template with note→image flow, and Firm↔Wild sampling (cascade: global default → per-world override → per-session quick toggle).

**Architecture:** Three phases mapped to the design's domains. Voice (Phase 1): per-world persona + pinnable Bible. Mouth (Phase 2): image style template, note→image flow, quality-not-knobs, output size, TTS preview. Temper (Phase 3): sampling params surfaced as predictability, cascade-shaped. Housekeeping: the sketch's overcomplication list (dead `setTheme`, `alert()` for save/reindex).

**Tech Stack:** Rust (Tauri), React + TypeScript + zod, SQLite, Markdown.

## Global Constraints

- **Vault is the source of truth.** Settings organise and reveal; they never own a second copy. Bible content lives in vault notes; settings only pin/unpin.
- **Backward compatibility:** `world.bible` gating stays; the hardcoded persona stays as fallback; new manifest fields get `#[serde(default)]` so existing worlds load unchanged.
- All tests must pass: `npm run test` and `cargo test -- --skip test_api_key_round_trip`.
- Do not modify existing command signatures unless the plan step says so (Tauri invoke contract).
- Build gotcha: Hermes sessions carry `NODE_ENV=production`, which omits devDeps (tsc/vite missing). Use `NODE_ENV=development npm install` before frontend builds; `NODE_ENV=test` for vitest.

---

## Phase 1 — The Voice (priority 1)

### Task 1: Wire the campaign persona into the system prompt

The biggest creative lever, currently invisible: `campaign_system` already exists in `VaultSettings` (`lib.rs:102`, `export_types.rs:109`) with working `load_vault_settings`/`save_vault_settings` commands (`lib.rs:2240-2260`) — but `agent.rs` never reads it and hardcodes the persona at `agent.rs:80`.

**Files:**
- Modify: `src-tauri/src/agent.rs`
- Test: `src-tauri/src/agent.rs` (module tests)

- [ ] **Step 1: Load the persona in `build_system_context`**
  `build_system_context` already receives `vault_path`. Add a helper `load_campaign_persona(vault_path: &str) -> Option<String>` that reads `<vault_path>/vault_config.json`, deserialises `campaign_system` via `serde_json`, and returns `Some(persona)` when present and non-empty. Graceful: missing/unparseable config → `None` (matches the bible loader's graceful-missing style).
- [ ] **Step 2: Use the persona when set**
  In the `system_prompt` assembly (`agent.rs:79-87`), when the persona is present, replace the hardcoded opening ("You are an expert RPG Campaign Architect...") with the persona; keep the closing instruction ("Respond in clean Markdown. Be creative and detail-oriented.") and the `--- RULES & LORE CONTEXT ---` block. When absent, use today's hardcoded text unchanged.
- [ ] **Step 3: Tests**
  - `test_build_system_context_uses_campaign_persona_when_set`: write `vault_config.json` with a `campaign_system` value, build context, assert the prompt contains the persona and does NOT contain the hardcoded opening.
  - `test_build_system_context_default_persona_when_unset`: no config file, assert the hardcoded opening remains.
  - Run: `cargo test -- --skip test_api_key_roundtrip` in `src-tauri/`.
- [ ] **Step 4: Verify end-to-end**
  `npm run test` still passes; manual: `cargo tauri dev`, set persona in a world, ask the Muse a question, confirm tone shift.

### Task 2: Make the Bible pinnable

The Bible is emergent: `load_bible_context` (`agent.rs:112`) always injects the same 8 fixed files. Play should be able to pin/unpin which conditioning notes are live without touching the filesystem.

**Files:**
- Modify: `src-tauri/src/export_types.rs` (`WorldManifest` at line 156)
- Modify: `src-tauri/src/worlds.rs` (manifest load/save helpers)
- Modify: `src-tauri/src/agent.rs` (`load_bible_context`)
- Modify: `src/components/SettingsView.tsx` (new "Bible" panel) — or a world-settings panel if the settings surface is restructured

- [ ] **Step 1: Manifest field** add `bible_files: Vec<String>` to `WorldManifest` with `#[serde(default)]`; default empty = all canon files active (backward compatible with today's fixed list).
- [ ] **Step 2: `load_bible_context` honour pins** when `bible_files` is non-empty, read only the pinned files (missing ones skipped); empty → today's 8-file behaviour.
- [ ] **Step 3: Tauri command** `update_bible_files(vault_path, files)` (or reuse the existing manifest save command if it exists) persisting pins into `world.json`.
- [ ] **Step 4: UI** a Bible panel listing the canon conditioning notes (TONE, TOUCHSTONES, THE_PLAN, CONSPIRACY, PEOPLE, PLACES, RULES, SESSION_LOG) as toggle rows; each row also has an "open in editor" affordance. `world.bible` global toggle stays.
- [ ] **Step 5: Verify** `cargo test`, `npm run test`, manual: pin only TONE+RULES, confirm the system prompt's bible block shrinks to those two.

---

## Phase 2 — The Mouth / Image (priority 2)

**Grounded note (from sketch):** image gen today is a manual prompt box in the right drawer (`useSessionTools.ts:50-53`) with a hardcoded default prompt and `"Fantasy Portrait"` style string. There is no note→image flow. `image.rs` already accepts a `style` string (`generate_image` line 56) — the template is prepended server-side.

### Task 3: Style template — the image voice

- [ ] **Step 1: Schema** `VaultSettings` gains `image_style_template: Option<String>` (per-world, lives in `vault_config.json`, travels with the world).
- [ ] **Step 2: UI** a textarea in the world's voice section ("Style template — how images in this world look"), with a hint example (the cold-war dossier from the sketch).
- [ ] **Step 3: Frontend wiring** `useSessionTools` / right drawer passes the world's template as `style`; the per-use `style` field becomes optional (keep it for one-off overrides).
- [ ] **Step 4: Verify** build + manual: set a template, generate, confirm the prompt includes it server-side.

### Task 4: Note → image flow

- [ ] **Step 1: Entry point** an "Illustrate this note" affordance on note sheets (character/location/item). `handleGenerateImage` is called with the note's title + content.
- [ ] **Step 2: Prompt assembly** `template + "depicting {note title}: {note content}" + optional per-use prompt`. The note's own words are the source (same vault-is-source principle as the Bible).
- [ ] **Step 3: Verify** generate from an open character note; confirm the image reflects the note's described details.

### Task 5: Quality, not knobs (image)

- [ ] **Step 1: Settings** a `Quality` choice (fast / standard / high) mapping to ComfyUI steps (e.g. 12 / 28 / 40), plus a seed toggle (random ↔ fixed). These are **advanced options**, collapsed by default.
- [ ] **Step 2: Backend** `generate_comfyui_image` (`image.rs:122`) accepts `steps` + `seed`; defaults keep today's values (28 / 7 / random) when unset.
- [ ] **Step 3: Verify** local generation at each quality level; confirm workflow JSON contains the mapped steps.

### Task 6: Output size (OpenAI / Stability)

- [ ] **Step 1: Setting** `image_size` (default `1024x1024`) in `AppSettings` + zod + `image.rs` body (`image.rs:94` currently hardcodes it).
- [ ] **Step 2: Verify** generate with a non-default size through OpenAI-compatible provider.

### Task 7: TTS preview + STT picker

- [ ] **Step 1: Voice preview** a small "speak sample" button per voice in the TTS settings, calling the existing `generate_speech` command with a short sample line, playing the result.
- [ ] **Step 2: STT model picker** replace the STT "base URL" text field with a folder picker for the sherpa-onnx model directory (label lies today).

---

## Phase 3 — The Temper (priority 3)

**Grounded note:** `llm.rs` sends `{model, messages, stream}` only (Ollama `llm.rs:93-100`), hardcodes `max_tokens: 4096` (Anthropic `llm.rs:174`), and `call_gemini` wraps the prompt inline. No temperature/top_p/seed anywhere. Labelled **Firm ↔ Wild** per the sketch's relabel.

### Task 8: Sampling parameters — backend

- [ ] **Step 1: Schema** `AppSettings` gains `llm_temperature: f64` (default 0.8), `llm_top_p: f64` (default 1.0), `llm_max_tokens: i64` (default 4096), `llm_seed: Option<i64>` (default None). Plus zod + `DEFAULT_SETTINGS` + `useSettings` merge/save.
- [ ] **Step 2: Thread through `generate_response`** `agent.rs:157` and `llm::generate_response` gain the four params; each `call_*` adds them to the request body (Ollama `options`, OpenAI-compatible `temperature`/`top_p`/`max_tokens`/`seed`, Anthropic `max_tokens` (already hardcoded 4096 — use the setting), Gemini `generationConfig`).
- [ ] **Step 3: Verify** unit test that a provider body contains the overridden temperature; manual with Ollama local.

### Task 9: Firm ↔ Wild UI (global default)

- [ ] **Step 1: Settings control** in the LLM tab: a slider labelled **Firm ↔ Wild** (0.0–2.0, default 0.8) with live preview of the numeric value; secondary `top_p` and `max_tokens` advanced fields (advanced options tucked away).
- [ ] **Step 2: Verify** save → reload → generation reflects the saved value.

### Task 10: Per-world override + per-session quick toggle (the cascade)

- [ ] **Step 1: Per-world** `VaultSettings` gains `firm_wild: Option<f64>` (per world, in `vault_config.json`). `generate_response` resolves: session toggle → world override → global default.
- [ ] **Step 2: Per-session quick toggle** a small Firm ↔ Wild control in the session header, ephemeral (resets at session close; optional "make this the world default" affordance). Lives in app state, not DB.
- [ ] **Step 3: Verify** flip the toggle mid-session, confirm behaviour shifts without opening settings.

---

## Housekeeping (from the sketch's overcomplication list)

### Task 11: Dead code + tone fixes

- [ ] **Step 1: `setTheme`/`theme`** — either wire a real light/dark toggle (Design.md has a light palette) or delete the dead prop threading (`SettingsView.tsx` receives `theme` as `_theme`).
- [ ] **Step 2: `alert()` for save/reindex** — replace native dialogs with in-app toast/inline feedback (Ledger's calm).
- [ ] **Step 3: Verify** `npm run test` + manual save/reindex without native dialogs.
