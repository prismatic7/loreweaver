# Loreweaver — Bold Features & QoL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship seven capability bets and a QoL pass that move Loreweaver from a *prep tool with live-play ambitions* to a *live-play instrument with an active editor* — and open the plugin system to real UI contributions.

**Relationship to the 12-feature plan (`2026-10-21-loreweaver-feature-set.md`):** that plan is safety + maintainability (dimension safety, offline bundle, tests, `App.tsx` split, `any` removal). This plan is **additive capability**. Do the two in dependency order where they overlap: the `App.tsx` split (feature 9) helps this plan, and the Architect tool-audit log (feature 8) is a prerequisite for the Session Ledger.

**Architecture:** Each wave lands on existing machinery — the world model (manifest, provenance, entity graph), the hybrid search embeddings, the `AgentEvent` streaming channel, the Boa plugin host, and `validate_safe_path`. No parallel subsystems are invented.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Tauri v2, Rust 2021, SQLite (rusqlite bundled), Specta bindings, Vitest + RTL, `cargo test`.

**Spec:** `DESIGN.md` (The Tactile Ledger), `PRODUCT.md` (local-first, live-play operating context), `docs/codebase/*` (current code reality). Bold-bet proposals accepted 2026-10-21; plugin `ui` permission explicitly approved by the owner.

## Global Constraints

- All vault file writes go through `validate_safe_path` (Rust) — never bypass.
- New Tauri commands return `Result<T, String>` and get a matching `allow-*` entry in `src-tauri/capabilities/default.json` (kebab-case; `snake_case` command → `allow-snake-case`).
- New exported types go in `src-tauri/src/export_types.rs` (Specta `Type`), then regenerate the TS bindings.
- Strict TypeScript: no new `any`; `npm run build` is the type-check gate. New components go in sub-files under `src/components/`, not into `App.tsx`.
- Cross-vault state bleed is forbidden. The SQLite DB is re-initialised per vault, so `app_settings` and `session_memory` are already vault-scoped; any new **process-global** state must be keyed by vault path (mirror `PLUGIN_STATES`).
- Plugin permission widening is deliberate and audited: `ALLOWED_PERMISSIONS` (`plugins.rs:44`) grows to `["hooks", "ui", "media"]` in one reviewed change, with tests that assert unknown permissions are still rejected.
- No new runtime dependency without an explicit decision recorded in the Decision Log (PDF generation, global shortcuts, diff library are the three candidates).
- Australian English in prose.
- Every feature ships with a test, and `npm run test`, `npm run lint`, `npm run build`, `cargo test` stay green at each commit.

## Review Focus (highest-risk)

1. **Plugin `ui` permission must not become arbitrary host access.** Panels are *declarative data* rendered by the host; plugins never receive DOM/fs/network handles. The host executes only a closed set of typed actions.
2. **Global quick-capture must be opt-in and scoped.** A process-wide hotkey that writes to whichever vault is active is a cross-vault risk; it must capture against the *current* vault and refuse when no vault is open.
3. **Time Machine snapshots are local and bounded.** Snapshot size, retention, and the restore path must all stay inside `validate_safe_path`; a restore must never write outside the vault.
4. **Continuity findings are suggestions, never auto-edits.** The engine returns findings with citations; it never rewrites a note. Auto-fix is a separate, explicit action.
5. **Session Ledger must be append-only and cheap.** It is written during live play; a ledger write must never block the UI or the agent loop.
6. **Run Mode must not regress prep mode.** It is an additive `AppView`; all existing views and their guards (`guardedSetActiveView`, unsaved-changes) keep working unchanged.

---

## Wave 0 — Enabling Foundations

Land these first; later waves depend on them.

### F0.1 — Plugin UI permission model (`ui`)

**Files:** `src-tauri/src/plugins.rs`, `src-tauri/src/export_types.rs`, `src-tauri/capabilities/default.json`, `src/components/PluginPanel.tsx` (new), `src/hooks/usePlugins.ts`, `plugins/*/manifest.json` examples.

**Interfaces:**
```jsonc
// manifest.json addition
{
  "permissions": ["hooks", "ui"],
  "ui": {
    "panels": [{
      "id": "npc-generator",
      "title": "NPC Generator",
      "fields": [
        { "key": "faction", "type": "text",   "label": "Faction" },
        { "key": "tone",    "type": "select", "label": "Tone", "options": ["grim","heroic","comic"] }
      ],
      "actions": [{ "id": "generate", "label": "Generate", "hook": "generate_npc" }]
    }]
  }
}
```
Host-side result contract from the action hook (JSON string):
```jsonc
{ "type": "text",  "text": "..." }
{ "type": "table", "columns": ["Name","Role"], "rows": [["Vex","Captain"]] }
{ "type": "note",  "noteId": "...", "title": "..." }   // host opens the note
```

- [x] **Step 1: Extend the allow-list + tests.** `ALLOWED_PERMISSIONS = ["hooks", "ui", "media"]`. Add tests: `ui` accepted, `media` accepted, `"filesystem"` still rejected.
- [x] **Step 2: Parse + validate the `ui` manifest section.** Extend the manifest loader; reject panels whose `action.hook` is missing, whose field `type` is unknown, or whose `id` collides. Keep the existing `PluginInfo` shape and add `ui_panels: Vec<UiPanel>` (Specta `Type`).
- [x] **Step 3: Regenerate bindings** (`npm run tauri` binding step / repo's bindings regen).
- [x] **Step 4: Host renderer.** `PluginPanel.tsx` renders fields from the typed schema, calls `execute_plugin_hook(pluginId, action.hook, JSON(fieldValues))`, and renders one of the three typed results. No plugin-supplied HTML.
- [x] **Step 5: Wire into the right drawer** (a new "Plugins" tab section) behind `has_permission(plugin, "ui")`.
- [x] **Step 6: Ship one real example** — a `plugins/npc-generator/` panel that returns a `table`.
- [x] **Step 7: Verify** `cargo test plugin`, `npm run test`, `npm run build`.

**Acceptance:** a `ui` plugin renders a working panel; a plugin without `ui` cannot render one; unknown permissions still fail discovery.

### F0.2 — Session event bus + ledger table

**Files:** `src-tauri/src/db.rs`, `src-tauri/src/event_bus.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/export_types.rs`, `src/hooks/useSessionLedger.ts` (new).

**Interfaces:** table `session_events(id TEXT PK, kind TEXT, payload TEXT, created_at INTEGER)`; commands `log_session_event(kind, payload) -> Result<String,String>`, `list_session_events(since) -> Result<Vec<SessionEvent>,String>`.

- [x] **Step 1: Migration** — `CREATE TABLE IF NOT EXISTS session_events (...)` in `db.rs` init (additive, `IF NOT EXISTS`).
- [x] **Step 2: `SessionEvent` type** in `export_types.rs` + bindings.
- [x] **Step 3: Commands** + `allow-log-session-event`, `allow-list-session-events`.
- [x] **Step 4: Emit on the existing event bus** — add `session_event` fan-out (payload capped, like existing events).
- [x] **Step 5: Frontend hook** `useSessionLedger` polls/streams new events.
- [x] **Step 6: Test** — log → list round-trip in `cargo test`.

### F0.3 — Global undo/redo store

**Files:** `src/hooks/useUndo.ts` (new), `src/App.tsx` (provider wiring), `src/components/CommandPalette.tsx`.

**Interfaces:** `pushUndo({ label, undo: () => Promise<void>, redo: () => Promise<void> })`; `⌘Z` / `⇧⌘Z`.

- [x] **Step 1: `useUndo`** — bounded stack (e.g. 50), coalescing by label+key, async undo/redo.
- [x] **Step 2: Route reversible ops** — `rename_note`, `move_note`, `trash_note` (undo = `restore_note`), `restore_note` (undo = trash). Deletions and `empty_trash` are explicitly **not** undoable; the UI must say so.
- [x] **Step 3: Palette entries** "Undo <label>" with the label.
- [x] **Step 4: Test** — undo/redo of a rename via mocked invoke.

### F0.4 — Accessibility: type scale + reduced motion

**Files:** `src/index.css`, `src/App.css`, `src/hooks/useSettings.ts`, `src/components/SettingsView.tsx`.

- [x] **Step 1:** Add `--font-scale` (0.9 / 1.0 / 1.15 / 1.3) applied on `:root`; audit hard-coded `px` font sizes in the views to use the token where it matters (body, labels, headings).
- [x] **Step 2:** Respect `prefers-reduced-motion` — disable `connecting-pulse` and any transition loops.
- [x] **Step 3:** Persist the setting in `app_settings`; expose in Settings.
- [x] **Step 4:** Test — setting round-trips and applies a class/var.

### F0.5 — Status strip (provider / model / offline)

**Files:** `src/components/StatusStrip.tsx` (new), `src/hooks/useProviderStatus.ts` (new), `src/App.css`.

- [x] **Step 1:** Hook polls `test_provider_connection` (debounced) and surfaces `{ provider, model, reachable, modelAvailable }`.
- [x] **Step 2:** Render a 24px bottom strip: dot + provider/model + offline badge. Click opens Settings → provider.
- [x] **Step 3:** When embeddings are unavailable, show "Search: keyword only" (matches the graceful-degrade path in `search.rs`). *Unparked 2026-10-21 (owner) and shipped: `search::engine_ready()` reads the process-global engine guard (no I/O), exposed as `search_engine_ready`, polled by `useEmbeddingStatus` (a first-launch model download legitimately flips the answer mid-session), rendered as a strip badge. A failed probe counts as not-ready — we don't claim semantic results we can't promise.*
- [x] **Step 4:** Test — reachable vs unreachable states.

---

## Wave 1 — Run Mode (the hub)

Run Mode is the information architecture everything else hangs off.

### F1.1 — Run Mode shell

**Files:** `src/components/AppShell.tsx` (`AppView` union), `src/App.tsx`, `src/components/RunModeView.tsx` (new), `src/App.css`.

- [x] **Step 1:** Add `"run"` to `AppView`.
- [x] **Step 2:** Add the ribbon entry + `F1`/`F2` accelerators (Prep ↔ Run) that respect `guardedSetActiveView` (never discard unsaved edits silently).
- [x] **Step 3:** `RunModeView` grid: Scene (centre), Initiative (left rail), Pinned Rules (right rail), Ledger (bottom), Dice/Scratchpad (drawer).
- [x] **Step 4:** Test — view renders, toggles, and the unsaved-guard still fires.

### F1.2 — Scene model + pinned rules

**Files:** `src-tauri/src/lib.rs` (commands), `src/hooks/useRunMode.ts` (new), `src/components/RunModeView.tsx`.

**State (vault-scoped via `app_settings`):** `run.scene_note_id`, `run.pinned_rule_ids` (JSON array).

- [x] **Step 1:** Commands `get_run_state` / `set_run_state(key, value)` (or reuse `save_settings` with a `run.*` namespace — prefer the latter, no new command).
- [x] **Step 2:** Scene = the note currently "on stage"; renders inline in Run Mode with a "next scene" picker.
- [x] **Step 3:** Pinned rules = rule ids rendered as compact cards.
- [x] **Step 4:** Test — state persists across reload.

### F1.3 — Initiative integration

**Files:** `src/components/RunModeView.tsx`, `src/hooks/usePlugins.ts`.

- [x] **Step 1:** Render the `initiative-tracker` plugin's state (read `execute_plugin_hook("initiative-tracker","get_combat_state",...)`) in the left rail, read-only.
- [x] **Step 2:** Fallback: if the plugin is absent, show an empty state with a "add initiative plugin" hint.
- [x] **Step 3:** Test — read through a mocked hook.

### F1.4 — Session ledger UI + recorder

**Files:** `src/components/RunModeView.tsx`, `src/hooks/useSessionLedger.ts`.

- [x] **Step 1:** Bottom rail lists `session_events` chronologically (rolls, notes opened, AI answers, scene changes).
- [ ] **Step 2:** "End session" action opens the Debrief (below). *Parked 2026-10-21 (owner) — no Debrief feature is defined in this plan, and F4.1's Run Mode "Snapshot & end session" already gives the action a real job. Do not invent a Debrief to satisfy a checkbox.*
- [x] **Step 3:** Recording is automatic: `roll_dice` results and scene changes emit `session_event` (F0.2). *`save_note` auto-logging skipped — the 1.5s autosave would flood the ledger.*
- [x] **Step 4:** Test — a roll appends a ledger row.

### F1.5 — One-box intent router (`⌘K`)

**Files:** `src/components/CommandPalette.tsx`, `src/utils/intent.ts` (new).

**Routing (pure function, unit-tested):**
- `1d20+4` / `roll ...` → `roll_dice`
- `@capture <text>` → `capture_note`
- `/find <q>` or bare text → `search_vault`
- `go <view>` → navigate
- `ask <q>` or anything ambiguous → Architect stream

- [x] **Step 1:** `parseIntent(input) -> Intent` pure fn + tests (dice, capture, find, go, ask).
- [x] **Step 2:** Palette renders the parsed intent as the first row ("Roll 1d20+4", "Search 'grapple'") before fallbacks.
- [x] **Step 3:** Execute the chosen intent; keep free-text search as the default.
- [x] **Step 4:** Test — each intent parses and dispatches.

### F1.6 — Global quick-capture hotkey (opt-in)

**Files:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src/hooks/useSettings.ts`.

> **Decision required:** `tauri-plugin-global-shortcut` (new dependency). **D3 declined 2026-10-21 (owner) — F1.6 is dropped; quick-capture stays in-app only (⌘K `@capture`).** The steps below are kept for the record, not for execution.

- [ ] **Step 1:** Add the plugin behind a `quick_capture` setting; register `⌥Space` only when enabled and a vault is open.
- [ ] **Step 2:** Opens the app, focuses a minimal capture input, writes via `capture_note` to the **current** vault; refuses if none is open.
- [ ] **Step 3:** Test — disabled by default; refuses with no vault.

### F1.7 — Presentation mode

**Files:** `src/components/RunModeView.tsx`, `src/App.css`.

- [x] **Step 1:** "Read aloud" toggle: hide chrome, scale type, maximise contrast; `Esc` exits.
- [x] **Step 2:** Test — toggle hides the ribbon/tree and restores on exit.

---

## Wave 2 — Continuity Engine

### F2.1 — Entity + alias registry

**Files:** `src-tauri/src/continuity.rs` (new), `src-tauri/src/entity_graph` (existing graph builder), `src-tauri/src/export_types.rs`.

- [x] **Step 1:** Extract entities from note frontmatter (`type`, `faction`, `status`, `aliases`) + wikilink targets.
- [x] **Step 2:** Alias table (from frontmatter `aliases: [Vex, Captain Vex]`), fuzzy-matched with the existing `levenshtein_distance`.
- [x] **Step 3:** Test — aliases collapse to one entity; non-aliases stay distinct.

### F2.2 — Contradiction detectors

**Files:** `src-tauri/src/continuity.rs`.

**Detectors (each returns `Finding { id, kind, severity, note_ids, evidence, citation }`):**
- `dead_actor` — `status: dead` + later-dated mention of the name.
- `date_conflict` — two events with dates that contradict a `before/after` edge.
- `faction_drift` — `faction` changes across notes with no `provenance: history` note between them.
- `duplicate_entity` — alias/levenshtein collision above threshold.
- `orphan_thread` — a note tagged `thread` with no inbound links and no status.

- [x] **Step 1:** Implement detectors as pure functions over `(notes, metadata)`.
- [x] **Step 2:** Test each detector with fixture notes (one positive, one negative).
- [ ] **Step 3:** Optional LLM pass: send only *findings + cited snippets* to the configured provider for a severity judgement; never send the whole vault. *Decided 2026-10-21 (owner, see D8) — opt-in, local-first, model `bonsai-2:9b` (not `llama3:8b`, which is unreliable for this judgement). Not yet built; no blocker.*

### F2.3 — Findings UI + citations

**Files:** `src/components/ContinuityView.tsx` (new), `src/hooks/useContinuity.ts` (new), `src/AppShell.tsx` (view + ribbon).

- [x] **Step 1:** Command `audit_continuity(vault_path) -> ContinuityReport` + `allow-audit-continuity`.
- [x] **Step 2:** View groups findings by severity, each with "open note" + cited line.
- [x] **Step 3:** "Fix" is a *suggestion* that opens the editor at the cited line — never an auto-write.
- [x] **Step 4:** Test — a fixture world produces the expected findings.

### F2.4 — Entity merge / dedup

**Files:** `src-tauri/src/continuity.rs`, `src/components/ContinuityView.tsx`.

- [x] **Step 1:** `merge_entities(keep_id, drop_id)` rewrites wikilinks + aliases, trash the duplicate (via existing `trash_note`).
- [x] **Step 2:** Confirmation modal (destructive).
- [x] **Step 3:** Test — links rewrite from drop→keep; the drop note is trashed, not deleted.

---

## Wave 3 — Authoring

### F3.1 — Co-writer diff

**Files:** `src/components/CoWriterDiff.tsx` (new), `src/components/MarkdownEditor.tsx`, `src-tauri/src/agent.rs` (a `revise_text` command), `src/utils/diff.ts` (new).

> **Decision required:** `@codemirror/merge` (preferred, proper hunk UI) vs a home-grown line LCS diff (no dependency). Plan assumes the home-grown `diff.ts` first; swap to `@codemirror/merge` if approved.

- [x] **Step 1:** `revise_text(text, instruction) -> Result<String,String>` via `providers::llm` (no tools, no vault writes).
- [x] **Step 2:** `diff.ts` line-LCS producing `{left, right, hunks}` + tests.
- [x] **Step 3:** Editor "Revise…" action on selection opens the diff modal; accept-hunk / reject-hunk; applying writes through the normal editor save path.
- [x] **Step 4:** "Humanise" preset calls the unslop plugin (`clean_note`) and opens the same diff.
- [x] **Step 5:** Test — diff hunks apply correctly; a rejected revision changes nothing.

### F3.2 — Note templates

**Files:** `src/components/Modals.tsx` (or a new `TemplatePicker.tsx`), `src/utils/templates.ts` (new).

- [x] **Step 1:** Templates as frontmatter+body scaffolds keyed by the world's `note_types`.
- [x] **Step 2:** "New → NPC" pre-fills `type`, `status`, `faction`, section headings.
- [x] **Step 3:** Test — creating from a template yields the expected frontmatter.

### F3.3 — Drag-and-drop linking

**Files:** `src/components/VaultTree.tsx`, `src/components/MapBuilderView.tsx`, `src/components/TimelineView.tsx`, `src/components/EntityGraphView.tsx`.

- [x] **Step 1:** Draggable note rows (`dataTransfer` with note id). *Already present: `application/loreweaver-note-path`.*
- [ ] **Step 2:** Drop on map → pin token; drop on timeline → set date; drop on graph → add edge. *Timeline drop done (`onDropNote` → set `date`). Map-pin and graph-edge drops parked 2026-10-21 (owner) — same `dataTransfer` contract against existing save commands; unpark when the map is next worked on.*
- [x] **Step 3:** All mutations go through existing save commands (no new write paths).
- [x] **Step 4:** Test — drop handlers call the right command with the right payload.

### F3.4 — Related notes panel

**Files:** `src-tauri/src/search.rs` (a `nearest_notes(note_id, k)` command), `src/components/RelatedNotes.tsx` (new), `src/hooks/useRelatedNotes.ts`.

- [x] **Step 1:** Command reuses cached chunk embeddings; cosine over the note's chunks vs other notes (use the new `dot_product`).
- [x] **Step 2:** Right-drawer panel with "related by meaning" + one-click open.
- [x] **Step 3:** Test — a fixture where two notes share a topic returns each other.

---

## Wave 4 — Data & Safety

### F4.1 — Vault Time Machine

**Files:** `src-tauri/src/snapshots.rs` (new; reuse `bundles.rs` zip logic), `src-tauri/src/lib.rs`, `src/components/TimeMachineView.tsx` (new), `src/hooks/useSnapshots.ts`.

**Interfaces:** `create_snapshot(label) -> Result<String,String>`, `list_snapshots() -> Vec<SnapshotInfo>`, `snapshot_diff(id) -> Vec<FileChange>`, `restore_note_from_snapshot(id, path) -> Result<(),String>`.

- [x] **Step 1:** Snapshot = zip of the vault under `<app_data>/snapshots/<vault>/<timestamp>.zip` (exclude `.trash`, `_assets` optionally). *Shipped as `snapshots.rs`: excludes `.trash`, `.git`, `node_modules`, the SQLite index and its WAL sidecars; `_assets` stays in (restores need it). Zip written to `.part` then renamed; metadata lives in a per-snapshot JSON sidecar.*
- [x] **Step 2:** Retention setting (default keep last 20); prune oldest. *Read from `snapshots.retention` in `app_settings`; pruning deletes the sidecar too.*
- [x] **Step 3:** Diff = compare file hashes between snapshot and current vault → `added/modified/removed`. *FNV-1a 64 + length, computed in-process; `FileChange { path, kind }`.*
- [x] **Step 4:** Restore writes **only** through `validate_safe_path`, to a single file, with confirmation. *Zip entry names re-validated against zip-slip; `validate_safe_path` widened to `pub(crate)` so the module reuses the one guard.*
- [x] **Step 5:** "Snapshot on session end" hook wired from Run Mode. *Run Mode's ledger panel now carries "Snapshot & end session" (`onEndSession`): snapshot, then back to the dashboard. The Debrief half of F1.4 Step 2 stays deferred — no Debrief feature is defined.*
- [x] **Step 6:** Test — create → mutate → diff → restore round-trip in a temp vault. *5 Rust tests (round-trip, retention prune, traversal rejection, missing entry, `.trash`/db exclusion) + 7 `useSnapshots` + 8 `TimeMachineView` Vitest cases.*

### F4.2 — Bulk operations

**Files:** `src/components/VaultTree.tsx`, `src-tauri/src/lib.rs`.

- [x] **Step 1:** Multi-select (⌘/⇧ click) with a selection action bar. *`src/utils/selection.ts` holds the modifier rules as a pure function (⌘ toggles, ⇧ ranges from a stable anchor, hidden/collapsed notes never enter a range); `BulkActionBar` renders count + Trash / Move-to / Tag and disables itself mid-batch. The tree keeps the selection after a batch — a cancelled confirm must not cost the user their selection — and prunes it when notes disappear.*
- [x] **Step 2:** Commands `trash_notes(ids)`, `move_notes(ids, dest)`, `tag_notes(ids, tag)` — each batched, each `validate_safe_path`, each atomic per note with a summary result. *Shipped as `BulkResult { succeeded, failed: [{ path, error }] }`. Trash and move reuse the extracted `trash_note_impl` / `rename_note_impl` (id-preserving); tagging normalises both frontmatter forms into an array and is idempotent. A bad tag fails the batch before any write, with the tag as the reason rather than blaming each note.*
- [x] **Step 3:** Tests for partial failure reporting. *8 Rust tests (partial trash/move/tag, idempotent tagging, bad-tag batch rejection, Root move, id preservation) + 12 `selection` cases + 8 `BulkActionBar` cases + 6 `VaultTree` integration cases.*

### F4.3 — Saved searches / smart folders

**Files:** `src-tauri/src/db.rs` (`saved_searches` table or `app_settings` JSON), `src/components/VaultTree.tsx`, `src/hooks/useSavedSearches.ts`.

- [x] **Step 1:** Query shape `{ name, kind: "fts"|"filter", query, filters }` (e.g. `type:npc AND !faction`). *Stored in a `saved_searches` table in the per-vault DB (`SavedSearch` type, three commands). The filter grammar lives in `src/utils/filter.ts` as a pure function: `field:value`, `!field`, `!field:value`, `tag:`, `title:`, `path:`, quoted values, bare terms against title/content. Terms are AND-ed; `AND`/`OR` are accepted as noise words because the semantics are always AND — a filter that guessed at OR would be worse than a second saved search.*
- [x] **Step 2:** Render as a tree section; click runs it. *`SavedSearchesSection` sits above the tree in the vault sidebar (count shown on the active row, delete without running). Filter-kind runs entirely in the frontend over loaded notes — no IPC; fts-kind runs through the existing `search_vault` and maps hits back to notes by path, then applies its `filters` structurally. An unresolved fts search shows nothing, not everything: "no filter" and "still resolving" must not look alike.*
- [x] **Step 3:** Test — a saved filter returns the expected note set. *15 `filter` cases (including the plan's `type:npc AND !faction`, both tag forms, case-insensitive keys, missing keys), 9 section cases, 7 hook cases (local filtering makes no IPC call at all), 1 Rust round-trip (create/update/list-order/delete).*

### F4.4 — Cross-world search

**Files:** `src-tauri/src/crossworld.rs` (new), `src-tauri/src/search.rs`, `src/components/CommandPalette.tsx`, `src/hooks/useCrossWorldSearch.ts`.

> **Architectural note:** each world has its own SQLite DB (re-initialised on switch), so cross-world search needs a *fan-out* that opens each world's DB read-only, or a small global title/tag index. Plan the **fan-out, titles+tags only** first; semantic cross-world search is a second step.

- [x] **Step 1:** `search_all_worlds(query)` → titles+tags across every world folder, with world badges. *`crossworld.rs`: reads each world's markdown directly (no index, so an unopened world cannot answer from stale data), matches title → tag → path, caps at 40 hits per world, skips `.trash`/`_assets`/non-markdown, and excludes `_liminal`. Hits carry world id, world path, tags and which field matched.*
- [x] **Step 2:** UI result rows carry a world badge; clicking switches world + opens note. *Palette footer toggle with a live honesty line ("N worlds · titles, tags & meaning" vs "titles & tags only"). Hits pinned above local notes, capped at 4 — the palette is a jump list, not a results page. A cross-world hit switches worlds when needed and opens the note once the new vault's notes land; a same-world hit opens immediately. Semantic second pass runs after the structural one on the same query (debounced 250 ms, superseded responses dropped); each world DB is opened read-only and skipped with `semantic_used: false` when the engine is not loaded.*
- [x] **Step 3:** Test — two fixture worlds both contribute results. *4 Rust tests (two worlds contribute, tag kind reported, path matching + per-world cap, empty query, `.trash`/`_liminal`/non-markdown excluded, semantic skip honesty), 5 `useCrossWorldSearch` cases, 5 palette scope cases.*

### F4.5 — Activity centre

**Files:** `src/components/ActivityCentre.tsx` (new), `src/AppShell.tsx`.

- [x] **Step 1:** Consume the event bus (watcher, plugin, agent, image) into a bounded in-memory log. *`event_bus::emit` now mirrors every app event to the webview as `loreweaver://activity` with `{ event, at, payload }` (registered via a `OnceLock<AppHandle>`, so tests and headless runs emit to plugins exactly as before and mirror nowhere). `useActivityLog` keeps a 200-entry ring buffer, newest first; `vault-changed` is included but coalesced — consecutive syncs inside 2 s fold into one row with a ×count, because the watcher fires several times per save and an unreadable log is not a log.*
- [x] **Step 2:** Badge + panel; no blocking toasts for routine events. *`ActivityCentre` sits in the toolbar: unread badge (capped at 99+) that resets when the panel opens, panel with time · label · detail and a Clear. Nothing here steals focus or interrupts play — the point of the centre is that routine activity has somewhere to go that is not a toast.*
- [x] **Step 3:** Test — an event appears in the log once. *9 `useActivityLog` cases (appears once, envelope without an event ignored, vault-burst coalescing, separate events stay separate rows, ring-buffer bound, unread reset on open, clear, unsubscribe on unmount) + 9 `ActivityCentre` cases + 2 Rust tests for the wire envelope shape.*

---

## Wave 5 — Output & Interop

### F5.1 — Session Packet (PDF)

**Files:** `src-tauri/src/packet.rs` (new) or a client-side generator, `src/components/RunModeView.tsx`, `src/utils/pdf.ts`.

> **Decision required:** PDF generation path — (a) Rust crate (`printpdf`), (b) client-side `jsPDF`, (c) WebView print-to-PDF. Plan assumes (a) Rust `printpdf` for offline determinism; (b) is the fallback if the dependency is declined.

- [ ] **Step 1:** Packet assembly: recap (from `summarize_session`), initiative, NPC statblocks, map image, player handouts (provenance-filtered: exclude `speculation`/`invention`).
- [ ] **Step 2:** Render with Ledger typography (serif display, mono labels) into a PDF.
- [ ] **Step 3:** Save via dialog (reuse `bundles.rs` save-dialog pattern).
- [ ] **Step 4:** Test — a fixture world produces a non-empty PDF with expected sections.

### F5.2 — Print any note

**Files:** `src/components/MarkdownEditor.tsx`, `src/utils/print.ts` (new).

- [ ] **Step 1:** Print stylesheet (`@media print`) hiding chrome, using Ledger tokens.
- [ ] **Step 2:** "Print" action in the note toolbar.
- [ ] **Step 3:** Test — print CSS present and scoped.

### F5.3 — Obsidian import

**Files:** `src-tauri/src/import.rs` (new), `src/components/WorldShelf.tsx`.

- [ ] **Step 1:** `import_obsidian_vault(source, target_world)` — copy `.md`, skip `.obsidian/`, map `[[links]]` (already supported), import attachments into `_assets/`.
- [ ] **Step 2:** Preview report (count, conflicts) before write.
- [ ] **Step 3:** All writes through `validate_safe_path`; test with a temp fixture vault.

---

## Wave 6 — Scene Ambience

### F6.1 — Media permission + host audio player

**Files:** `src-tauri/src/plugins.rs`, `src-tauri/src/export_types.rs`, `src-tauri/src/ambience.rs` (new), `src/components/AmbienceBoard.tsx` (new).

**Design:** plugins with `media` may declare **cue packs** (data only): `{ cues: [{id, label, file}] }`. The **host** validates `file` is under `<vault>/_assets/audio/` and plays it. Plugins never get an audio host binding.

- [ ] **Step 1:** Add `media` to the allow-list (F0.1 already widened it) + manifest `media.cues` parsing with path validation.
- [ ] **Step 2:** Core player: `play_ambience(cue_id)`, `stop_ambience`, `set_ambience_volume` (Tauri audio via `rodio` or the existing speech stack — decision).
- [ ] **Step 3:** Test — a cue path outside `_assets/audio/` is rejected.

### F6.2 — Scene ↔ ambience binding + Run Mode cues

**Files:** `src/components/AmbienceBoard.tsx`, `src/components/RunModeView.tsx`, `src-tauri/src/lib.rs`.

- [ ] **Step 1:** Bind a cue pack + cue to a scene note (frontmatter `ambience: {pack, cue}`).
- [ ] **Step 2:** Run Mode shows cue buttons (Play/Stop/Next); scene change can auto-cue when enabled.
- [ ] **Step 3:** Test — binding round-trips; auto-cue toggle respected.

---

## Execution Order & Dependencies

```
Wave 0 (foundations)  →  Wave 1 (Run Mode)  →  Wave 2 (Continuity)
        │                       │
        ├── F0.1 ui ───────────┼── F0.2 ledger ── F1.4
        │                       ├── F0.3 undo ──── F4.2 (bulk undo)
        │                       └── F0.5 status
        │
Wave 3 (authoring)  — depends on Wave 1 for the Run Mode writing surface
Wave 4 (data)      — F4.1 Time Machine depends on Run Mode "session end"
Wave 5 (output)    — F5.1 Packet depends on F1.4 ledger + F0.2
Wave 6 (ambience)  — depends on F0.1 media permission
```

**Recommended build order:** 0 → 1 → 5.1/5.2 (fast visible wins) → 2 → 4.1 → 3 → 6.

## Decision Log

| # | Decision | Status |
|---|---|---|
| D1 | Plugin `ui` permission (declarative, host-rendered panels) | **Approved 2026-10-21** (owner) |
| D2 | Plugin `media` permission (cue data only; host plays) | **Approved 2026-10-21** (owner) — design constraint: no plugin audio binding |
| D3 | Global shortcut dependency (`tauri-plugin-global-shortcut`) | **Declined 2026-10-21** (owner). F1.6 is dropped: in-app ⌘K capture already covers the case, and a process-wide hotkey can write into the wrong world before the app has been driven in a live session. Revisit after real play. |
| D4 | PDF generation path (`printpdf` vs `jsPDF` vs WebView print) | **Decided 2026-10-21 (owner): (c) WebView print-to-PDF.** Zero new dependencies, and the same `@media print` stylesheet serves F5.2 (print any note). Requires `core:webview:allow-print` in the capability and accepts the system save dialog instead of a silent file write. `printpdf` stays in reserve only if one-click export without a dialog is later wanted. |
| D5 | Diff library (`@codemirror/merge` vs home-grown `diff.ts`) | **Closed 2026-10-21 — settled by implementation.** The dependency-free `src/utils/diff.ts` (line LCS + `applyHunks`) shipped with F3.1 and is wired into `CoWriterDiff.tsx`. `@codemirror/merge` is not installed and is not planned. |
| D6 | Audio playback dependency (`rodio` vs existing stack) | **Decided 2026-10-21 (owner): (b) WebView `<audio>` + scoped `assetProtocol`.** No new Rust dependency; the scope is limited to `<vault>/_assets/audio/**`. `symphonia` already decodes mp3/wav if Rust-side analysis is wanted later. Host-only playback keeps the plugin `media` contract intact (no plugin audio binding). **Later development (owner): a Subsonic/Navidrome client mode for ambience** — cue packs served from the home music library instead of vault files. Recorded as a future direction, not in scope for F6. |
| D7 | Cross-world semantic search (global index vs per-world fan-out) | **Decided 2026-10-21 (owner): fan-out first.** F4.4 ships title/tag fan-out; semantic fan-out follows. Cheaper than the plan assumed: the embedding model is process-global (`app_data/models/all-MiniLM-L6-v2`), only the chunk vectors are per-vault (`note_chunks`), so a fan-out embeds the query once and dot-products each world's stored 384-d vectors — no re-embedding, no global index. |
| D8 | Continuity LLM pass (send findings + citations to provider) | **Decided 2026-10-21 (owner): opt-in, local-first, `bonsai-2:9b`.** Default to the local provider so nothing egresses unnoticed. The model default must **not** be `llama3:8b` — it is unreliable for this judgement; test on `bonsai-2:9b` (fast). Sends findings + cited snippets only, never the vault. Findings remain suggestions. |

## Verification Gates (every wave)

- `npm run test` — Vitest suites stay green.
- `npm run lint` — clean.
- `npm run build` — type-check + bundle.
- `cargo test` — Rust suites stay green (note: the keyring test is opt-in via `LOREWEAVER_TEST_KEYRING=1`).
- `npm run verify-docs` — documentation links stay valid.
- Capability audit: every new command has its `allow-*` entry.
