# Frontend Audit Fixes + Roadmap Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two things, in order. (1) Close out the frontend audit that VSCode/bb flagged tonight (2026-08-27) — but only the findings that survive reality-checking; the audit is ~80% stale. (2) Turn `docs/IMPLEMENTATION_PLAN.md` (written today, aspirational) into a deployable roadmap: mark what's already built, correct stale claims, and sequence the remaining phases into bounded increments that respect the local-first ethos.

**Architecture:** Tauri v2, React 19 + TypeScript strict, Rust backend, SQLite. Frontend audit findings live in `src/`; roadmap phases touch both `src/` and `src-tauri/src/`. The Muse/agent arc (DESIGN_SKETCH_CREATOR) is the next creative phase — the conductor was scoping it when interrupted; it is NOT part of this plan's fix scope, only sequenced.

**Tech Stack:** Rust (Tauri), React + TypeScript, SQLite, Markdown.

## Global Constraints

- **Vault is the source of truth.** No new data lives outside `vault/`. No new external DBs.
- **Backward compatibility:** new settings get defaults matching current behaviour; existing worlds load unchanged.
- All tests must pass: `npm run test` and `cargo test -- --skip test_api_key_round_trip` (keychain flake; full `cargo test` also passes locally — 86 tests).
- Do not modify existing command signatures unless a step says so (Tauri invoke contract).
- Build gotcha: Hermes sessions carry `NODE_ENV=production`, which omits devDeps (tsc/vite missing). Use `NODE_ENV=development npm install` before frontend builds; `NODE_ENV=test` for vitest.
- **Do not widen the plugin permission surface** (`plugins.rs` allow-list is `["hooks"]` only) without an explicit decision.
- Vault writes go through `validate_safe_path` — never bypass for new file-write commands.

---

## Phase 0 — Reality Check (done, recorded here for the record)

Measured at HEAD `e8530d2` on 2026-08-27:

| Gate | Result |
|------|--------|
| `npm run build` (tsc strict + vite) | ✅ PASS |
| `npm run test` (17 suites / 100 tests) | ✅ PASS |
| `cargo test` (86 tests, incl. keychain) | ✅ PASS |
| `cargo test -- --skip test_api_key_round_trip` | ✅ PASS (84) |

The bb conductor's `fix-frontend-audit` station (thread #36, interrupted ~23:11) produced a 17-item audit. Reality-checked against the code, **13 of 17 findings are stale** — the line numbers drifted and the claims don't match what's on disk:

| # | Audit claim | Reality |
|---|-------------|---------|
| 2 | `FolderCanvas.tsx:394` JSON.parse unguarded | ❌ Stale — try/catch already present at 388-397 |
| 3 | `FolderCanvas.tsx:238` empty deps | ❌ Stale — deps `[currentFolder, canvasRelPath, notes.length]` present |
| 4/12 | `RightDrawer.tsx:866` activeView effect, no cleanup | ❌ Stale — no such effect; line 866 is a props interface |
| 5 | `WorldShelf.tsx` empty-deps effect | ❌ Stale — WorldShelf has no `useEffect` at all |
| 6 | `LiminalView.tsx:54` router.push empty deps | ❌ Stale — deps `[refresh]` with `useCallback` |
| 8 | `RightDrawer.tsx:115` inline styles object | ❌ Stale — line 115 is a props interface |
| 9 | `MapBuilderView.tsx:213` mapOptions | ❌ Stale — no `mapOptions`; `useMemo` already used (566, 588) |
| 10 | `MarkdownEditor.tsx` inline options | ❌ Stale — `useMemo` already used (85, 94) |
| 11 | `App.tsx:362/377/382` empty deps | ❌ Stale — deps present (355-385) |
| 14 | MapBuilderView.test swallows "disk full" | ❌ Stale — test asserts `stringContaining("Failed to save map")` (line 172) |
| 15 | RightDrawer `<div onClick>` no role | ❌ Stale — all are `<button>` elements |
| 16 | data-od-id camelCase | ❌ Stale — all kebab-case |
| 1 | `vaultPath` implicit any | ⚠️ Partially real — typed via `useVault()` hook, but explicit annotation is cheap |
| 7 | `CampaignVaultView.tsx:140` effect deps | ⚠️ Partially real — deps `[currentNote]` present, but `currentNote` is an object → identity changes each render → potential refetch loop. Worth a look. |
| 17 | Import ordering | ⚠️ Cosmetic — real but LOW |
| — | Test noise: "Failed to parse canvas JSON" | ✅ Real — `console.error` fires in tests when the mocked `load_canvas_file` returns empty; fixture/mock issue, not a prod bug |
| — | Chunk size warning (index.js 1.1MB / 328KB gzip) | ✅ Real — worth `manualChunks` for react/vendor |
| — | No ESLint config | ✅ Real — `.vscode/` has only `extensions.json`; no `eslint.config.*` anywhere. This is likely what VSCode "flags" — no linting wired into the problems panel. |

**Verdict:** the audit's *shape* is right (stale closures, error handling, memoization, a11y, tooling) but its *evidence* is wrong. Phase 1 fixes only what's real.

---

## Phase 1 — Real Frontend Fixes (priority 1, small bounded)

### Task 1: Kill the test noise — FolderCanvas JSON.parse catch

The `console.error("Failed to parse canvas JSON:", e)` at `FolderCanvas.tsx:397` fires in tests because the mocked `load_canvas_file` returns empty/`"{}"`-adjacent payloads. The catch is correct prod behaviour; the noise is a test-fixture problem.

**Files:**
- Modify: `src/components/FolderCanvas.test.tsx`
- Modify: `src/components/FolderCanvas.tsx` (only if needed)

- [ ] **Step 1: Inspect the mock** — find where `load_canvas_file` is mocked in `FolderCanvas.test.tsx`; confirm what it returns for the "renders notes" case.
- [ ] **Step 2: Fix the fixture** — make the mock return a valid minimal canvas JSON (`{"nodes":[],"edges":[],"containers":[]}`) instead of empty/`"{}"` where the parse path is exercised.
- [ ] **Step 3: Verify** — `NODE_ENV=test npm run test` → 100 passed, zero "Failed to parse canvas JSON" lines in output.

### Task 2: CampaignVaultView `[currentNote]` dependency

`CampaignVaultView.tsx:144-149` — `useEffect` with deps `[currentNote]` refetches templates. If `currentNote` is a fresh object each render (derived, not memoised), this refetches on every render.

**Files:**
- Modify: `src/components/CampaignVaultView.tsx`

- [ ] **Step 1: Trace `currentNote`** — confirm whether it's a stable reference (from `useNotes` state) or a derived object. If derived, change the dep to a stable key (`currentNote?.path` or `currentNote?.id`).
- [ ] **Step 2: Verify** — `NODE_ENV=test npm run test` → 100 passed; `npm run build` clean.

### Task 3: Explicit `vaultPath` typing (cheap hygiene)

`App.tsx:379` — `if (!vaultPath) return;` where `vaultPath` is `string | undefined` from `useVault()`. The audit's suggested `== null` check is fine but the code is already strict-typed; this is a one-line clarity change at most.

- [ ] **Step 1: Confirm the type** — `useVault()` return type for `vaultPath`.
- [ ] **Step 2: Apply** — if it's already `string | undefined`, change `if (!vaultPath)` to `if (vaultPath == null)` at `App.tsx:379` (and any sibling sites flagged by `tsc`). If the hook already types it, mark N/A and move on.
- [ ] **Step 3: Verify** — `npm run build` clean.

### Task 4: Import ordering (cosmetic, LOW)

`App.tsx:5` — group React hooks together, then utilities. Match `docs/codebase/CONVENTIONS.md`.

- [ ] **Step 1: Reorder** `src/App.tsx` imports (React hooks → Tauri → local modules).
- [ ] **Step 2: Verify** — `npm run build` clean; no behavioural change.

### Task 5: Chunk size — vendor split

`index.js` is 1.1MB (328KB gzip). `vite.config.ts` already splits codemirror/lezer; add a react/vendor chunk.

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add manualChunks** — `react`/`react-dom`/`react-router` (if used) → `vendor-react`; `@tauri-apps/*` → `vendor-tauri`; keep existing codemirror/lezer rules.
- [ ] **Step 2: Verify** — `npm run build` → chunk warning gone or materially reduced; `npm run test` still 100 passed.

### Task 6: ESLint wiring (the actual VSCode gap)

No `eslint.config.*` exists. VSCode's problems panel has nothing to lint against — this is the most likely source of "VSCode says there are frontend problems".

**Files:**
- New: `eslint.config.js` (flat config, ESLint 9)
- Modify: `package.json` (devDeps + `lint` script)

- [ ] **Step 1: Add devDeps** — `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (match the React 19 + Vite stack).
- [ ] **Step 2: Flat config** — `tseslint.configs.recommended` + `reactHooks.configs.recommended` + `reactRefresh.configs.vite`; ignore `dist/`, `src-tauri/`, `node_modules/`.
- [ ] **Step 3: `lint` script** — `"lint": "eslint src --max-warnings 0"` (or start with warnings allowed and tighten in a follow-up).
- [ ] **Step 4: Run it** — fix what it actually finds (likely: a handful of `react-hooks/exhaustive-deps` and `no-unused-vars`). Do NOT chase the audit's stale findings.
- [ ] **Step 5: Verify** — `npm run lint` clean (or documented warning budget), `npm run build` clean, `npm run test` 100 passed.

**Phase 1 gate:** `npm run build` ✅, `npm run test` 100/100 ✅, `npm run lint` clean ✅, `cargo test` unaffected ✅.

---

## Phase 2 — Correct the Roadmap (docs, priority 2)

`docs/IMPLEMENTATION_PLAN.md` (untracked, written 2026-08-27 22:52) is aspirational and now partially wrong: it describes features that already exist. Correct it so future agents don't rebuild what's built.

### Task 7: Mark completed phases

- [ ] **Step 1: Phase 1 (Real Image Generation) → DONE.** Evidence: `src-tauri/src/providers/image.rs` (ComfyUI/OpenAI/Stability), `generate_image` command (`lib.rs:2011`), UI wiring (`useSessionTools.ts:116,152`, `useAgent.ts:506`), note→image flow (Creator's Instrument Task 4, committed `797a790`). The `/imagine` milestone is effectively met via the drawer + note-illustrate flow.
- [ ] **Step 2: Phase 0 partial** — feature-flag config and sandbox v2 are aspirational; the permission allow-list already exists (`plugins.rs:45-48`). Mark the sandbox item as "minimal form exists; v2 deferred".
- [ ] **Step 3: Phase 3 partial** — `hybrid_query` exists (`search.rs:540`); fuzzy/synonym layers are future. Mark accordingly.
- [ ] **Step 4: Phase 5 partial** — themes exist (Firm↔Wild cascade, `9e16deb`); collab/WS is future.
- [ ] **Step 5: Add a "Current Reality" section** at the top of the plan: measured test counts (17 suites / 100 Vitest, 86 Rust), the image-gen correction, and a pointer to this plan.

### Task 8: Fix stale claims in AGENTS.md

- [ ] **Step 1: Image generation** — AGENTS.md "Known Gaps" says image gen is a "timed placeholder, not a real backend call". That is false: `generate_image` is a real backend call with three providers. Correct the line.
- [ ] **Step 2: Test counts** — AGENTS.md says "14 Vitest suites / 52 tests + 57 Rust tests". Measured: 17 suites / 100 tests + 86 Rust tests. Update.
- [ ] **Step 3: Verify** — `docs/verify.mjs` passes (`npm run verify-docs`).

**Phase 2 gate:** docs reflect measured reality; `npm run verify-docs` ✅.

---

## Phase 3 — Roadmap Sequencing (priority 3, the deployable increments)

The remaining IMPLEMENTATION_PLAN phases, re-sequenced by dependency and value, each as a bounded increment. **Do not start these in this plan's execution** — they are the queue for the next arcs. The Muse/agent arc (DESIGN_SKETCH_CREATOR) is the creative priority and should be scoped as its own plan before any of these.

### Increment A — Plugin ecosystem (IMPLEMENTATION_PLAN Phase 2)
- Permission manifest: exists in minimal form (`plugins.rs` allow-list). Extend only with an explicit decision.
- Marketplace CLI (`bb marketplace install/list`), hook event bus (`event_bus.rs`): new modules.
- **Gate:** plugin can receive an image event and persist world state.

### Increment B — Search & knowledge (Phase 3)
- Synonym service (`vault/lexicon/synonyms.json`), fuzzy layer (`levenshtein`), UI expansion indicator.
- **Gate:** fuzzy query (`cgna`) returns expanded results.

### Increment C — Vault & organisation (Phase 4)
- Tag hierarchies (`#campaign/arc1/act3`), backlink preview tooltip, dynamic outliner.
- **Gate:** nested tags + hover preview work.

### Increment D — UI polish & collaboration (Phase 5)
- Keyboard-first navigation (`Ctrl+K`, `Ctrl+S`), live demo recorder, share-links helper.
- Canvas collaboration (WebSocket) is the largest item — split into its own increment if taken on.
- **Gate:** GM can launch a shared session link.

### Increment E — Automation & scripting (Phase 6)
- Scheduler (`schedule.yaml` + cron dispatch), expression engine (`exprtk`), world event hook.
- **Gate:** campaigns roll dice / generate nightly events without manual steps.

### Increment F — QA & CI (Phase 7)
- GitHub Actions CI (test + lint + coverage gates), performance overlay, coverage thresholds.
- **Gate:** every PR passes CI.

### Increment G — Docs & marketplace (Phase 8)
- [x] Plugin template generator, marketplace site, submission workflow.
- **Gate:** `bb plugin init mygame` produces a publishable skeleton.
  ✅ Landed `132a525`. Loreweaver-native `scaffold_plugin` command + `+ New
  Plugin` UI affordance produce a publishable skeleton (manifest.json +
  starter index.js with an `on_dice_roll` hook). Note: the gate referenced
  the bb ecosystem's `bb plugin init`; Loreweaver has its own plugin
  contract (Boa runtime, `hooks` permission), so the deliverable is the
  native generator. Marketplace site + submission workflow remain unscoped
  (deferred — needs a hosting decision).

### Sequencing rationale
- **A before B** (plugins can contribute search hooks), **B before C** (search feeds tag/backlink surfaces), **C/D** are UI-layer and can swap, **E** depends on the event bus from A, **F** should land before any of A-E grows the surface, **G** last (needs a stable plugin contract from A).
- **Recommended next arc:** the Muse (DESIGN_SKETCH_CREATOR) — it is the creative north star, the conductor was already scoping it, and it builds on the Firm↔Wild cascade that shipped. Scope it as its own plan before Increment A.

---

## Quality Checklist

Before completing this plan:
- [ ] `npm run build` passes (tsc strict + vite)
- [ ] `NODE_ENV=test npm run test` → 100 passed, no "Failed to parse canvas JSON" noise
- [ ] `npm run lint` clean (or documented warning budget)
- [ ] `cargo test` → 86 passed (or 84 with `--skip test_api_key_round_trip`)
- [ ] `npm run verify-docs` passes
- [ ] `docs/IMPLEMENTATION_PLAN.md` reflects measured reality
- [ ] No command signatures changed; no permission surface widened; no vault writes outside `validate_safe_path`

## Anti-patterns

- ❌ **Chasing the audit's stale line numbers.** The audit was written against a different tree state. Fix what's real (Phase 1 tasks), not what the audit claims.
- ❌ **Rebuilding image generation.** It exists. The AGENTS.md "placeholder" note is stale — correct the doc, don't rebuild the feature.
- ❌ **Starting Increments A-G in this plan.** This plan fixes and sequences; the increments are the queue for future arcs.
- ❌ **Widening plugin permissions** to make Increment A easier. That needs an explicit decision.

## Integration

This plan works well with:
- `docs/superpowers/plans/2026-08-23-creators-instrument-plan.md` (completed — the Muse arc builds on it)
- `docs/superpowers/plans/2026-08-23-world-scoped-memory-plan.md` (completed — memory extraction is live)
- `docs/superpowers/plans/2026-08-22-quality-improvements-plan.md` (completed — the Firm↔Wild cascade)
- `docs/IMPLEMENTATION_PLAN.md` (the roadmap this plan corrects and sequences)
