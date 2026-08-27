# Architecture

## System Shape

Loreweaver is a Tauri desktop app: a React frontend drives user interaction, and a Rust backend handles persistence, file watching, search, plugin execution, and provider calls.

## Main Data Flow

1. Markdown vault files live under the campaign vault directory.
2. `watcher.rs` parses Markdown frontmatter and H1 titles, then syncs notes into SQLite.
3. `db.rs` stores notes, note metadata, rules, chunk embeddings, and app settings.
4. `search.rs` downloads and loads the local embedding model, chunks text, and performs hybrid semantic search.
5. The frontend calls Tauri commands such as `load_notes`, `load_rules`, `search_vault`, `save_note`, and `orchestrate_agent`. The Architect chat uses `orchestrate_agent_stream` (a Tauri `Channel` of `AgentEvent`s) for streaming reasoning, tool calls, and answer text; `cancel_agent_stream` flips a cooperative abort flag keyed by run id.

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
- `agent.rs` assembles RAG context, runs the streaming agent loop (`run_agent_turn`), and executes vault tools (`roll_dice`, `search_vault`, `read_note`, `list_notes`, `save_note`) bounded to `MAX_TOOL_ROUNDS`; it delegates provider calls to `providers/llm.rs`.
- `plugins.rs` loads plugin manifests and runs Boa-based hook functions.
- `event_bus.rs` fans app events (image generated, note saved, world state changed) out to plugins as named hook calls (`on_<event>`), reusing the plugin host's permission guard, payload cap, and 5 s timeout.
- `providers/` centralizes AI provider HTTP logic: `llm.rs` (chat), `image.rs` (image generation), `speech.rs` (TTS), `models.rs` (model listing).

## Provenance, Bible Conditioning, and Capture (phase 2)

- **Provenance model:** a `sources` table (id, title, author, source_type,
  url, date) plus `SourceEntry`; commands `list_sources`, `save_source`,
  `delete_source`, `get_source`. Notes carry provenance in frontmatter
  (`source_type`, `source_title`, `source_author`, `source_url`,
  `source_date`, `source_id`) — no notes-table change, so the watcher and
  ingest stay compatible. The entity graph renders source nodes (square,
  distinct colour) with `source` edges, and a provenance filter
  (All/Canon/History/Invention) narrows the note set before graph
  construction.
- **Bible conditioning:** `build_system_context` (agent.rs) takes
  `vault_path` and injects `bible/{TONE,TOUCHSTONES,THE_PLAN,CONSPIRACY,
  PEOPLE,PLACES,RULES,SESSION_LOG}.md` as a fixed always-on block — NOT
  retrieved-by-similarity. Missing bible files are skipped gracefully.
- **Capture inbox:** `capture_note` writes to `Captures/<slug>-<ts>.md`
  via `validate_safe_path`; the Capture Inbox UI lives in the Scratchpad
  tab of the right drawer and accepts text/paste/URL/file-drop.
- **Web clipping:** `webclip.rs` fetches a URL (ureq, 30s timeout, browser
  UA), extracts the main readable content (`<article>` / `<main>` / body
  fallback via scraper), converts to Markdown (html2md), and returns a
  `WebClip` with provenance (title, site, url, fetched_at). `clip_webpage`
  is the Tauri command; the "Clip URL" toolbar button and inbox clip flow
  use it. URL validation is a pure `validate_url` helper (http/https only)
  so the non-network error paths are unit-testable.

## World Objects (arc 2)

The World Object is the unit of plurality: a world folder (`campaigns/<world>/`)
with a `world.json` manifest that declares its identity, note-type registry,
provenance taxonomy, and theme. Signed-off design: `DESIGN_SKETCH_WORLDS.md`.

- **`worlds.rs`** owns the manifest: `load_manifest` (per-field fallback to
  defaults), `ensure_manifest` (auto-generates a default `world.json` on first
  launch — additive, never overwrites), `validate_manifest`. Defaults: 5 legacy
  note types (npc/location/faction/item/event) and a 4-entry provenance
  taxonomy (canon/history/invention/**speculation** — the Provisional ships for
  all worlds). Commands: `get_world_manifest`, `list_worlds` (excludes
  `_liminal`), `create_world` (with optional scaffold-from).
- **`bundles.rs`** owns zip export/import and folder scaffold. `export_world`
  zips a world folder; `import_world` validates the embedded manifest and
  extracts to `campaigns/<id>` (zip-slip guarded); scaffold mirrors a source
  world's directory structure + manifest skeleton, no content.
- **The Liminal** (`campaigns/_liminal/`): the between-worlds holding pen.
  `capture_note` accepts a `target: "liminal"` to land captures there (no DB
  upsert). `list_liminal_notes` (read-only) lists `_liminal/Captures/*.md` as
  `CampaignNote`s sorted by title. `claim_liminal_note` moves a note into a
  world; `make_world_from_liminal` births a new world from the liminal captures.
- **Liminal view UI** (`LiminalView.tsx`): full-screen dedicated view wired to
  the World Shelf's Liminal entry (replaces the arc-2 placeholder alert).
  Renders the capture list with per-note claim-into-world (select + Claim) and
  a birth-a-new-world action. Opened via `liminalOpen` state in `App.tsx`;
  while open it shadows all other views and the right drawer.
- **Native world dialogs**: `tauri-plugin-dialog` (Rust + `@tauri-apps/plugin-dialog`)
  is wired via `dialog:default` capability. Export opens a save dialog
  (default `WorldName.zip`); import opens an open dialog filtered to `.zip`.
  Both replace the arc-2 text-prompt / hidden-file-input approaches.
- **Theme override**: world tokens → global tokens → defaults. Scope is accent +
  palette + serif toggle only (no full typography override). The 10% accent rule
  and rest restraint rule hold in every theme. `useWorld` (frontend) applies the
  resolved CSS vars to `document.documentElement`.
- **Note-type + provenance registries**: the graph, canvas, metadata panel, and
  capture UI read the world's `note_types` / `provenance_taxonomy`, falling back
  to the defaults so legacy vaults keep working. `speculation` appears as a
  provenance option everywhere provenance is chosen/filtered.
- **Bible gating**: `agent.rs` reads the manifest's `bible` flag; when `false`,
  bible conditioning is skipped (always-on when true/default).
- **World Shelf UI** (`WorldShelf.tsx`): switcher with icon/name/description/
  last-opened, new-world (scaffold choice), Liminal entry, export/import.

## Streaming Architect Chat

The Architect chat (`AiView` full page and the RightDrawer AI tab) streams
agent activity over a Tauri `Channel<AgentEvent>`:

- `orchestrate_agent_stream(run_id, prompt, provider, model, api_key,
  base_url, active_note_id, session_temperature, history, context_items,
  on_event)` runs the turn on a blocking thread and emits `AgentEvent`s:
  `reasoning` (thinking deltas), `tool_call` / `tool_result` (tool activity),
  `delta` (answer text), `done` (final text), `error` (non-fatal).
- `cancel_agent_stream(run_id)` flips a cooperative `AtomicBool` flag; the
  agent loop checks it between events and stops emitting. The run flag is
  registered in `AppState.agent_runs` and removed when the command returns.
- The frontend (`useAgent`) accumulates events into the last assistant
  message: `reasoning`, `toolCalls[]` (with results), and streamed `text`.
  `AgentMessageBlock` renders collapsible Thinking and Tools blocks; the
  input row swaps to a stop button while streaming.
- Context attachment: the UI's "Add Context" picker attaches notes/rules as
  `ContextItem`s (kind `note`/`rule`), which `run_agent_turn` injects as a
  context block before history. The currently open note is always injected
  when `active_note_id` is set.
- Tool loop: the model may call `roll_dice`, `search_vault`, `read_note`,
  `list_notes`, or `save_note`; results are fed back as tool messages,
  bounded to `MAX_TOOL_ROUNDS` (4). All vault writes go through
  `validate_safe_path`.

## Frontend Structure

- `src/App.tsx` is the top-level orchestrator that composes domain hooks and renders shell components.
- `src/hooks/` contains domain hooks that encapsulate Tauri IPC calls and local state.
- `src/components/` contains shell components (`AppShell`, `RightDrawer`, `Modals`) and feature views (`CampaignVaultView`, `RulesView`, `AiView`, `TrashView`, `DashboardView`, `FolderCanvas`, `MarkdownEditor`, `EntityGraphView`).
- `src/utils/` contains shared utilities (`dice.ts`, `pdf.ts`).

## Plugin Model

The plugin system is manifest-driven and script-based:

- each plugin directory needs `manifest.json` and an entry script;
- the manifest declares `id`, `name`, `version`, `description`, and `entry`;
- plugin scripts are evaluated in Boa and hook functions are called by name;
- `event_bus.rs` fans app events out to every active plugin as `on_<event>`
  hooks (`image_generated`, `note_saved`, `world_state_changed`);
- plugin `__state` persists across restarts under `<plugins_dir>/.state/<sanitized-vault>/<plugin_id>.json`
  (outside the vault so the watcher never indexes plugin runtime state).

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
- [src-tauri/src/event_bus.rs](/Users/chris/Development/loreweaver/src-tauri/src/event_bus.rs)
- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [README.md](/Users/chris/Development/loreweaver/README.md)
