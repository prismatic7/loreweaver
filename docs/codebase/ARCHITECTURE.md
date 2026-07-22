# Architecture

## System Shape

Loreweaver is a Tauri desktop app: a React frontend drives user interaction, and a Rust backend handles persistence, file watching, search, plugin execution, and provider calls.

## Main Data Flow

1. Markdown vault files live under the campaign vault directory.
2. `watcher.rs` parses Markdown frontmatter and H1 titles, then syncs notes into SQLite.
3. `db.rs` stores notes, note metadata, rules, chunk embeddings, and app settings.
4. `search.rs` downloads and loads the local embedding model, chunks text, and performs hybrid semantic search.
5. The frontend calls Tauri commands such as `load_notes`, `load_rules`, `search_vault`, `save_note`, and `orchestrate_agent`.

## Backend Layers

- `db.rs` owns schema creation and CRUD helpers.
- `watcher.rs` owns filesystem synchronization.
- `search.rs` owns embedding generation and similarity search.
- `ingest.rs` converts Markdown SRD text into rule rows and vector chunks.
- `agent.rs` assembles context and calls Ollama, OpenAI, or Gemini.
- `plugins.rs` loads plugin manifests and runs Boa-based hook functions.

## Plugin Model

The plugin system is manifest-driven and script-based:

- each plugin directory needs `manifest.json` and an entry script;
- the manifest declares `id`, `name`, `version`, `description`, and `entry`;
- plugin scripts are evaluated in Boa and hook functions are called by name.

## Intent vs Reality

- The README and architecture notes describe image generation workflows, but the current UI only simulates generation with a timer and a static image path.
- The README also mentions broader memory backends and orchestration layers that are not visible in the inspected source.

## Evidence

- [src-tauri/src/lib.rs](/Users/chris/Development/loreweaver/src-tauri/src/lib.rs)
- [src-tauri/src/db.rs](/Users/chris/Development/loreweaver/src-tauri/src/db.rs)
- [src-tauri/src/watcher.rs](/Users/chris/Development/loreweaver/src-tauri/src/watcher.rs)
- [src-tauri/src/search.rs](/Users/chris/Development/loreweaver/src-tauri/src/search.rs)
- [src-tauri/src/ingest.rs](/Users/chris/Development/loreweaver/src-tauri/src/ingest.rs)
- [src-tauri/src/agent.rs](/Users/chris/Development/loreweaver/src-tauri/src/agent.rs)
- [src-tauri/src/plugins.rs](/Users/chris/Development/loreweaver/src-tauri/src/plugins.rs)
- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [README.md](/Users/chris/Development/loreweaver/README.md)
