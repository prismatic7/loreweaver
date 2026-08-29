# Loreweaver Tauri Command API Reference

This document catalogs all registered `#[tauri::command]` functions defined in the backend crate [src-tauri/src/lib.rs](file:///Users/chris/Development/loreweaver/src-tauri/src/lib.rs).

---

## 1. Vault Management Commands

### `get_vault_path`

- **Arguments:** None.
- **Returns:** `Result<String, String>`
- **Description:** Returns the absolute path of the currently active campaign vault.
- **Frontend Invoke:** Called at startup to load the directory state.

### `list_vaults`

- **Arguments:** None.
- **Returns:** `Result<Vec<VaultInfo>, String>`
- **Description:** Lists all registered vaults recorded in the global configuration index.

### `create_vault`

- **Arguments:** `name: &str`, `path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Registers and creates a new vault directory on disk at the specified location.

### `switch_vault`

- **Arguments:** `path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Safely pivots the application runtime to another vault, restarting file system observers and updating databases.

### `delete_vault`

- **Arguments:** `path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Unregisters a vault from the app directory index.

### `open_vault_dialog`

- **Arguments:** None.
- **Returns:** `Result<Option<String>, String>`
- **Description:** Launches a native directory selection dialog using the `rfd` library.

---

## 2. Note and Directory Operations

### `load_notes`

- **Arguments:** None.
- **Returns:** `Result<Vec<CampaignNote>, String>`
- **Description:** Loads all active markdown notes from the SQLite database.

### `save_note`

- **Arguments:** `note: CampaignNote`
- **Returns:** `Result<(), String>`
- **Description:** Serializes and writes a campaign note back to disk, syncing headers into the SQLite database.

### `save_note_asset`

- **Arguments:** `note_path: &str`, `asset_name: &str`, `content_base64: &str`
- **Returns:** `Result<String, String>`
- **Description:** Saves custom media attachments (images, portraits) to the vault's assets subdirectory.

### `resolve_wiki_link`

- **Arguments:** `query: &str`
- **Returns:** `Result<Option<String>, String>`
- **Description:** Queries the database to translate wikilink strings (e.g. `[[Lord Malakor]]`) into their actual relative file paths.

### `trash_note`

- **Arguments:** `note_path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Moves a note file to the local `.trash` directory and removes its SQLite, FTS5, and vector-chunk records.

### `trash_folder`

- **Arguments:** `folder_path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Trashes an entire subdirectory recursively, including all contained Markdown files and their DB records.

### `list_folders`

- **Arguments:** None.
- **Returns:** `Result<Vec<String>, String>`
- **Description:** Returns the relative paths of all folders inside the vault (excluding `.trash`, hidden directories, and `_assets`), including empty folders.

---

## 3. Trash and Recovery

### `load_trash_notes`

- **Arguments:** None.
- **Returns:** `Result<Vec<CampaignNote>, String>`
- **Description:** Reads deleted notes present inside the local `.trash/` folder.

### `restore_note`

- **Arguments:** `trash_note_path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Restores a trashed note back to its original path and removes deleted markers.

### `delete_trashed_note`

- **Arguments:** `trash_note_path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Permanently deletes a note file from the `.trash/` directory.

### `empty_trash`

- **Arguments:** None.
- **Returns:** `Result<(), String>`
- **Description:** Empties all items inside the `.trash/` directory.

---

## 4. Rulebook and SRD Browsing

### `load_rules`

- **Arguments:** None.
- **Returns:** `Result<Vec<RuleEntry>, String>`
- **Description:** Loads all ingested SRD and rulebook entries.

### `save_rule`

- **Arguments:** `rule: RuleEntry`
- **Returns:** `Result<(), String>`
- **Description:** Writes/updates a rulebook entry.

### `delete_rule`

- **Arguments:** `rule_id: &str`
- **Returns:** `Result<(), String>`
- **Description:** Deletes a rulebook entry.

### `delete_rules_folder`

- **Arguments:** `folder_path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Deletes all rule entries that belong to the specified folder path.

### `ingest_srd_text`

- **Arguments:** `content: &str`, `category: &str`, `source: &str`
- **Returns:** `Result<(), String>`
- **Description:** Imports and splits a raw markdown SRD rulebook into structured rule blocks.

---

## 5. RAG AI & Image Generation

### `search_vault`

- **Arguments:** `query: &str`, `scope: &str`
- **Returns:** `Result<SearchResponse, String>` where `SearchResponse = { results: SearchResult[], expanded: boolean }`
- **Description:** Executes hybrid FTS5 keyword matching and ONNX vector similarity queries. Before the FTS5 phase the query is expanded via the vault's read-only synonym lexicon (`<vault>/lexicon/synonyms.json`) plus a hand-rolled Levenshtein fuzzy layer; `expanded` is true when the query was rewritten (the UI shows an expansion indicator).

### `orchestrate_agent`

- **Arguments:** `prompt: &str`, `active_note_id: Option<&str>`
- **Returns:** `Result<String, String>`
- **Description:** Runs RAG queries using configured providers (Ollama, OpenAI, Gemini, Anthropic).

### `generate_image`

- **Arguments:** `prompt: &str`, `style: &str`, `provider: &str`, `model: &str`, `api_key: Option<&str>`, `base_url: Option<&str>`, `quality: Option<&str>`, `fixed_seed: Option<f64>`
- **Returns:** `Result<String, String>`
- **Description:** Generates an image via ComfyUI (local), OpenAI-compatible, or Stability providers and returns a base64 PNG data URL. Runs in `spawn_blocking`.

### `orchestrate_agent_stream`

- **Arguments:** `run_id: &str`, `prompt: &str`, `provider: &str`, `model: &str`, `api_key: Option<&str>`, `base_url: Option<&str>`, `active_note_id: Option<&str>`, `session_temperature: Option<f64>`, `history: Vec<ChatTurn>`, `context_items: Vec<ContextItem>`, `on_event: Channel<AgentEvent>`
- **Returns:** `Result<String, String>`
- **Description:** Streaming agent loop. Emits `AgentEvent`s over a Tauri IPC channel (token deltas, tool calls, `tool_approval_required`). Cooperative cancellation via `cancel_agent_stream`; pending write tools block on `approve_agent_tool` / `reject_agent_tool`.

### `approve_agent_tool`

- **Arguments:** `run_id: &str`, `tool_call_id: &str`
- **Returns:** `Result<(), String>`
- **Description:** Approves a pending agent write tool, unblocking the agent loop to execute it.

### `reject_agent_tool`

- **Arguments:** `run_id: &str`, `tool_call_id: &str`
- **Returns:** `Result<(), String>`
- **Description:** Rejects a pending agent write tool, unblocking the agent loop without executing it.

### `cancel_agent_stream`

- **Arguments:** `run_id: &str`
- **Returns:** `Result<(), String>`
- **Description:** Flips the cooperative cancellation flag for a running `orchestrate_agent_stream`; the loop checks it between events and stops cleanly. Also resolves any pending approval as rejected.

### `generate_speech`

- **Arguments:** `text: &str`
- **Returns:** `Result<Vec<u8>, String>`
- **Description:** Scaffolding command for speech generation (currently returns error placeholder).

### `test_provider_connection`

- **Arguments:** `provider: &str`, `model: &str`, `api_key: Option<&str>`, `base_url: Option<&str>`
- **Returns:** `Result<Vec<String>, String>`
- **Description:** Validates connection configurations by running test prompts.

---

## 6. Plugin Runtime Commands

### `load_plugins`

- **Arguments:** None.
- **Returns:** `Result<Vec<PluginInfo>, String>`
- **Description:** Scans the plugin folders and registers manifest declarations.

### `scaffold_plugin`

- **Arguments:** `id: &str`, `name: &str`
- **Returns:** `Result<String, String>` — the absolute path to the new plugin folder.
- **Description:** Creates a publishable plugin skeleton (`manifest.json` + starter `index.js` with an `on_dice_roll` hook) in the plugins directory. The id is normalised to lowercase alphanumeric + hyphen; the directory is refused if it already exists (no silent overwrite).

### `execute_plugin_hook`

- **Arguments:** `plugin_id: &str`, `hook: &str`, `payload: &str`
- **Returns:** `Result<String, String>`
- **Description:** Runs whitelisted plugin script hooks inside the isolated Boa Javascript engine.

---

## 7. App Configurations

### `load_settings`

- **Arguments:** None.
- **Returns:** `Result<serde_json::Value, String>`
- **Description:** Retrieves global settings.

### `save_settings`

- **Arguments:** `settings: serde_json::Value`
- **Returns:** `Result<(), String>`
- **Description:** Commits global settings.

### `load_vault_settings`

- **Arguments:** None.
- **Returns:** `Result<serde_json::Value, String>`
- **Description:** Loads settings scoped to the active campaign vault.

### `save_vault_settings`

- **Arguments:** `settings: serde_json::Value`
- **Returns:** `Result<(), String>`
- **Description:** Commits settings scoped to the active campaign vault.

---

## 8. Canvas Board Management

### `load_canvas_file`

- **Arguments:** `rel_path: &str`
- **Returns:** `Result<String, String>`
- **Description:** Loads a `.canvas` JSON coordinate layout file.

### `save_canvas_file`

- **Arguments:** `rel_path: &str`, `content: &str`
- **Returns:** `Result<(), String>`
- **Description:** Commits a `.canvas` JSON coordinate layout file.

### `list_templates`

- **Arguments:** None.
- **Returns:** `Result<Vec<TemplateEntry>, String>`
- **Description:** Scans the active campaign vault's `.templates/` folder, parses YAML frontmatter configurations using `gray-matter`, and returns all registered document templates and script action mappings.

---

## 9. World Objects and Liminal Pen

### `get_world_manifest`

- **Arguments:** None.
- **Returns:** `Result<WorldManifest, String>`
- **Description:** Returns the manifest (`world.json`) of the active world campaign, creating a default manifest if none exists.

### `update_bible_files`

- **Arguments:** `files: Vec<String>`
- **Returns:** `Result<WorldManifest, String>`
- **Description:** Persists the pinned Bible conditioning files into the world manifest (`world.json`). Empty list = all canon files active (backward compatible).

### `list_worlds`

- **Arguments:** None.
- **Returns:** `Result<Vec<WorldInfo>, String>`
- **Description:** Lists all world folders in the campaigns root directory, excluding system folders.

### `create_world`

- **Arguments:** `name: &str`, `scaffold_from: Option<&str>`
- **Returns:** `Result<String, String>`
- **Description:** Creates a new campaign world folder and manifest, optionally copying folders from a template. Fresh worlds get the canon 8-file bible set (`bible/{TONE,TOUCHSTONES,THE_PLAN,CONSPIRACY,PEOPLE,PLACES,RULES,SESSION_LOG}.md`) written with starter templates, ready for editing. When `scaffold_from` is given, bible files present in the source are copied instead (never overwritten).

### `export_world`

- **Arguments:** `vault_path: &str`, `dest_path: &str`
- **Returns:** `Result<String, String>`
- **Description:** Packages a campaign world folder into a ZIP bundle and saves it to the destination path.

### `import_world`

- **Arguments:** `zip_path: &str`
- **Returns:** `Result<String, String>`
- **Description:** Imports a campaign world bundle from a ZIP archive into the campaign directories.

### `list_liminal_notes`

- **Arguments:** None.
- **Returns:** `Result<Vec<CampaignNote>, String>`
- **Description:** Scans the `_liminal/Captures/` folder and returns the list of unassigned holding-pen capture notes.

### `claim_liminal_note`

- **Arguments:** `note_path: &str`, `target_world_path: &str`
- **Returns:** `Result<(), String>`
- **Description:** Moves a captured markdown note from the liminal folder into the target world campaign's `Worldbuilding` directory.

### `make_world_from_liminal`

- **Arguments:** `name: &str`
- **Returns:** `Result<String, String>`
- **Description:** Creates a new campaign world and moves all current liminal capture notes into it.

---

## 10. Provenance Tracking & Web Clipping

### `list_sources`

- **Arguments:** None.
- **Returns:** `Result<Vec<SourceEntry>, String>`
- **Description:** Retrieves all recorded provenance sources stored in the database for tracking document origin.

### `save_source`

- **Arguments:** `source: SourceEntry`
- **Returns:** `Result<String, String>`
- **Description:** Upserts (creates or updates) a provenance source record in the database.

### `delete_source`

- **Arguments:** `source_id: &str`
- **Returns:** `Result<(), String>`
- **Description:** Deletes a provenance source tracking record by ID.

### `get_source`

- **Arguments:** `source_id: &str`
- **Returns:** `Result<Option<SourceEntry>, String>`
- **Description:** Retrieves a single provenance source from the database by ID.

### `clip_webpage`

- **Arguments:** `url: &str`
- **Returns:** `Result<WebClip, String>`
- **Description:** Fetches an external webpage URL and extracts its content as clean Markdown.

---

## 11. Session Memory & Transcription

### `save_session_memory`

- **Arguments:** `fact: &str`, `category: &str`
- **Returns:** `Result<String, String>`
- **Description:** Saves a persistent session memory fact / metadata context snippet inside the active vault db.

### `list_session_memory`

- **Arguments:** None.
- **Returns:** `Result<Vec<(String, String, String, i64)>, String>`
- **Description:** Lists all persistent session memory facts / notes for the active campaign.

### `delete_session_memory`

- **Arguments:** `id: &str`
- **Returns:** `Result<(), String>`
- **Description:** Deletes a session memory fact from the database by ID.

### `summarize_session`

- **Arguments:** `messages_json: &str`, `provider: &str`, `model: &str`, `api_key: Option<&str>`, `base_url: Option<&str>`
- **Returns:** `Result<String, String>`
- **Description:** Passes a chat transcript to the LLM to generate a concise summary (what happened, decisions, followups).

### `extract_session_memories`

- **Arguments:** `messages_json: &str`, `provider: &str`, `model: &str`, `api_key: Option<&str>`, `base_url: Option<&str>`
- **Returns:** `Result<usize, String>`
- **Description:** Extracts durable facts from a chat transcript (NPCs, factions, decisions, threads, world state) and inserts them into the world-scoped `session_memory` table, deduped. Best-effort: failures never break the chat turn.

### `transcribe_speech`

- **Arguments:** `audio_base64: &str`, `provider: &str`, `api_key: Option<&str>`, `base_url: Option<&str>`
- **Returns:** `Result<String, String>`
- **Description:** Transcribes base64-encoded audio bytes into text using either local (ONNX sherpa-onnx) or OpenAI Whisper models.

---

## 12. Additional Operations

### `reindex_vault`

- **Arguments:** None.
- **Returns:** `Result<(), String>`
- **Description:** Force-rebuilds the local database search index by parsing all Markdown files in the active vault.

### `run_schedule_now`

- **Arguments:** None.
- **Returns:** `Result<Vec<String>, String>` — the list of event names emitted.
- **Description:** Manually triggers the world scheduler: loads `<vault>/schedule.yaml`, fires every due entry through the plugin event bus, and returns the emitted event names.

### `evaluate_expression`

- **Arguments:** `expr: &str`
- **Returns:** `Result<Value, String>` — `{ "expression", "rolls", "total" }`.
- **Description:** Evaluates a dice/arithmetic expression (`3d6+2`, `d%`, `max(2d4, 6)`, comparisons) with a hand-rolled, numbers-only parser. Fires a `dice_roll` event through the plugin event bus. Malformed input is a clean error; the parser has no file, network, or plugin reach.

### `convert_pdf_to_markdown`

- **Arguments:** `base64_pdf: &str`
- **Returns:** `Result<String, String>`
- **Description:** Extracts text and structures rules from a PDF document to generate clean Markdown.

### `capture_note`

- **Arguments:** `title: &str`, `content: &str`, `source_type: Option<&str>`, `source_title: Option<&str>`, `source_author: Option<&str>`, `source_url: Option<&str>`, `target: Option<&str>`
- **Returns:** `Result<String, String>`
- **Description:** Captures a quick note into the vault's `Captures/` inbox folder, recording full provenance metadata inside the note's YAML frontmatter.
