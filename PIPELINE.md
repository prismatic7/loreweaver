# PIPELINE: fate-of-cthulhu

## Team
- **Head of Dept:** Chris — decides, signs off
- **A1:** Hermes — plans, routes, reviews, holds state between phases
- **Console:** opencode — recon, build, validation
- **Devising:** agy — works with Chris to figure out what he wants
- **Stagehand:** zero — drudge work nobody else wants

## Phases
| # | Phase | Harness | Mode | Output | Gate | Status |
|---|-------|---------|------|--------|------|--------|
| 0 | Recon | opencode | autonomous | scaffolding report | report reviewed | ✅ |
| 1 | Devising | agy + Chris | interactive | design sketch + bones in tree | Chris signs off | ✅ |
| 2 | Build | opencode | autonomous | bones validated, weirdness fixed, hard bits done | diff vs sketch | ⏳ |
| 3 | Drudge | zero | autonomous | boilerplate, coverage, docs, obvious fills | diff reviewed | ⬜ |
| 4 | Review | Hermes + Chris | interactive | final diff vs whole arc | Chris approves merge | ⬜ |

## Current phase
**2 — Build** (opencode, autonomous)

## Handoff log
_Each harness writes its status here on exit: what changed, what's next, what's blocking._

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
- **Verification:** `npm run build` ✓, `npm run test` (27) ✓, `cargo test` (34) ✓.
  Committed as `9a5e8ff`. No regressions in timeline/graph/canvas/chat/session
  memory/STT/TTS/plugins.
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
