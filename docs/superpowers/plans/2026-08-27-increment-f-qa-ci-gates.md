# Increment F — QA & CI Gates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the QA & CI increment from `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (Increment F). Today the repo has **no CI at all** — no `.github/workflows/` — and the only quality gates are local commands (`npm run build`, `npm run test`, `npm run lint`, `npm run verify-docs`, `cargo test`). This increment makes every PR pass CI: GitHub Actions running the full frontend + Rust test suites, lint, type-check, docs verification, and coverage thresholds. The plan's sequencing rationale puts F first: *"F should land before any of A–E grows the surface."*

**Architecture:** Tauri v2 monorepo — React 19 + TypeScript frontend (`src/`), Rust backend (`src-tauri/`). CI runs two jobs: frontend (Node) and backend (Rust). Coverage via Vitest v8 provider with thresholds set to the *measured baseline* (not aspirational numbers that fail on day one). Remote is `git@github.com:prismatic7/loreweaver.git` (prismatic7 personal account — code tooling publishes there, not techne-tools).

**Tech Stack:** GitHub Actions, Node 22 LTS, Rust stable, Vitest v4 + `@vitest/coverage-v8`, ESLint 9 flat config.

## Global Constraints

- **CI must pass on day one.** Thresholds and gates are set to *measured* reality, then tightened in follow-ups. A red CI on the first push is a failed increment.
- **No new test-writing spree.** This increment wires gates and measures coverage; it does not chase coverage percentage with new tests. Coverage thresholds start at the measured baseline (or slightly below to absorb flake), documented as such.
- **Do not modify command signatures, plugin permissions, or vault-write paths.** CI only *runs* existing commands.
- **Keychain test:** `test_api_key_round_trip` (`lib.rs:3314`) self-skips when the OS keyring is unavailable (`keyring_is_available()` check) — headless CI is exactly that case, so plain `cargo test` should pass. If it doesn't, fall back to `cargo test -- --skip test_api_key_round_trip` in the workflow and note why.
- **Node version:** local is v26.7.0; Vite 7 needs ≥20.19/≥22.12. Pin CI to **Node 22 LTS** (safe, widely cached). Do NOT add an `.nvmrc` unless a task says so — that's a separate decision.
- **Cargo.lock is committed** (`git ls-files src-tauri/Cargo.lock` confirms) — CI can use `--locked` for reproducible builds.
- Build gotcha (repo-wide): Hermes sessions carry `NODE_ENV=production`; CI runners don't, so `npm ci` + `npm run build` behave normally there. Keep `NODE_ENV=test` in the test script (already in `package.json`).

---

## Task 1: Frontend CI job

**Files:**
- New: `.github/workflows/ci.yml`

- [ ] **Step 1: Workflow skeleton** — `name: CI`, `on: [push, pull_request]`, two jobs (`frontend`, `backend`). `concurrency` group on `${{ github.ref }}` with `cancel-in-progress: true` so pushes supersede stale runs.
- [ ] **Step 2: Frontend job** — `ubuntu-latest`, `actions/checkout@v4`, `actions/setup-node@v4` with `node-version: 22`, `cache: npm`. Then:
  - `npm ci` (uses `package-lock.json` — committed)
  - `npm run lint` (ESLint, `--max-warnings 0`)
  - `npm run build` (tsc strict + vite — the de-facto type-check gate)
  - `npm run test` (17 suites / 100 tests)
  - `npm run verify-docs` (docs/verify.mjs — catches undocumented Tauri commands and dead links)
- [ ] **Step 3: Verify locally** — every command in the job passes on the current tree (they do today; re-run to confirm before pushing). Note: `npm run build` and `npm run test` both run in CI with no `NODE_ENV` pollution.

## Task 2: Backend CI job

- [ ] **Step 1: Rust job** — `ubuntu-latest`, `actions/checkout@v4`, `dtolnay/rust-toolchain@stable`, `Swatinem/rust-cache@v2` (keyed on `src-tauri/Cargo.lock`). Then from `src-tauri/`:
  - `cargo test --locked` (86 tests; keychain test self-skips headless)
  - If the keychain test does NOT self-skip cleanly on the runner, switch to `cargo test --locked -- --skip test_api_key_round_trip` and add a comment explaining the flake (see `docs/codebase/TESTING.md`).
- [ ] **Step 2: Verify** — `cargo test` passes locally from a clean checkout state (it does: 86/86 measured 2026-08-27). Confirm `--locked` doesn't fight the lockfile.

## Task 3: Coverage tooling + baseline

**Files:**
- Modify: `package.json` (devDep + script)
- Modify: `vite.config.ts` (test block)

- [ ] **Step 1: Add provider** — `npm i -D @vitest/coverage-v8` (matches Vitest 4).
- [ ] **Step 2: Measure baseline** — run `NODE_ENV=test npx vitest run --coverage` and record the **actual** line/function/branch/statement percentages for `src/`. This is the number the threshold starts at.
- [ ] **Step 3: Wire thresholds** — in `vite.config.ts` `test` block: `coverage: { provider: 'v8', reporter: ['text', 'json-summary'], thresholds: { lines: <baseline>, functions: <baseline>, branches: <baseline>, statements: <baseline> } }`. Set each to the measured baseline **minus a small buffer (≤2 points)** so day-one CI is green; add a comment: *"Baseline measured 2026-08-27; tighten in follow-ups."*
- [ ] **Step 4: Script** — add `"coverage": "NODE_ENV=test vitest run --coverage"` to `package.json`.
- [ ] **Step 5: Wire into CI** — add `npm run coverage` to the frontend job (after `npm run test`). Coverage gate now blocks PRs that drop below baseline.
- [ ] **Step 6: Verify** — `npm run coverage` passes locally; thresholds actually trip when a test file is removed (spot-check by temporarily deleting one test, confirming failure, restoring).

## Task 4: TESTING.md alignment + CI documentation

**Files:**
- Modify: `docs/codebase/TESTING.md`

- [ ] **Step 1: Correct stale counts** — TESTING.md says "14 Vitest suites / 52 tests" and "57 Rust tests". Measured reality (2026-08-27): **17 suites / 100 tests** + **86 Rust tests**. Update both, matching the AGENTS.md correction already committed (`4c7bac6`).
- [ ] **Step 2: Document CI** — add a "Continuous Integration" subsection: workflow path, what each job runs, the coverage-threshold policy (baseline + tighten), and the keychain-test self-skip note.
- [ ] **Step 3: Verify** — `npm run verify-docs` passes.

## Task 5 (stretch, optional): Performance overlay

The plan doc lists "performance overlay" under Increment F. It is a dev-tool UI feature, not a gate. **Do not start it unless Tasks 1–4 are green and Chris asks for it.** If taken on, scope it separately — it does not belong in the CI gate increment.

---

## Phase gate

- [x] `.github/workflows/ci.yml` exists with frontend + backend jobs
- [x] Every command in the workflow passes on the current tree (verified locally before push)
- [x] `npm run coverage` passes with thresholds at measured baseline
- [x] TESTING.md reflects measured reality (17/100 + 86) and documents CI
- [x] `npm run verify-docs` passes
- [x] No command signatures changed; no permission surface widened; no vault writes added

### CI red-light fixes (2026-08-28, D4)

Two pre-existing CI failures were found and fixed while verifying F's gate:

1. **verify-docs portability** — `docs/codebase/ARCHITECTURE.md` and `STACK.md`
   linked to absolute local paths (`/Users/chris/Development/loreweaver/...`),
   which don't exist on the CI runner. Rewrote the hrefs to repo-relative
   paths (display text was already relative). Passes locally and on CI.
2. **Backend missing GTK deps** — the `cargo test` job never installed Tauri's
   Linux system libraries (`gobject-2.0` / webkit), so the build failed with
   `gobject-sys` not found. Added an "Install Tauri Linux system deps" step
   (`libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
   libgtk-3-dev`) to the backend job.

These were infrastructure gaps, not caused by the D2/D3/D1 increments. The
next push (after D1) will exercise both fixes on CI.

## Quality Checklist

- [ ] `npm run lint` clean
- [ ] `npm run build` clean
- [ ] `NODE_ENV=test npm run test` → 100 passed
- [ ] `cargo test` → 86 passed (or 84 with documented skip)
- [ ] `npm run verify-docs` passes
- [ ] Coverage thresholds trip when coverage drops (spot-checked)
- [ ] Workflow uses `npm ci` (not `npm install`) and `--locked` for cargo

## Anti-patterns

- ❌ **Setting aspirational coverage thresholds** (e.g. 80%) that fail on day one. Baseline first, tighten later.
- ❌ **Writing a pile of new tests to inflate coverage** in this increment. The gate is the deliverable; coverage growth is a follow-up arc.
- ❌ **Adding `.nvmrc` / engines / toolchain pins** without a decision — CI pins Node 22 in the workflow only.
- ❌ **Running `npm install` in CI** — lockfile exists; use `npm ci`.
- ❌ **Skipping the local verification pass** before pushing — CI is the gate, not the first place the commands run.

## Integration

This increment works well with:
- `docs/superpowers/plans/2026-08-27-frontend-audit-and-roadmap-deploy.md` (the parent plan; Increment F is its first sequenced move)
- `docs/codebase/TESTING.md` (the testing story this increment gates and documents)
- `AGENTS.md` (already corrected to 17/100 + 86 and lint-as-gate; CI makes that claim enforceable)
- `.github/agents/*.agent.md` (role-scoped subagents — CI is the enforcement layer for their work)
