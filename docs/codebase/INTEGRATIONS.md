# Integrations

## Local Storage and Filesystem

- Notes are stored as Markdown files inside a campaign vault directory.
- `watcher.rs` monitors the vault and keeps SQLite in sync, including purging DB rows for files that no longer exist.
- `save_note` writes Markdown with YAML frontmatter back to disk.
- `list_folders` discovers folders directly from the filesystem so the UI reflects real directory state, including empty folders.

## Database

- SQLite is the central persistence layer.
- `db.rs` creates tables for notes, note metadata, rules, note chunks, rule chunks, and app settings.

## Search and Embeddings

- `search.rs` loads an ONNX embedding model and tokenizer from the app data directory.
- Missing model files are downloaded from Hugging Face at runtime.
- The current search path is hybrid: semantic similarity first, then keyword fallback when embedding generation fails.

## AI Providers

- `agent.rs` supports Ollama, OpenAI, and Gemini for chat/orchestration.
- `test_provider_connection` also knows about several provider IDs in settings UI, but the implemented request branches are limited to Ollama, OpenAI-compatible endpoints, and Gemini.
- API keys are stored in the OS keyring under `api-key-{provider_id}` (service `loreweaver`).
  The SQLite settings table only holds an opaque `keyring:{provider_id}` handle.
  For one release, legacy repeating-XOR obfuscated keys are still decrypted as a fallback if the keyring is unavailable or the stored value predates the keyring migration.

## Plugins

- Plugins are loaded from directories that contain a `manifest.json` and an entry script.
- `boa_engine` evaluates plugin scripts and executes named hook functions.
- The repo includes `character-roller` and `threat-evaluator` plugins, and the backend seeds a `dice-bonus` plugin at runtime.

## Future Integrations Status

- **Image Generation:** Currently a frontend placeholder mock. Stable Diffusion ComfyUI bindings exist in the Rust backend code but are not connected to the UI.
- **Audio Processing:** Text-to-speech (TTS) and speech-to-text (STT) capabilities are currently not implemented in the application backend.

## Evidence

- [src-tauri/src/watcher.rs](/Users/chris/Development/loreweaver/src-tauri/src/watcher.rs)
- [src-tauri/src/db.rs](/Users/chris/Development/loreweaver/src-tauri/src/db.rs)
- [src-tauri/src/search.rs](/Users/chris/Development/loreweaver/src-tauri/src/search.rs)
- [src-tauri/src/agent.rs](/Users/chris/Development/loreweaver/src-tauri/src/agent.rs)
- [src-tauri/src/plugins.rs](/Users/chris/Development/loreweaver/src-tauri/src/plugins.rs)
- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [plugins/character-roller/index.js](/Users/chris/Development/loreweaver/plugins/character-roller/index.js)
- [plugins/threat-evaluator/index.js](/Users/chris/Development/loreweaver/plugins/threat-evaluator/index.js)
- [src-tauri/Cargo.toml](/Users/chris/Development/loreweaver/src-tauri/Cargo.toml)
