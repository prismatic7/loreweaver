# Increment B — Search & Knowledge: Synonym Service + Fuzzy Layer + Expansion Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Increment B from `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (Phase 3, lines 159-162): give `hybrid_query` (exists at `src-tauri/src/search.rs:540`) a **synonym service** (`vault/lexicon/synonyms.json`), a **fuzzy matching layer** (hand-rolled Levenshtein — no new crate), and surface a **UI expansion indicator** so the GM can see when a query was expanded. Today `hybrid_query` runs FTS5 + vector phases on the raw query string; there is no lexicon, no typo tolerance, and the frontend has no way to know a query was rewritten.

**Architecture:** Tauri v2 monorepo — React 19 + TypeScript frontend (`src/`), Rust backend (`src-tauri/`). Expansion is a pure function in `search.rs` (`expand_query`): tokenise the query, consult the read-only lexicon, fuzzy-match tokens against lexicon keys via Levenshtein, and produce an FTS term list. `hybrid_query` gains a `vault_path` param and returns `(Vec<SearchResult>, bool expanded)`; the `search_vault` command wraps that in a new specta type `SearchResponse { results, expanded }` so the frontend can show the indicator.

**Gate:** *A fuzzy query returns expanded results* — covered by a cargo test in `search.rs`: a temp vault with a lexicon + an in-memory DB with seeded notes; querying a typo/variant (`campain` → `campaign`, `cmbat` → `combat`) returns the seeded note and `expanded == true`.

## Global Constraints

- **Read-only lexicon at runtime.** `load_synonyms` reads `<vault>/lexicon/synonyms.json`; a missing/malformed file yields an empty dictionary (search degrades to today's behaviour). The only write is the **seed** in `create_vault` (new vaults get a small default lexicon; existing vaults are untouched and keep working).
- **No new crates.** Hand-rolled Wagner–Fischer Levenshtein (two-row DP) — the roadmap explicitly prefers this over adding `levenshtein`.
- **No new Tauri commands.** `search_vault`'s *return type* changes to `SearchResponse` (a new specta type, so `bindings.ts` regenerates on `cargo build`); no command is added or removed. `verify-docs` only demands API.md coverage for command names — update the `search_vault` description anyway.
- **Preserve existing non-expanded behaviour.** When `expand_query` adds nothing, `hybrid_query` runs FTS on the whole query as one phrase exactly as today. Only expanded queries fan out per term.
- **Fuzzy thresholds:** token length < 4 → exact only (0); 4–5 → distance ≤ 1; ≥ 6 → distance ≤ 2. Transpositions and dropped letters are the target; short tokens would flood with false positives.
- **The roadmap's literal `cgna` example is illustrative.** `cgna` is not within threshold of any real lexicon key; the gate test uses realistic typos (`campain`/`cmbat`) that exercise both the synonym-variant path and the fuzzy path. Documented in the plan and the test.
- Do not modify plugin permissions, command signatures (beyond the return-type change above), or vault-write paths. All gates green before commit.

---

## Task 1: Backend — expansion primitives (`src-tauri/src/search.rs`)

**Files:**
- Modify: `src-tauri/src/search.rs`

- [x] **Step 1: `levenshtein_distance(a, b) -> usize`** — hand-rolled Wagner–Fischer, two-row DP over `char` vectors. Public (tested directly).
- [x] **Step 2: `fuzzy_threshold(token_len) -> usize`** — 0 for < 4, 1 for 4–5, 2 for ≥ 6.
- [x] **Step 3: `load_synonyms(vault_path) -> HashMap<String, Vec<String>>`** — reads `<vault>/lexicon/synonyms.json` (`{ "canonical": ["variant", ...] }`); missing/malformed → empty map, never an error.
- [x] **Step 4: `expand_query(query_text, vault_path) -> (Vec<String>, bool)`** — per whitespace token: (1) exact lexicon key → key + variants; (2) exact variant → canonical key; (3) fuzzy key match within threshold → canonical key; (4) else keep token. `expanded` = any term added beyond the original tokens.

## Task 2: Backend — wire expansion into `hybrid_query` + command

**Files:**
- Modify: `src-tauri/src/search.rs`
- Modify: `src-tauri/src/export_types.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/agent.rs`

- [x] **Step 1: `hybrid_query(conn, query_text, category, vault_path) -> Result<(Vec<SearchResult>, bool), String>`** — Phase 0 expansion; FTS phase iterates `fts_terms` (whole query as one phrase when not expanded, per-term when expanded), merging by key keeping best score; vector phase unchanged on the original query; returns `(results, expanded)`.
- [x] **Step 2: `SearchResponse { results: Vec<SearchResult>, expanded: bool }`** in `export_types.rs` (`#[derive(Serialize, Deserialize, Clone, Debug, Type)]`).
- [x] **Step 3: `search_vault`** returns `Result<SearchResponse, String>`; locks `state.vault_path`, calls `hybrid_query(..., &vault_path)`, wraps in `SearchResponse`.
- [x] **Step 4: `export_bindings_to`** — add `.typ::<SearchResponse>()`.
- [x] **Step 5: agent.rs call sites** — `build_system_context` and `execute_tool` destructure `(results, _expanded)`; both already hold `vault_path`.
- [x] **Step 6: Seed lexicon in `create_vault`** — create `lexicon/` + write `synonyms.json` (additive, never overwrites) with a small TTRPG dictionary (`gm`, `hp`, `spell`, `combat`, `rest`).
- [x] **Step 7: `cargo build`** — regenerates `bindings.ts`; verify `SearchResponse` appears (grep).

**Checks before moving on:**
- [x] `cargo build` clean — cargo is the source of truth
- [x] `src/bindings.ts` contains `SearchResponse`
- [x] All three `hybrid_query` call sites updated (lib.rs, agent.rs ×2)

## Task 3: Backend — tests (`src-tauri/src/search.rs`)

- [x] **Step 1: `test_levenshtein_distance`** — equal, insert, delete, substitute, transposition (`cgna`/`cgan` = 2), `kitten`/`sitting` = 3, empty cases.
- [x] **Step 2: `test_expand_query_synonyms_and_fuzzy`** — temp vault + lexicon; variant → canonical (expanded), key → key+variants (expanded), fuzzy (`cmbat` → `combat`, expanded), unknown token unchanged (not expanded).
- [x] **Step 3: GATE test `test_hybrid_query_fuzzy_expansion_gate`** — temp vault + lexicon (`campaign` → `campain`, `combat` → `cmbat`), in-memory DB with two seeded notes; `hybrid_query("campain", ...)` → note found + expanded; `hybrid_query("cmbat", ...)` → note found + expanded; `hybrid_query("campaign", ...)` → note found (exact still works). Call `set_db_path` to a temp path so `generate_embedding`'s provider lookup doesn't touch the repo cwd.

## Task 4: Frontend — expansion indicator

**Files:**
- New: `src/components/SearchExpansionBadge.tsx` + `src/components/SearchExpansionBadge.test.tsx`
- Modify: `src/hooks/useSearch.ts` + new `src/hooks/useSearch.test.ts`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/App.tsx`
- Modify: `src/types.ts`

- [x] **Step 1: `SearchExpansionBadge`** — `{ expanded: boolean }`; renders `null` when false, a small `expanded` badge with a title tooltip when true. Test: renders nothing when false; renders badge when true.
- [x] **Step 2: `useSearch`** — `invoke<SearchResponse>("search_vault", ...)`; `setSearchResults(res?.results || [])`; new `searchExpanded` state (`res?.expanded ?? false`), reset on empty query; return it. Test: mock invoke, type a query, assert results + `searchExpanded`; empty query resets.
- [x] **Step 3: `AppShell`** — new `searchExpanded: boolean` prop; render `<SearchExpansionBadge expanded={searchExpanded} />` in the search-results header.
- [x] **Step 4: `App.tsx`** — destructure `searchExpanded` from `useSearch`, pass to `AppShell`.
- [x] **Step 5: `types.ts`** — re-export `SearchResponse` from bindings.

## Task 5: Docs

**Files:**
- Modify: `docs/developer/API.md` (`search_vault` return type)
- Modify: `docs/codebase/ARCHITECTURE.md` (search layer: lexicon + fuzzy expansion)
- Modify: `docs/codebase/INTEGRATIONS.md` (search section: lexicon file, expansion)
- Modify: `docs/IMPLEMENTATION_PLAN.md` (Phase 3 fuzzy/synonym items → done)

- [x] **Step 1: API.md** — `search_vault` returns `SearchResponse { results, expanded }`.
- [x] **Step 2: ARCHITECTURE.md** — search.rs bullet: synonym/fuzzy expansion, lexicon path.
- [x] **Step 3: INTEGRATIONS.md** — search section: `vault/lexicon/synonyms.json`, read-only, expansion indicator.
- [x] **Step 4: IMPLEMENTATION_PLAN.md** — mark Synonym Service + Fuzzy Matching Layer + UI Enhancements as done (with evidence links).
- [x] **Step 5: Verify** — `npm run verify-docs` passes.

## Task 6: Full gate set + commit

- [x] **Step 1: Rust gates** — from `src-tauri/`: `cargo test --locked -- --skip test_api_key_round_trip` (86 existing + new; keychain test hangs headless — use `--skip`).
- [x] **Step 2: Frontend gates** — from repo root: `npm run lint`, `npm run build`, `NODE_ENV=test npm run test` (100 + new tests), `npm run coverage` (thresholds 46/45/38/38 — new tests must keep it green), `npm run verify-docs`.
- [x] **Step 3: Commit** — plan doc + code + docs on main, descriptive message, no push. Mark checkboxes `- [ ]` → `- [x]`.

## Deferred (future work)

- **Fuzzy against the corpus** — expansion currently matches lexicon keys only; scanning note/rule titles or FTS content for near-misses is a later increment (cost/benefit unclear for large vaults).
- **Per-result match highlighting** — the indicator says *a* query was expanded; showing *which* term matched what is future work.
- **`search_result` event on the plugin event bus** — IMPLEMENTATION_PLAN Phase 3 lists it; the bus exists (Increment A) but wiring search events is out of scope here.

## Phase gate

- [x] `levenshtein_distance` + `expand_query` + `load_synonyms` exist in `search.rs`
- [x] `hybrid_query` takes `vault_path` and returns `(results, expanded)`
- [x] `search_vault` returns `SearchResponse { results, expanded }`; bindings regenerated
- [x] Gate test green: fuzzy/variant query returns expanded results (`campain` → `campaign`, `cmbat` → `combat`)
- [x] `create_vault` seeds `lexicon/synonyms.json` (additive)
- [x] Frontend shows the expansion indicator; new components have vitest tests
- [x] No new crates; no new Tauri commands; no vault note writes; no permission changes

## Quality Checklist

- [x] `npm run lint` clean
- [x] `npm run build` clean
- [x] `NODE_ENV=test npm run test` → 100 + new passed
- [x] `npm run coverage` → thresholds 46/45/38/38 hold
- [x] `cargo test --locked -- --skip test_api_key_round_trip` from `src-tauri/` → 86 + new passed
- [x] `npm run verify-docs` passes
- [x] No permission surface widened; no new commands; no vault note writes

## Anti-patterns

- ❌ **Adding the `levenshtein` crate** — hand-rolled DP is ~20 lines and fully tested.
- ❌ **Writing the lexicon at runtime** — read-only; only `create_vault` seeds it.
- ❌ **Changing non-expanded query behaviour** — plain queries stay one FTS phrase.
- ❌ **Fuzzy-matching short tokens** (< 4 chars) — false-positive flood.
- ❌ **New Tauri commands** for the indicator — the return-type change carries it.

## Integration

- `loreweaver-dev-workflow` (the file-to-file recipe; this increment touches backend types + command + frontend state + UI)
- `loreweaver-phase-review-gate` — run the gate on the completed increment
- `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (parent plan; Increment B is the second sequenced move)
- `docs/IMPLEMENTATION_PLAN.md` (Phase 3 — this increment lands the fuzzy/synonym items)
- `docs/codebase/INTEGRATIONS.md` (search/embeddings section — lexicon + expansion)
