# Integrations

## Local Storage and Filesystem

- Notes are stored as Markdown files inside a campaign vault directory.
- `watcher.rs` monitors the vault and keeps SQLite in sync.
- `save_note` writes Markdown with YAML frontmatter back to disk.

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

## Plugins

- Plugins are loaded from directories that contain a `manifest.json` and an entry script.
- `boa_engine` evaluates plugin scripts and executes named hook functions.
- The repo includes `character-roller` and `threat-evaluator` plugins, and the backend seeds a `dice-bonus` plugin at runtime.

## [TODO]

- The image generation section in the UI does not currently call a backend image API or model runner.
- I did not find a real text-to-speech or speech-to-text implementation in the inspected backend modules.

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
