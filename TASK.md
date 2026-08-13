# TASK: tts-stt-base-url-override

## Goal
Let GMs point TTS and STT providers at local/proxy endpoints: expose the "API Endpoint URL" (base_url) field for the TTS and STT tabs in Settings, and make the backend honour it for both speech generation and transcription.

## Context (verified on main)
- `src-tauri/src/providers/speech.rs`:
  - `generate_speech(...)` ALREADY accepts `base_url: Option<&str>` and uses it for the `"openai"` provider (and `"elevenlabs"`).
  - `transcribe_speech(...)` does NOT accept `base_url` — the `"openai"` arm hardcodes `https://api.openai.com/v1/audio/transcriptions`.
- `src/components/SettingsView.tsx` (~line 723): the "API Endpoint URL" field is hidden when `activeConfigTab === "tts" || activeConfigTab === "stt"`.

## Scope
Files the agent MAY touch:
- `src/components/SettingsView.tsx` (remove the hiding condition so base_url shows for tts/stt tabs)
- `src-tauri/src/providers/speech.rs` (thread `base_url` through `transcribe_speech`, same trim/trailing-slash handling as `generate_speech`)
- The Rust command wiring that calls `transcribe_speech` (find it — likely in `src-tauri/src/` commands module — and pass the stored `base_url` from settings)

## Out of scope
- NO new providers or provider types
- NO changes to `generate_speech` behaviour for existing providers
- NO dependency changes
- NO formatting churn / unrelated refactors
- Do NOT use `/tmp` paths — work only inside this worktree
- Do NOT commit

## Acceptance criteria
- [ ] Settings shows the API Endpoint URL input for the TTS and STT config tabs (consistent with llm/embed/image tabs)
- [ ] `transcribe_speech` accepts and honours `base_url` for the openai provider (falls back to `https://api.openai.com` when empty — same pattern as `generate_speech`)
- [ ] The command wiring passes the configured base_url to transcription (settings field → command arg)
- [ ] `npm run build` passes (frontend typecheck)
- [ ] `cargo check` passes in `src-tauri/`

## Harness & budget
- Harness: opencode
- Budget: quick win — max ~4 files, no new deps

## Status
- [x] In progress
- [x] Done — Threaded `base_url` through the TTS/STT chain: exposed the API Endpoint URL field for the tts/stt Settings tabs, added `tts_base_url`/`stt_base_url` to `AppSettings` (load/save), threaded `base_url` through `transcribe_speech` (same trim/trailing-slash fallback as `generate_speech`), and wired the frontend invoke sites (`useSessionTools`, `useAgent`) to pass the configured base URL. `npm run build` and `cargo check` both pass.

## Evidence
_State vocabulary — record every transition in the ledger
(`~/Development/agent-dispatch/evidence <repo> <task> <state>`). Missing
records remain missing evidence; never infer a state from text._

- `prepared` — dispatch created the worktree. Recorded automatically.
- `running` — _you are executing now_
- `reported` — _you claim done. NOT verified. Write this before exit:_
  `~/Development/agent-dispatch/evidence loreweaver tts-stt-base-url-override reported "exit 0, unverified"`
- `verified` — Hermes checked the diff against the acceptance criteria
  (then `merged`). `reported` ≠ `verified`.
