# RECON — Phase 0 Survey: FATE of Cthulhu Campaign Tool

Read-only survey of the Loreweaver repo. No changes made. Evidence cited as
`path:line`. Source of truth for current code reality: `docs/codebase/*`.

---

## 1. Campaign-Loop Features

All seven features are **real implementations**, not placeholders. The only
true placeholder is **local STT**. Verdicts below distinguish working /
placeholder / missing per feature.

| # | Feature | Verdict | Key evidence |
|---|---------|---------|--------------|
| 1 | Timeline | **Working (basic)** | `src/components/TimelineView.tsx:25-59` |
| 2 | Entity graph | **Working (static)** | `src/components/EntityGraphView.tsx:69-77` |
| 3 | Canvas / map | **Working** | `src/components/MapBuilderView.tsx`, `src/components/FolderCanvas.tsx` |
| 4 | Architect / RAG | **Working** | `src-tauri/src/agent.rs:18-75` |
| 5 | Session memory & summary | **Working** | `src-tauri/src/lib.rs:1090-1181`, `src-tauri/src/db.rs:506-543` |
| 6 | STT / TTS | **Working (partial)** | `src-tauri/src/providers/speech.rs` |
| 7 | Plugin system | **Working** | `src-tauri/src/plugins.rs` |

### 1.1 Timeline view (era-hopping spine) — Working (basic)
- `src/components/TimelineView.tsx` (187 lines) parses `date` frontmatter
  (ISO `1245-03-17` and year-first `Year 3` via `parseDateKey`, lines 25-39),
  sorts chronologically, renders a vertical timeline with dots, type badges,
  click-to-open (lines 41-185).
- Wired in `src/App.tsx:581-589`; nav in `src/components/AppShell.tsx:138-141`.
- **Gap:** read-only chronological list. **No era-hopping interaction** — no
  era grouping, no era-switch navigation, no era metadata model. Minimal for a
  "campaign spine."

### 1.2 Entity graph (conspiracy map) — Working (static)
- `src/components/EntityGraphView.tsx` (248 lines) builds nodes from notes with
  frontmatter `type` in `{npc, location, faction, item, event}` (lines 61-64),
  edges from wiki-links and relationship fields (lines 90-118), renders SVG
  with type-colored nodes and labeled edges (lines 164-242).
- Wired in `src/App.tsx:571-579`; nav in `AppShell.tsx:131-134`.
- **Gap:** layout is a **static circular arrangement** (`angle = i/n * 2π`,
  radius 220, lines 69-77). Doc comment claims "force-ish layout" but there is
  **no force simulation, no drag, no zoom/pan**. Nodes clickable to open notes
  only. (`FolderCanvas.tsx` has richer pan/zoom/drag but is a separate
  folder-board, not the entity graph.)

### 1.3 Canvas / map builder (spatial play) — Working
- `src/components/MapBuilderView.tsx` (533 lines): draggable tokens (117-125,
  189-201), fog-of-war regions with toggle (127-145, 365-412), distance ruler
  (203-224, 415-446), pan/zoom (155-187), grid, save/load via
  `save_canvas_file`/`load_canvas_file` (83-115). Wired in `App.tsx:563-569`;
  nav in `AppShell.tsx:124-127`.
- `src/components/FolderCanvas.tsx` (986 lines): separate folder-board canvas
  with pan/zoom/drag, folder-to-node layout, wiki-link edges, plugin hook
  integration (line 192).
- **Gap:** MapBuilder persists to a **hardcoded relPath**
  `"Maps/Active_Map.canvas"` (`App.tsx:566`) — no per-map file picker. Both are
  client-side SVG; no backend spatial model.

### 1.4 Architect / RAG chat — Working (real RAG)
- `src/components/AiView.tsx` (116 lines): "Campaign Architect" chat UI
  (38-108).
- `src-tauri/src/agent.rs`: `build_system_context` runs hybrid semantic search
  (`search::hybrid_query`, line 18), injects top-4 context segments (27-35),
  active-note content (39-50), persistent session-memory facts (52-65), then
  assembles the system prompt (68-75). `generate_response` delegates to
  `providers/llm.rs` (88-108).
- `src/hooks/useAgent.ts`: `handleSendChatMessage` (~150) calls backend;
  `handleGenerateChatImage` (264) for image-in-chat.
- **Note:** genuine RAG pipeline, not a placeholder. `ARCHITECTURE.md:51` claim
  that image generation is "simulated with a timer" is **stale** —
  `providers/image.rs` has real ComfyUI/Stability/OpenAI calls (77-117).

### 1.5 Session memory & summary — Working (manual; no auto-capture)
- Backend: `src-tauri/src/db.rs` — `session_memory` table (133-138),
  `insert_session_memory` (506), `list_session_memory` (521),
  `delete_session_memory` (541). Commands in `lib.rs:1090-1118`
  (`save_session_memory`, `list_session_memory`, `delete_session_memory`) and
  `summarize_session` (1120-1181) which calls the LLM for a structured Markdown
  recap (What Happened / Decisions / Open Threads).
- Frontend: `src/hooks/useAgent.ts` — `loadMemoryFacts` (181), `addMemoryFact`
  (188), `deleteMemoryFact` (198), `handleSummarizeSession` (209). Memory facts
  injected into RAG context (`agent.rs:52-65`).
- **Gap:** memory is **manually added** (user saves facts) — **no automatic
  post-session capture**; summary is generated on-demand from the current chat
  transcript, not persisted to a session log.

### 1.6 STT / TTS — Working (TTS full, STT partial)
- Backend: `src-tauri/src/providers/speech.rs` — `generate_speech` (12-114)
  supports OpenAI TTS (25-58), ElevenLabs (59-88), local espeak-ng (89-111).
  `transcribe_speech` (120-177) supports OpenAI Whisper (135-172); **local STT
  is explicitly unimplemented** (173-175: `"Local STT is not yet implemented"`).
- Frontend: `src/hooks/useSessionTools.ts` — `handleGenerateSpeech` (107-128),
  `handleTranscribeAudio` (134-160, file → base64 → `transcribe_speech`).
  `src/hooks/useAgent.ts:238-261` — `handleSpeakAsNpc` (NPC voice TTS).
- UI: `src/components/RightDrawer.tsx` — TTS tab (1113-1161), STT tab
  (1176-1214). Settings tabs in `SettingsView.tsx:359-360`.
- **Gap:** STT is **file-upload only** (no live/mid-session mic dictation — no
  WebAudio/MediaRecorder capture). TTS fully functional.

### 1.7 Plugin system — Working (real Boa host, narrow surface)
- Backend: `src-tauri/src/plugins.rs` (523 lines) — full Boa-based JS host:
  manifest loading + permission validation (40-50, 140-198), dry-run compile
  (108-119), per-vault state isolation (`PLUGIN_STATES`, 61, 288-295), safe
  JSON→JS state injection (205-243), hook execution with 5s wall-clock timeout
  + 50k loop cap (259-346), plus unit tests (420-523).
- Bundled plugins: `plugins/` — `character-roller`, `threat-evaluator`,
  `initiative-tracker`, `encounter-builder` (all `permissions: ["hooks"]`).
- Frontend: `src/hooks/usePlugins.ts` — `execute_plugin_hook` (34) + 4 handlers
  (48, 81, 114, 160). UI in `RightDrawer.tsx:453-545` (GM Plugins tab),
  `SettingsView.tsx:271-278`. `useSessionTools.ts:67` uses `dice-roller`.
- **Gaps:** permission surface **narrow** — only `"hooks"` allowed
  (`plugins.rs:41`). Plugins are **hardcoded into the UI** (RightDrawer switches
  on specific plugin IDs, 456-531) rather than dynamically rendered from a
  generic contract. No strong sandbox beyond the allow-list (per AGENTS.md).

### 1.8 Cross-cutting
- All 7 features are real implementations; only true placeholder is **local STT**
  (`speech.rs:173-175`).
- `ARCHITECTURE.md:51` image-generation claim is stale (real provider calls
  exist in `providers/image.rs`).
- Biggest gaps vs the campaign-loop vision: **no era-hopping** (Timeline), **no
  interactive graph layout** (EntityGraph), **no live mic dictation** (STT), **no
  automatic post-session capture** (Session memory).

---

## 2. Docs Situation

### 2.1 DESIGN.md / PRODUCT.md / FEATURE_PROPOSAL.md — ALL ABSENT
- **None of the three exist** — not in the repo root, not anywhere in the tree,
  and not tracked by git. `ls`/`find -iname`/`git ls-files` all return zero
  matches for any case variant.
- Their described roles ("The Tactile Ledger" design north star; product intent)
  come **only from `TASK.md`** (untracked), not from any actual file.

### 2.2 How AGENTS.md references them
- **AGENTS.md does NOT reference DESIGN.md, PRODUCT.md, or FEATURE_PROPOSAL.md
  at all** (grep for all three + "Tactile Ledger" → zero matches).
- AGENTS.md references only `docs/codebase/*` (all 7 exist, tracked) plus root
  `README.md`/`ARCHITECTURE.md` (both exist). No dangling references there.
- The only place the three missing files are mentioned is `TASK.md` (untracked),
  lines 28-31.

### 2.3 Files under docs/codebase/ (all tracked)
- `ARCHITECTURE.md`, `STACK.md`, `STRUCTURE.md`, `CONVENTIONS.md`,
  `INTEGRATIONS.md`, `CONCERNS.md`, `TESTING.md`

### 2.4 Git tracked/untracked state
- `git status --porcelain` shows only three untracked entries: `.opencode/`,
  `PIPELINE.md`, `TASK.md`.
- **DESIGN.md, PRODUCT.md, FEATURE_PROPOSAL.md are neither tracked nor
  untracked — they simply do not exist.**

### 2.5 Risks
- **⚠️ Missing docs referenced by tasking:** `TASK.md` frames DESIGN.md /
  PRODUCT.md / FEATURE_PROPOSAL.md as if they exist or are untracked. In
  reality **none exist anywhere**. Stale/aspirational reference.
- **⚠️ No design/product north-star doc exists.** The repo's only design intent
  lives in `docs/superpowers/specs/*` (dated design specs) and `docs/codebase/*`
  (current reality). No single DESIGN.md / PRODUCT.md.
- **⚠️ Untracked tasking/docs:** `TASK.md` and `PIPELINE.md` are untracked, so
  the task referencing the missing docs is itself not version-controlled.
- **Minor:** root `ARCHITECTURE.md:71` links to
  `file:///Users/chris/Development/loreweaver/docs/codebase/ARCHITECTURE.md` — a
  **hardcoded absolute path pointing at a different repo dir** (`loreweaver`,
  not `loreweaver-fate-of-cthulhu`). Latent broken-link risk.

---

## 3. Test Gap

**AGENTS.md claim ("no test coverage exists; `npm run build` is the de-facto
type-check gate") is STALE / REFUTED.** The repo has a real, configured test
suite on both sides.

### 3.1 package.json scripts (verbatim, lines 6-13)
```
6:   "scripts": {
7:     "dev": "vite",
8:     "build": "tsc && vite build",
9:     "preview": "vite preview",
10:    "tauri": "tauri",
11:    "test": "vitest run",
12:    "verify-docs": "node docs/verify.mjs"
13:  },
```
- A **`test` script EXISTS** (line 11): `vitest run`.
- `build` (line 8) is `tsc && vite build` — so `npm run build` **is** the
  de-facto type-check gate (tsc runs first), but it is **not** the only
  verification path.

### 3.2 Frontend tests — 8 exist (all `*.test.tsx`)
- `src/App.test.tsx`
- `src/components/SettingsView.test.tsx`
- `src/components/RulesView.test.tsx`
- `src/components/CampaignVaultView.test.tsx`
- `src/components/TrashView.test.tsx`
- `src/components/FolderCanvas.test.tsx`
- `src/components/DashboardView.test.tsx`
- `src/components/MarkdownEditor.test.tsx`
- No `__tests__/` or `tests/` directories found.

### 3.3 Rust tests — EXIST (38 `#[test]`/`#[cfg(test)]` matches across 7 files)
- `search.rs` (3), `lib.rs` (14), `db.rs` (3), `providers/llm.rs` (2),
  `ingest.rs` (1), `plugins.rs` (3), `watcher.rs` (3). ~29 tests total
  (TESTING.md claims 30).

### 3.4 docs/codebase/TESTING.md
- Documents a split strategy: Vitest + React Testing Library + jsdom for
  frontend (`npm run test`), `cargo test` for backend (claims **30 tests
  pass**), plus a "Roadmap / Missing Coverage" section listing untested areas
  (agent orchestration E2E, vault lifecycle, AI media commands, settings
  persistence, plugin-host command, canvas file commands).

### 3.5 Test config
- No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `.mocharc*`.
- Vitest configured **inline** in `vite.config.ts:12-16` (`globals: true`,
  `environment: "jsdom"`, `setupFiles: "./src/test/setup.ts"`).
- `src/test/setup.ts` mocks Tauri's `__TAURI_INTERNALS__`, `localStorage`, and
  provides a DOMMatrix polyfill for pdfjs-dist.
- Dev deps include `vitest`, `@testing-library/react`,
  `@testing-library/jest-dom`, `jsdom` (package.json:42-50).

### 3.6 Verdict
- **"No test coverage" — REFUTED.** Both frontend (8 Vitest suites) and backend
  (≈29 Rust tests) have real, configured tests.
- **"`npm run build` is the de-facto type-check gate" — CONFIRMED** (build =
  `tsc && vite build`), but it is no longer the *only* verification path;
  `npm run test` and `cargo test` also exist.
- **AGENTS.md is stale** and should be updated to reflect the actual test setup
  (its "no `npm test` script / no Rust test suite" claims are incorrect).

---

## 4. Generation Conditioning

### 4.1 Entry point / orchestration
- RAG chat driven by Tauri command `orchestrate_agent`
  (`src-tauri/src/lib.rs:1199`). Takes `prompt`, provider/model/key/base_url,
  optional `active_note_id`. Acquires DB lock, calls
  `agent::build_system_context(&conn, prompt, active_note_id)` (`lib.rs:1218`),
  then `agent::generate_response` → `providers::llm::generate_response`
  (`agent.rs:88-108`).
- `SystemContext` struct (`providers/llm.rs:12-14`) carries `system_prompt` and
  `active_note_context`; `system_prompt` passed as the system message to every
  provider (`llm.rs:40,61,73,85`).

### 4.2 How RAG context is assembled (`agent.rs:12-81`)
`build_system_context` builds three context blocks concatenated into one system
prompt:
1. **Hybrid search results** (`agent.rs:18-35`): `search::hybrid_query(conn,
   prompt, "all")`, takes **top 4**, formats each as `Context Segment {n}
   (Source: {title}, Type: {type}):\n{snippet}`. Snippet is the retrieved
   **chunk text** (notes) or `[source] chunk_text` (rules).
2. **Active note** (`agent.rs:38-50`): if `active_note_id` set, injects full
   note `title` + `content` verbatim as "Currently Open Note sheet".
3. **Persistent session memory** (`agent.rs:53-65`): `db::list_session_memory`,
   injects up to **20** facts as `- [category] fact (id: ...)` under
   "PERSISTENT CAMPAIGN MEMORY".
- Fixed system prompt template (`agent.rs:68-75`): *"You are an expert RPG
  Campaign Architect and Game Master assistant... Answer questions regarding
  rules and lore accurately based on the campaign materials provided below."*

### 4.3 What is retrieved and how it is ranked (`search.rs:540-698`)
`hybrid_query` is **hybrid lexical + semantic** over two corpora (note chunks,
rule chunks):
- **Phase 1 — FTS5 lexical** (`search.rs:549-604`): BM25, 20 hits each,
  `score = fts_score * 0.3`.
- **Phase 2 — Vector semantic** (`search.rs:606-687`): embeds query, cosine
  dot-product against every cached chunk embedding. Hits above threshold **0.4**
  weighted `score = cosine * 0.7`.
- **Phase 3 — Fusion & ranking** (`search.rs:689-697`): dedup by key
  `note:{title}` / `rule:{title}` (higher score wins), sort descending.
- Retrieved unit is **chunks** (from `note_chunks` / `rule_chunks`), aggregated
  to document level by title, ranked by BM25 (0.3) + cosine (0.7). Top 4 chunk
  snippets injected into the prompt.

### 4.4 Embedding dimensions (384)
Hardcoded to 384 in `src-tauri/src/search.rs`:
- `search.rs:411` `let mut sum_embedding = vec![0.0f32; 384];`
- `search.rs:417-418` loop `for d in 0..384`
- `search.rs:423` `let mut embedding = vec![0.0f32; 384];`
- `search.rs:438` normalization loop
- `search.rs:518` `let empty_emb = vec![0.0f32; 384];` (fallback)
- Also `ingest.rs:104` and `db.rs:629` use `vec![0.0f32; 384]`.
- Matches local ONNX model `all-MiniLM-L6-v2` (384-dim). Remote providers
  (OpenAI `text-embedding-3-small`, Gemini `text-embedding-004`) can be
  configured via settings (`search.rs:210-248`) and return different
  dimensions; code tolerates mismatch via `min(query_vector.len(),
  chunk_embedding.len())` in the dot product (`search.rs:631,662`).

### 4.5 Campaign-level conditioning (tone / world state / campaign bible)
- **There is no dedicated campaign-bible / tone-doc / world-state conditioning
  mechanism.** The system prompt is generic ("expert RPG Campaign Architect and
  Game Master assistant").
- Only campaign-adjacent inputs:
  - **Generic retrieval** of note/rule chunks via hybrid search (whatever is
    semantically/lexically similar to the prompt).
  - **The currently open note** (if any) injected verbatim.
  - **Session memory facts** (`session_memory` table, `db.rs:138-145`) —
    free-text `fact` + `category` rows, vault-scoped (DB re-initialized on vault
    switch, `db.rs:136`), inserted via `save_session_memory` (`lib.rs:1092`).
    Closest thing to persistent campaign context, but unstructured facts, not a
    curated bible/tone document; injected as a flat list (up to 20).

### 4.6 Conclusion
The current mechanism is **generic retrieval**, not campaign-bible
conditioning. There is **no code path** that loads a designated campaign bible,
tone document, or world-state file and injects it as a fixed conditioning block.
Conditioning is entirely driven by (a) query-similarity retrieval over all
indexed chunks, (b) the single open note, and (c) unstructured session-memory
facts. A campaign bible would only influence generation indirectly if its
content happened to be indexed as notes and retrieved by similarity — there is
no explicit, always-on campaign-context injection today.

---

## 5. Risk Summary

| Risk | Severity | Evidence |
|------|----------|----------|
| DESIGN.md / PRODUCT.md / FEATURE_PROPOSAL.md do not exist (referenced by tasking) | High | §2.1, §2.5 |
| No design/product north-star doc in repo | Medium | §2.5 |
| TASK.md / PIPELINE.md untracked | Medium | §2.4 |
| AGENTS.md test claims stale (tests DO exist) | Medium | §3.6 |
| Embedding dims hardcoded to 384; provider change needs full reindex, no compat check | Medium | §4.4, AGENTS.md |
| No era-hopping interaction in Timeline | Medium | §1.1 |
| No interactive graph layout (static circle) | Medium | §1.2 |
| No live mic dictation (STT file-upload only; local STT unimplemented) | Medium | §1.6 |
| No automatic post-session capture | Medium | §1.5 |
| MapBuilder hardcoded map path | Low | §1.3 |
| Plugin UI hardcoded per-plugin; narrow permission surface | Low | §1.7 |
| `ARCHITECTURE.md:71` hardcoded absolute path to different repo | Low | §2.5 |
