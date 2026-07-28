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
- **Returns:** `Result<Vec<SearchResult>, String>`
- **Description:** Executes hybrid FTS5 keyword matching and ONNX vector similarity queries.

### `orchestrate_agent`
- **Arguments:** `prompt: &str`, `active_note_id: Option<&str>`
- **Returns:** `Result<String, String>`
- **Description:** Runs RAG queries using configured providers (Ollama, OpenAI, Gemini, Anthropic).

### `generate_image`
- **Arguments:** `prompt: &str`
- **Returns:** `Result<String, String>`
- **Description:** Scaffolding command for generating image assets (currently returns timed static path in UI).

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
