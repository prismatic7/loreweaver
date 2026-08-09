# Architecture

## System Shape

Loreweaver is a Tauri desktop app: a React frontend drives user interaction, and a Rust backend handles persistence, file watching, search, plugin execution, and provider calls.

## Main Data Flow

1. Markdown vault files live under the campaign vault directory.
2. `watcher.rs` parses Markdown frontmatter and H1 titles, then syncs notes into SQLite.
3. `db.rs` stores notes, note metadata, rules, chunk embeddings, and app settings.
4. `search.rs` downloads and loads the local embedding model, chunks text, and performs hybrid semantic search.
5. The frontend calls Tauri commands such as `load_notes`, `load_rules`, `search_vault`, `save_note`, and `orchestrate_agent`.

## Deletion and Trash

- The vault mirrors the filesystem: empty folders remain on disk and remain visible in the UI.
- `trash_note` and `trash_folder` move Markdown files to `.trash/` while removing their SQLite, FTS5, and vector-chunk records.
- `restore_note` moves a trashed file back to its original location and re-indexes it.
- `empty_trash` and `delete_trashed_note` permanently remove files and their DB records.
- `delete_rules_folder` removes a rulebook folder atomically from the backend.
- Folder discovery (`list_folders`) is filesystem-first, excludes `.trash`, hidden directories, and `_assets`, and is refreshed after mutations that may empty a folder.

## Backend Layers

- `db.rs` owns schema creation and CRUD helpers.
- `watcher.rs` owns filesystem synchronization.
- `search.rs` owns embedding generation and similarity search.
- `ingest.rs` converts Markdown SRD text into rule rows and vector chunks.
- `agent.rs` assembles RAG context and delegates provider calls to `providers/llm.rs`.
- `plugins.rs` loads plugin manifests and runs Boa-based hook functions.
- `providers/` centralizes AI provider HTTP logic: `llm.rs` (chat), `image.rs` (image generation), `speech.rs` (TTS), `models.rs` (model listing).

## Frontend Structure

- `src/App.tsx` is the top-level orchestrator that composes domain hooks and renders shell components.
- `src/hooks/` contains domain hooks that encapsulate Tauri IPC calls and local state.
- `src/components/` contains shell components (`AppShell`, `RightDrawer`, `Modals`) and feature views (`CampaignVaultView`, `RulesView`, `AiView`, `TrashView`, `DashboardView`, `FolderCanvas`, `MarkdownEditor`).
- `src/utils/` contains shared utilities (`dice.ts`, `pdf.ts`).

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
