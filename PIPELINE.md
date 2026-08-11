# PIPELINE: fate-of-cthulhu

## Team
- **Head of Dept:** Chris — decides, signs off
- **A1:** Hermes — plans, routes, reviews, holds state between phases
- **Console:** opencode — recon, build, validation
- **Devising:** agy — works with Chris to figure out what he wants
- **Stagehand:** zero — drudge work nobody else wants

---

# ARC 2 — WORLD OBJECTS (2026-08-10)

Instrument for many worlds. North star: the World Object — a world folder
with a `world.json` manifest that IS its operating system. Signed-off
design: `DESIGN_SKETCH_WORLDS.md` (committed `e28607a`).

## Arc 2 phases
| # | Phase | Harness | Mode | Output | Gate | Status |
|---|-------|---------|------|--------|------|--------|
| 0 | Devising | Hermes + Chris | interactive | DESIGN_SKETCH_WORLDS.md | Chris signs off | ✅ |
| 1 | Build | opencode | autonomous | worlds.rs, registries, theme override, Liminal, bundles, World Shelf | diff vs sketch | ✅ |
| 2 | Drudge | zero | autonomous | boilerplate, coverage, docs | diff reviewed | ✅ |
| 3 | Review | Hermes + Chris | interactive | final diff vs whole arc | Chris approves merge | ✅ |

## Arc 2 handoff log
### Phase 2 — drudge (2026-08-11, Hermes — zero's run failed its contract)
- **Zero's run (2026-08-11 overnight) failed:** exit 0 but zero commits; left
  a corrupted `LiminalView.tsx` (Korean identifier, syntax errors, invented
  non-existent `get_liminal_notes` command) and truncated PIPELINE.md (234→8
  lines). Both cleaned up; drudge completed manually by Hermes (arc 1 precedent).
- **Liminal view UI** (`LiminalView.tsx`): full-screen dedicated view wired to
  the World Shelf's Liminal entry (replaces the arc-2 placeholder alert).
  Lists `_liminal/Captures/*.md`, per-note claim-into-world (select + Claim;
  default target = first world, fixed after test caught UI/backend mismatch),
  and birth-a-new-world. Opened via `liminalOpen` state in `App.tsx`; shadows
  all other views + right drawer while open. Committed `b8e082b`.
- **Backend gap filled:** added `list_liminal_notes` (read-only) — the drudge
  contract allowed additive commands; implemented as pure
  `list_liminal_notes_impl` helper + thin Tauri wrapper (unit-testable).
  Register + `tauri_plugin_dialog::init()` in builder. Commit `77e7371`.
- **Native file dialogs** via `tauri-plugin-dialog` (the ONLY permitted dep):
  export → native save (default `WorldName.zip`); import → native open filtered
  to `.zip`; `dialog:default` capability added; hidden file-input removed from
  WorldShelf; `onImportWorld` now takes no args. Commit `4f08542`.
- **Coverage:** `LiminalView.test.tsx` (5 tests: empty, claim, birth, back,
  error) + Rust `liminal_tests` (3: empty, parse+sorted, skip non-markdown).
- **Docs (commit `a663dc0`):** TESTING.md + AGENTS.md counts are REAL measured
  numbers — 14 Vitest suites / 52 tests, 57 Rust tests (56 pass;
  `test_api_key_round_trip` blocks indefinitely on a locked macOS Keychain —
  pre-existing flake; run with `--skip`). ARCHITECTURE.md: Liminal view UI,
  `list_liminal_notes`, native-dialog sections.
- **Verification:** `npm run test` 52/52 ✓ (from committed state, `NODE_ENV=test`
  set by script). `cargo test -- --skip test_api_key_round_trip` 56/56 ✓.
  `npm run build` ✓. Worktree clean except untracked `.opencode/` (by design).
- **ACL note (harvest for fleet):** custom app commands (worlds, liminal,
  bundles) are NOT in `desktop-schema.json` permissions and work because app
  commands are ACL-exempt; only plugin commands (dialog) need capability
  entries. Do not "fix" the schema into breaking this.
- **Next (phase 3 review):** Hermes + Chris review final diff vs whole arc.

### Phase 3 — review (2026-08-11, Hermes + Chris)
- **Verdict: PASS.** Gate verified all six signed-off decisions against code
  (theme scope, zero-touch migration, `_liminal` naming/exclusion, zip+scaffold
  bundles, file-first hot-reload registry, speculation in default taxonomy),
  bible gating, no out-of-scope leakage, permission surface untouched
  (`plugins.rs` not in diff; only `dialog:default` capability added), no debug
  leftovers. Measured at HEAD: Vitest 52/52, Cargo 56/56 (`--skip
  test_api_key_round_trip` keychain flake), build ✓.
- **Post-merge verification (main):** `npm install --include=dev` was needed —
  main's `node_modules` predated the new `plugin-dialog` dependency (stale-sync,
  not a merge defect; no tracked files changed). After install: Vitest 52/52 ✓,
  Cargo 56/56 ✓, tree clean.
- **Merge:** `8b6c474` (`--no-ff`, phase history preserved). Branch
  `task/world-objects` deleted; worktree removed per FLEET.md (disposable once
  merged). Arc 2 complete: 11 commits, 32 files, +3196/−336.

### Phase 1 — build (2026-08-10, opencode autonomous)
- **Delivered all 7 arc-2 deliverables, each mapped to a signed-off decision:**
  1. **`world.json` schema v1 + loader** (`worlds.rs`): load/validate with
     fallback chain (manifest → defaults); `ensure_manifest` auto-generates a
     default manifest on first launch (additive, never overwrites). Defaults:
     5 legacy note types + 4-entry provenance taxonomy (canon/history/
     invention/**speculation** — the Provisional ships for all worlds).
  2. **Note-type registry**: graph, canvas, metadata UI read the world's
     `note_types` (fallback to defaults → legacy 5 still render).
  3. **Provenance override**: `speculation` in the default taxonomy
     everywhere; per-world taxonomy respected in sources UI + graph filter.
  4. **Theme override**: world → global → defaults; accent + palette + serif
     toggle only (signed-off decision 1); 10% accent + restraint preserved.
  5. **The Liminal** (`campaigns/_liminal/`): captures land there
     (`capture_note target:liminal`); `claim_liminal_note` + 
     `make_world_from_liminal` birth action.
  6. **Zip bundles** (`bundles.rs`): export/import (zip-slip guarded) +
     folder scaffold (structure, no content) — round-trip verified.
  7. **World Shelf UI** (`WorldShelf.tsx`): switcher with identity, new
     world (scaffold choice), Liminal entry, export/import.
- **Bible gating**: `agent.rs` reads the manifest `bible` flag; skips
  conditioning when false, always-on when true/default.
- **Verification:** `cargo test` 54 ✓ (43 + 10 new), `npm run test` 47 ✓
  (32 + 15 new), `npm run build` ✓. Cargo 1.97.1 available and used.
- **Docs:** AGENTS.md precedence (DESIGN_SKETCH_WORLDS.md above
  DESIGN_SKETCH.md); ARCHITECTURE.md World Objects section.
- **Commits:** `8789626` (backend), `afc0215` (frontend), `0ac6dc3` (docs).
- **Known gaps (out of scope, future phases):** dedicated Liminal view is a
  placeholder alert (claim/route UI not built); export uses a text prompt for
  destination (no native file dialog); voice bank, versioned history, live
  STT, graph layout + Thread, era-hopping all remain future phases.
- **Next: phase 2 drudge** — boilerplate, coverage, docs, obvious fills.

### Phase 0 — devising (2026-08-10)
- Chris's priority order: **3 (ownership) → 4 (many worlds) → 2 (QoL) → 1
  (imaginative space)**. Domains 3+4 collapse into one system: the World
  Object.
- Six open questions signed off (all recommendations accepted):
  1. Theme: accent + palette + serif toggle (no full typography yet)
  2. Migration: auto-generate world.json on first launch
  3. Liminal: `_liminal` (system-folder signal)
  4. Bundles: zip for export/import, folder for scaffold
  5. Registry UI: file-first (edit world.json, hot-reload)
  6. `speculation` provenance: default for ALL worlds (the Provisional)
- Code grounding verified: `campaigns/<name>/` + per-world DB spine
  exists; note types hardcoded (5) + provenance hardcoded (3) + theme
  global — all become manifest-driven registries; bible conditioning
  already per-vault.
- Out of scope this arc: Muse-in-text, auto post-session capture, voice
  bank UI, versioned history, live STT, graph layout + Thread,
  era-hopping.
- **Next: phase 1 build** — worlds.rs manifest loader, note-type registry,
  provenance override, theme override, `_liminal`, zip bundles, World
  Shelf UI.

---

# ARC 1 — FATE OF CTHULHU CAMPAIGN FOUNDATION (2026-08-10)

## Phases
| # | Phase | Harness | Mode | Output | Gate | Status |
|---|-------|---------|------|--------|------|--------|
| 0 | Recon | opencode | autonomous | scaffolding report | report reviewed | ✅ |
| 1 | Devising | agy + Chris | interactive | design sketch + bones in tree | Chris signs off | ✅ |
| 2 | Build | opencode | autonomous | bones validated, weirdness fixed, hard bits done | diff vs sketch | ✅ |
| 3 | Drudge | zero | autonomous | boilerplate, coverage, docs, obvious fills | diff reviewed | ✅ |
| 4 | Review | Hermes + Chris | interactive | final diff vs whole arc | Chris approves merge | ✅ |

## Current phase
**4 — Review** (Hermes + Chris, interactive) → **VERDICT: PASS, with 1 catch (fixed)** — see log below

## Handoff log
_Each harness writes its status here on exit: what changed, what's next, what's blocking._

### Phase 4 — review (2026-08-10)
- **Verdict: PASS.** Final diff vs the whole arc (DESIGN_SKETCH → phase 2 →
  phase 3) checked, commit by commit: 7 commits, 30 files, +3454/−61.
- **Every phase 2 deliverable maps to a signed-off decision:**
  - Provenance model (sketch decision 1, "depth depth depth") → `sources`
    table + `SourceEntry`, frontmatter keys, source nodes in the entity
    graph, provenance filter (All/Canon/History/Invention).
  - Web clipping (decision 2, in-app fetch) → `webclip.rs`: ureq fetch,
    30s timeout, 5 redirects, browser UA, article/main/body extraction,
    html2md, `WebClip` provenance. URL validation is a pure helper.
  - Bible conditioning (sketch §Generation Conditioning) → `load_bible_context`
    in agent.rs: always-on injection from `<vault_path>/bible/`, all 8
    files, missing files skipped gracefully. NOT retrieved-by-similarity.
  - Capture inbox (sketch §Capture Design) → `capture_note` → `Captures/`,
    accepts text/paste/URL/file-drop, wired through useCaptureInbox +
    RightDrawer Scratchpad tab.
  - Docs foundation → DESIGN/PRODUCT/FEATURE_PROPOSAL/DESIGN_SKETCH/
    RECON/PIPELINE/TASK committed; AGENTS.md doc precedence
    (DESIGN_SKETCH > DESIGN > PRODUCT > docs/codebase); ARCHITECTURE.md
    phase 2 section added in phase 3.
- **Phase 3 additions verified:** EntityGraphView.test.tsx (5 tests),
  webclip.rs tests (9), `NODE_ENV=test` script fix, react 19.1.9 pin.
- **1 catch found and fixed in review:** AGENTS.md still said "8 Vitest
  suites + ~30 Rust tests" after phase 2 — stale. Now "10 Vitest suites /
  32 tests + 43 Rust tests". (TESTING.md has no hard counts — clean.)
- **Verification re-confirmed:** `npm run test` 32 ✓ (NODE_ENV=production
  set), `cargo test` 43 ✓, `npm run build` ✓.
- **Known gaps, deliberately out of scope (future phases):** live STT,
  era-hopping timeline, interactive graph layout (force/drag), auto
  post-session capture, PDF pipeline, comics capture, Muse sidebar tab.
  `bible/` is code-ready but EMPTY — THE_PLAN.md needs research + Muse
  generation (devising work, next campaign session).
- **Next: Chris approves the merge** (main ← project/fate-of-cthulhu).

### Phase 3 — drudge (2026-08-10)
- **zero's run (incomplete):** pinned react/react-dom to 19.1.9 in
  package.json but could not run npm (ambient NODE_ENV=production → npm
  omits dev deps → no vitest). Was about to refactor webclip.rs beyond the
  task's "no refactoring" boundary. No commits, no status written.
- **Hermes picked up the handoff and completed the phase:**
  - **Root cause of the frontend test failure (NOT the react version):**
    ambient `NODE_ENV=production` in the Hermes TUI environment. It (a)
    makes npm omit dev dependencies and (b) makes React load its
    PRODUCTION build, which has no `React.act` — the react-dom/test-utils
    shim calls `React.act` unconditionally, so every test crashed.
    Verified: `React.act` is a function in the dev build, undefined in
    the prod build, at both 19.1.9 and 19.2.7.
  - **Fix:** `"test": "NODE_ENV=test vitest run"` — immune to ambient
    env. Verified: 10 files / 32 tests pass with NODE_ENV=production set.
  - **The 19.1.9 pin was kept** (Chris's decision) but was NOT the fix.
    opencode's phase 2 "27 tests ✓" claim was TRUE in its environment —
    the review gate's "false claim" verdict is corrected in FLEET.md.
  - **New tests:** EntityGraphView.test.tsx (5: empty state, entity
    nodes, provenance filter, source nodes, orphan notes) + webclip.rs
    tests (9: validate_url http/https/reject/malformed/empty,
    extract_title, main content article/body fallback). webclip.rs got a
    minimal `validate_url` extraction (the smallest change that makes
    the non-network error paths testable — within the task's scope).
  - **Docs:** ARCHITECTURE.md gained a "Provenance, Bible Conditioning,
    and Capture (phase 2)" section; EntityGraphView added to the
    frontend structure list.
  - **Verification:** `npm run test` 32 ✓ (with NODE_ENV=production set),
    `cargo test` 43 ✓ (34 + 9 new), `npm run build` ✓.
- **Next (phase 4 review):** final diff vs the whole arc (DESIGN_SKETCH
  → phase 2 → phase 3), then Chris approves the merge. Note: `bible/`
  folder is still empty — THE_PLAN.md needs research + Muse generation
  (devising work, not drudge).

### Phase 2 — opencode build (2026-08-10)
- **Docs foundation:** Committed DESIGN.md, PRODUCT.md, FEATURE_PROPOSAL.md,
  DESIGN_SKETCH.md, RECON.md, PIPELINE.md, TASK.md (the untracked-docs problem
  from phase 0 is solved). AGENTS.md now has doc precedence (DESIGN_SKETCH >
  DESIGN > PRODUCT > docs/codebase/*) and corrected test claims (8 Vitest
  suites + ~30 Rust tests; `npm run test` / `cargo test` are real gates).
  Fixed ARCHITECTURE.md:71 hardcoded absolute path → relative link.
- **Provenance model (depth depth depth):** `sources` table + `SourceEntry`
  type; `list_sources`/`save_source`/`delete_source`/`get_source` commands.
  Provenance carried in note frontmatter (`source_type`, `source_title`,
  `source_author`, `source_url`, `source_date`, `source_id`) — no notes-table
  change, so watcher/ingest stay compatible. Frontend: provenance fields in the
  note editor Metadata panel; source nodes (square, distinct colour) + "source"
  edges in the entity graph; provenance filter (All/Canon/History/Invention).
- **Bible conditioning (always-on):** `build_system_context` now takes
  `vault_path` and injects `bible/{TONE,TOUCHSTONES,THE_PLAN,CONSPIRACY,PEOPLE,
  PLACES,RULES,SESSION_LOG}.md` as a fixed block — NOT retrieved-by-similarity.
  The Muse can't go off-tone even on a vague query.
- **Capture inbox (the shoggoth's mouth):** `capture_note` command writes to
  `Captures/<slug>-<ts>.md` via `validate_safe_path`. Capture Inbox UI in the
  Scratchpad tab accepts text/paste/URL/file-drop and lands captures as notes.
- **Web clipping (app pulls the page):** new `webclip.rs` (ureq fetch + scraper/
  html2md extraction); `clip_webpage` command; "Clip URL" toolbar button + inbox
  clip flow. Returns clean markdown with provenance (URL, site, fetch date).
- **Verification:** `cargo test` (34) ✓ verified by Hermes. `npm run test`
  (27) ✗ NOT reproducible — all 27 fail with `React.act is not a function`
  (react 19.2.7 vs @testing-library/react 16.3.2 act-compat). Same failure
  in main repo pre-phase-2 (23 tests), so not a phase 2 regression — a
  dependency drift that predates this build. **Phase 3 must fix dep
  alignment (pin react/react-dom to 19.1.x or upgrade testing-library)
  before any new frontend work.**
- Committed as `9a5e8ff`. No regressions in timeline/graph/canvas/chat/session
  memory/STT/TTS/plugins (Rust side verified).
- **Next (phase 3 drudge):** boilerplate, coverage, docs, obvious fills. Note:
  `bible/` folder convention is documented and code-ready but no bible files are
  committed yet — THE_PLAN.md still needs research + Muse generation first.

### Phase 1 — Hermes + Chris devising (2026-08-10)
- DESIGN_SKETCH.md written to worktree root and signed off by Chris.
- North star: the shoggoth — integration, not generation. Ideas land, grow,
  bloom. Test: "does this help the ideas land, grow, and connect?"
- Campaign bible structure: bible/ with TONE, TOUCHSTONES, THE_PLAN,
  CONSPIRACY, PEOPLE, PLACES, RULES, SESSION_LOG.
- Five capture surfaces: browser, books/comics, PDFs, scratchpad, vault.
- Resolved decisions: provenance depth depth depth (source nodes, custom
  taxonomies); web clipping = app pulls the page; PDFs = import → markdown;
  comics = images AND text; the Muse = sidebar tab in every view.
- THE_PLAN.md does not exist yet — research first (FoC mechanics, Yog-Sothoth
  canon, 2003 texture, touchstone distillation), then generated with the Muse.
- Next: phase 2 build — docs foundation, provenance model, bible
  conditioning, capture inbox, web clipping.

### Phase 0 — opencode recon (2026-08-10)
- RECON.md written to worktree root. All 7 campaign-loop features are real
  implementations; only true placeholder is local STT.
- **Docs finding (critical):** DESIGN.md / PRODUCT.md / FEATURE_PROPOSAL.md
  exist in the main repo but are UNTRACKED — therefore absent from the
  worktree, therefore invisible to agents. This mechanically explains why
  every agent has ignored them. Fix: commit them in phase 2.
- Tests exist (8 Vitest suites + ~29 Rust tests); AGENTS.md test claims are
  stale and need updating.
- No campaign-bible/tone conditioning in the Architect — generic retrieval only.
- Gaps vs campaign vision: no era-hopping (Timeline), static entity graph,
  STT file-upload only, manual session memory.
- Next: phase 1 devising — campaign bible structure + generation conditioning
  design, with Chris and agy.
