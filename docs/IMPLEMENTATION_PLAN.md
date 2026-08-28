# Loreweaver Implementation Plan

**Purpose**: Translate the staged roadmap ( ideas & wishlist ) into concrete, actionable steps that respect the app’s **local‑first** ethos, **user‑forward** design, and visual aesthetics.

---

## 0. Current Reality (measured 2026-08-27)

> **Read this first.** This plan is aspirational; several phases are already built. Measured at HEAD `e8530d2`:

| Gate | Result |
|------|--------|
| `npm run build` (tsc strict + vite) | ✅ PASS |
| `npm run test` | ✅ 17 suites / 100 tests |
| `npm run lint` (ESLint, wired 2026-08-27) | ✅ PASS |
| `cargo test` | ✅ 86 tests |

**Already built (do not rebuild):**
- **Phase 1 (Real Image Generation) — DONE.** `src-tauri/src/providers/image.rs` (ComfyUI / OpenAI / Stability), `generate_image` command (`lib.rs:2011`), UI wiring (`useSessionTools.ts:116,152`, `useAgent.ts:506`), note→image flow (Creator's Instrument Task 4, `797a790`). The `/imagine` milestone is met via the right-drawer prompt + note-illustrate flow.
- **Phase 0 partial — Sandbox v2 minimal form exists.** The plugin permission allow-list is live (`plugins.rs:45-48`, currently `["hooks"]` only). Feature-flag config and quota limits are future.
- **Phase 3 partial — Search.** `hybrid_query` exists (`search.rs:540`); synonym + fuzzy layers shipped in Increment B (`2026-08-28-increment-b-search-fuzzy-synonyms.md`); `search_result` event on the bus is future.
- **Phase 5 partial — Themes.** Firm↔Wild cascade shipped (`9e16deb`): global default → per-world override → per-session toggle. Canvas collaboration / WebSocket is future.

**Sequencing:** the remaining phases are queued as bounded increments in `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (Phase 3). The Muse/agent arc (DESIGN_SKETCH_CREATOR) is the recommended next creative arc.

---

## 1. Guiding Principles  

| Principle | How It Shapes Development |
|-----------|---------------------------|
| **Local‑First Persistence** | All new data (images, schedules, themes, plugin archives) must be stored under the `vault/` directory. No external DB unless explicitly opt‑in via a feature flag. |
| **User‑Forward Simplicity** | Every UI addition must pass a *usability checklist*: <br>1️⃣ One‑click activation <br>2️⃣ Clear affordance (visual cue) <br>3️⃣ No hidden state changes. |
| **Tactile & Minimalist UI** | Maintain the existing tactile canvas feel; any new component should use the same stroke weight, iconography, and animate feedback (fade‑in/out). |
| **Privacy‑Safe Extensibility** | New sandbox permissions are gated behind feature flags; default off until an explicit user action enables them. |
| **Progressive Disclosure** | Advanced features (e.g., expression language) are hidden behind toggles or expert settings, preserving a clean default experience. |

---

## 2. Phase‑by‑Phase Implementation Steps  

### Phase 0 – Foundations (1‑2 weeks) — ⚠️ PARTIAL (see §0)

| Item | File(s) | Action |
|------|---------|--------|
| Feature‑Flag Config | `config/feature_flags.toml` | ⏭️ Future — flags for `image_gen`, `sandbox_v2`, `fuzzy_search` |
| Sandbox v2 API | `src-tauri/src/plugins.rs`, `sandbox_config.json` | ⚠️ Minimal form exists — permission allow-list (`["hooks"]`); quota limits future |
| Backend CLI Commands | `src-tauri/src/commands.rs` | ⚠️ `generate_image` ✅; `run_plugin_script`, `schedule_add` future |
| Test Scaffold | `tests/integration.*` | ✅ 17 Vitest suites / 100 tests + 86 Rust tests |

**Milestone**: Compile with **green** status; all validators (`npm run test`, `cargo test`) pass.

---

### Phase 1 – Real Image Generation (2‑3 weeks) — ✅ DONE (see §0)

| Component | Files | Implementation |
|-----------|-------|----------------|
| Provider Wrapper | `src-tauri/src/providers/image.rs` | ✅ ComfyUI / OpenAI / Stability providers |
| Async Job Queue | `src-tauri/src/queue.rs` | ⏭️ Not needed — `generate_image` runs in `spawn_blocking` |
| REST IPC Command | `src-tauri/src/lib.rs:2011` → `generate_image` | ✅ Returns `Result<String, String>` (data URL) |
| Front‑End Component | `src/components/` (drawer + note-illustrate) | ✅ `useSessionTools.ts:116,152`, `useAgent.ts:506` |
| UI Command Hook | `src/invoke.ts` | ✅ via `@tauri-apps/api/core.invoke` |
| Documentation | `docs/USER_GUIDE_IMAGE.md` | ⏭️ Not written — drawer flow is self-evident |

**Milestone**: Typing `/imagine <prompt>` renders a generated illustration on the canvas instantly. — **Met** via right-drawer prompt + note-illustrate flow.

---

### Phase 2 – Plugin Ecosystem Expansion (3‑4 weeks)  
| Item | Files | Tasks |
|------|-------|-------|
| Permission Manifest | `plugin_permissions.toml` (generated at runtime) | List allowed APIs per plugin (`image_gen`, `expression`). |
| Permission Grant Hook | `src-tauri/src/plugins.rs` | Load manifest; auto‑whitelist flags matching declared permissions. |
| Plugin Marketplace CLI | `bb marketplace install`, `bb marketplace list` | Use `std::process::Command` to unzip releases; validate manifest. |
| Review CLI (`bb plugin validate`) | `src-tauri/src/cli.rs` | Parse manifest, compare against allowed list, output result. |
| Hook Event Bus | `src-tauri/src/event_bus.rs` | `emit(event, payload)` and listeners (`on_image_generated`). |

**Milestone**: Community can publish a plugin that receives an image, adds it to a campaign page, and persists world state.

---

### Phase 3 – Search & Knowledge Retrieval (2‑3 weeks) — ⚠️ PARTIAL (see §0)

| Piece | Files | Implementation |
|-------|-------|----------------|
| Multi‑Vector Index Router | `src-tauri/src/search.rs` | ✅ `hybrid_query` exists (`search.rs:540`); provider-agnostic struct |
| Synonym Service | `vault/lexicon/synonyms.json` + `src-tauri/src/search.rs` | ✅ Increment B (`2026-08-28-increment-b-search-fuzzy-synonyms.md`) — `load_synonyms` reads `<vault>/lexicon/synonyms.json` read-only; `create_vault` seeds a default lexicon; `expand_query` expands tokens before FTS |
| Fuzzy Matching Layer | `levenshtein` crate integration in `search.rs` | ✅ Increment B — hand-rolled Wagner–Fischer `levenshtein_distance` (no new crate); `fuzzy_threshold` 0/1/2 by token length |
| UI Enhancements | `src/components/SearchBar.tsx`, `src/components/ResultCard.tsx` | ✅ Increment B — `SearchExpansionBadge` in the search results header; `search_vault` returns `SearchResponse { results, expanded }`; tooltip for backlink preview is Increment C |
| Backend Hook for Results | `event_bus.rs` emit `search_result` event | ⏭️ Future |

**Milestone**: Users can type fuzzy queries (`cgna`) and receive expanded, synonym‑enhanced results. (The literal `cgna` example is illustrative — the gate test uses realistic typos `campain` → `campaign` and `cmbat` → `combat`.)

---

### Phase 4 – Vault & Organization Enhancements (2 weeks)
| Feature | Files | Steps |
|---------|-------|-------|
| Tag Hierarchies | `src/utils/tags.ts`, `src/components/TagTree.tsx` | ✅ Increment C (`2026-08-28-increment-c-tags-outliner-backlinks.md`) — READ-ONLY parsing of `frontmatter.tags` (`#campaign/arc1/act3` → nested tree); Tags tab in the right drawer. The roadmap's `vault/tags.json` store is deferred (vault writes are red-lined overnight). |
| Backlink Preview | `src/components/NotePreviewTooltip.tsx` (Backlinks tab) | ✅ Increment C — hover preview (title + snippet) on backlink rows. In-body `[[link]]` hover remains future work (needs shared-markdown-renderer plumbing). |
| Dynamic Outliner | `src/utils/outline.ts`, `src/components/NoteOutline.tsx` | ✅ Increment C — client-side heading parse (fences ignored) → collapsible tree beside read-mode note view. The roadmap's `get_outline` command is deferred (no new IPC needed). |
| UI Tree Component | `src/components/TagTree.tsx` | ✅ Increment C — collapsible tag tree in the right drawer Tags tab. |

**Milestone**: Campaign files can be organized with nested tags; hovering a backlink shows a concise preview.

---

### Phase 5 – UI / UX Polish & Collaboration (3‑4 weeks) — ⚠️ PARTIAL (see §0)

| Area | Files | Tasks |
|------|-------|-------|
| Custom CSS Themes | `vault/themes/*.css`, `src/theme/theme.ts` | ✅ Firm↔Wild cascade shipped (`9e16deb`): global default → per-world override → per-session toggle |
| Canvas Collaboration | `src/collab/ws_handler.rs`, `src/components/CanvasCollab.tsx` | ⏭️ Future — WebSocket for `canvas_op` messages; shared state sync |
| Keyboard‑First Navigation | `src/shortcuts.ts` | ⏭️ Future — Map `Ctrl+K` (quick‑search), `Ctrl+S` (save), etc. |
| Live Demo Recorder | `src/demo/recorder.ts` | ⏭️ Future — Stream actions to JSON log; `bb demo start|stop` |
| Share Links Helper | `bb share-server-links` | ⏭️ Future — Auto‑expose local server URL via QR or clipboard |

**Milestone**: A GM can launch a shared session link; collaborators see live canvas edits and can use keyboard shortcuts.

---

### Phase 6 – Automation & Scripting (2 weeks)  
| Feature | Files | Implementation |
|---------|-------|----------------|
| Scheduled Scheduler | `src/scheduler.rs`, `schedule.yaml` | Parse cron entries; dispatch via `tauri::command`. |
| Expression Language Engine | `exprtk` crate integration, `expr_eval.rs` | Provide `bb eval <expr>` command; expose to sandboxed plugins. |
| World Event Hook | `src/event_bus.rs` | Hook `on_world_update` that triggers scheduled scripts nightly. |

**Milestone**: Campaigns automatically roll dice, generate nightly events, and store results without manual steps.

---

### Phase 7 – Testing, QA, Performance Dashboard (1‑2 weeks)  
| Item | Files | Action |
|------|-------|--------|
| CI Pipeline (GitHub Actions) | `.github/workflows/ci.yml` | Run `npm run test`, `cargo test`, lint, and coverage gates. |
| Performance Overlay | `src/debug/overlay.rs` | Show RAM/CPU/bundle size; persist to `vault/metrics.json`. |
| Lint Enforcement Scripts | `package.json` scripts (`lint`, `fmt`) | Fail PRs on warnings. |
| Coverage Thresholds | `.codecov.yml` | Enforce minimum 80 % coverage on new code. |

**Milestone**: Every PR passes CI before merge; no performance regressions beyond defined thresholds.

---

### Phase 8 – Documentation, Community, Marketplace (1 week)  
| Asset | Files | Tasks |
|-------|-------|-------|
| Plugin Template Generator | `scripts/create_plugin.sh`, `templates/plugin/` | Scaffold `manifest.json`, CI workflow, sample command. |
| Community Marketplace Site | `docs/marketplace/index.html` served by dev server | List plugins; one‑click install URLs. |
| Live Demo Guide | `docs/USER_GUIDE_LIVE_DEMO.md` | Explain recording, sharing, embedding. |
| Submission Workflow | `bb submit-a-plugin` command | Validate, tag, push to marketplace repo. |

**Milestone**: New contributors can run `bb plugin init mygame` and obtain a ready‑to‑publish plugin skeleton.

---

## 3. Visual Design Alignment  

- **Tactile Feedback**: All interactive elements (canvas draws, image fade‑ins, shortcut hints) use the existing `strokeWidth: 2`, `opacity: 0.9`, and soft‑easing animations defined in `src/theme/tactile.css`.  
- **Consistent Iconography**: New UI icons (e.g., image‑gen, theme picker) are sourced from the same SVG set used by existing toolbar buttons.  
- **Color Palette**: Extend the current palette with two accent colors (`#6c5ce7` for premium features, `#a8edea` for experimental toggles) defined in `src/theme/colors.ts`.  
- **Accessibility**: Ensure contrast ratios meet WCAG AA for all new text and UI elements; add `aria-label`s where needed.  
- **Progressive Disclosure**: Advanced settings (e.g., sandbox quotas) are hidden behind a “Developer” toggle to keep the default interface clean for everyday users.

---

## 4. How to Persist This Plan  

The plan itself lives in `docs/IMPLEMENTATION_PLAN.md`.  
Future contributors should refer to this file when scoping new work, and update it only when a phase completes or pivots.

---

*Prepared for the Loreweaver development team – a living blueprint that respects the app’s local‑first foundation while evolving toward the envisioned rich, collaborative storytelling experience.*