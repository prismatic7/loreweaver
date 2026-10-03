# Testing

Loreweaver uses a split automated testing strategy to cover both the Rust backend and the React + TypeScript frontend.

---

## 1. Frontend Testing

### Setup & Tools
- **Framework:** [Vitest](https://vitest.dev/)
- **Utility:** [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- **Environment:** `jsdom` (simulates browser environment in Node.js)
- **Globals/Mocking:** `test/setup.ts` mocks `localStorage`, stubs `__TAURI_INTERNALS__`, and polyfills `DOMMatrix` (for pdfjs-dist) and `matchMedia`. Tauri `invoke` mocking is not done in setup.ts — each suite mocks `invoke` itself (typically via `vi.mock("@tauri-apps/api/core")` or per-call `vi.mocked` stubs).

### Running Frontend Tests
Run all frontend test suites using:
```bash
npm run test
```

**41 Vitest suites / 264 tests** pass (as of 2026-10-03). Note: `npm run test`
sets `NODE_ENV=test` internally; if you run `vitest` directly in an environment
where `NODE_ENV=production` is ambient (e.g. inside the Hermes TUI), prefix with
`env -u NODE_ENV` or dev dependencies (`vitest`) will be missing and React will
load its production build (no `React.act`), breaking `@testing-library/react`.

### Coverage Gate

Coverage is gated in CI via `npm run coverage` (`@vitest/coverage-v8`). Thresholds
in `vite.config.ts` (as of 2026-10-01): lines 46%, statements 45%, functions 38%,
branches 38% (originally the measured 2026-08-27 baseline minus a small buffer).
Tighten thresholds in follow-up increments as coverage grows; do not set
aspirational numbers that fail on day one.

### Notable Suites

(Vitest picks up all `src/**/*.test.{ts,tsx}` files — 41 suites as of 2026-10-03.
Notable ones:)

- [App.test.tsx](src/App.test.tsx): Validates sidebar navigation click states, dashboard layout mounting, and initial data loading via a mocked `invoke`.
- [DashboardView.test.tsx](src/components/DashboardView.test.tsx): Verifies rendering of campaign notes and rule entries.
- [MarkdownEditor.test.tsx](src/components/MarkdownEditor.test.tsx): Verifies rendering of CodeMirror bindings, input changes, and prop propagation.
- [TrashView.test.tsx](src/components/TrashView.test.tsx): Verifies rendering of trashed notes and restore/delete actions.
- [SettingsView.test.tsx](src/components/SettingsView.test.tsx): Verifies settings form rendering and provider configuration.
- [FolderCanvas.test.tsx](src/components/FolderCanvas.test.tsx): Verifies folder canvas rendering and interactions.
- [RulesView.test.tsx](src/components/RulesView.test.tsx): Verifies rule list rendering and editing behavior.
- [CampaignVaultView.test.tsx](src/components/CampaignVaultView.test.tsx): Verifies campaign vault note rendering and interactions.
- [EntityGraphView.test.tsx](src/components/EntityGraphView.test.tsx): Verifies entity graph rendering and provenance filtering.
- [RightDrawer.test.tsx](src/components/RightDrawer.test.tsx): Verifies drawer tabs, capture inbox actions, and chat wiring.
- [WorldShelf.test.tsx](src/components/WorldShelf.test.tsx): Verifies world switcher, new-world flow, Liminal entry, export/import triggers.
- [LiminalView.test.tsx](src/components/LiminalView.test.tsx): Verifies the Liminal list, claim-into-world (with default-target fallback), birth-a-world, back navigation, and error state.
- [types.test.ts](src/types.test.ts): Verifies type-level invariants.
- [MapBuilderView.test.tsx](src/components/MapBuilderView.test.tsx): Verifies map-building canvas rendering and interaction.
- [CharacterSheetView.test.tsx](src/components/CharacterSheetView.test.tsx): Verifies character sheet rendering.
- [CommandPalette.test.tsx](src/components/CommandPalette.test.tsx): Verifies palette open/filter/execute behavior.
- [useSearch.test.ts](src/hooks/useSearch.test.ts): Verifies search invocation and result state handling.
- [useWorld.test.ts](src/hooks/useWorld.test.ts): Verifies world manifest loading and theme override application.
- [useSessionTools.test.ts](src/hooks/useSessionTools.test.ts): Verifies session tool flows including note-to-illustrate image generation.

---

## 2. Backend Testing

### Setup & Tools
- **Framework:** Rust's built-in `cargo test` runner.
- **DB Mocking:** Databases are initialized using in-memory SQLite connections (`:memory:`) or temporary directory files, preventing pollution of real user profiles.
- **Boa Mocking:** JS plugins are evaluated using the raw in-memory Boa Engine context.

### Running Backend Tests
Navigate to the Tauri workspace directory and run tests:
```bash
cd src-tauri
cargo test
```

Currently **126 Rust tests** pass (as of 2026-10-03: 124 unit + 2 integration). `test_api_key_round_trip` self-skips when the OS keyring is unavailable (headless/CI environments) — defined at `lib.rs:3677`. Run from `src-tauri/` — Cargo.toml lives there, not the repo root. To get a full pass without a keychain unlock prompt: `cargo test -- --skip test_api_key_round_trip`.

### Coverage
- **Database (`db.rs`):** Validates CRUD queries for campaign notes, rulebooks, and settings.
- **Watcher (`watcher.rs`):** Tests markdown frontmatter parsing (with H1 fallback) and canvas JSON file loading.
- **Ingestion (`ingest.rs`):** Verifies splitting rules on heading tokens during SRD imports.
- **Plugins (`plugins.rs`):** Tests JS hook execution, state-injection breakout resistance, and timeout killing of infinite loops.
- **Search Similarity (`search.rs`):** Tests text chunking math and cosine similarity dot products.
- **Providers (`providers/llm.rs`):** Tests unsupported-provider rejection and missing-API-key handling.
- **Commands (`lib.rs`):** Covers command handler integration, including note trash/restore, symlink-escape rejection, API-key round-trip, provider-URL private-range blocking, wiki-link escaping, folder listing excluding trash/assets, rule save/load/delete, `search_vault`, system-context compilation, `orchestrate_agent` provider rejection, and template-list parsing.

---

## 2.5 Continuous Integration

CI runs on every push/PR via [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (added 2026-08-27, Increment F):

- **Frontend job** (Node 22, `npm ci`): `npm run lint` → `npm run build` (tsc strict + vite) → `npm run test` → `npm run coverage` → `npm run verify-docs`.
- **Backend job** (Rust stable, `cargo test --locked` from `src-tauri/`). `test_api_key_round_trip` self-skips headless (no OS keyring), so plain `cargo test` is expected to pass on runners.
- **Coverage policy:** thresholds live in `vite.config.ts`, set to the measured baseline minus a small buffer. They block PRs that drop coverage; they are tightened in follow-up increments, not loosened.

---

## 3. Roadmap / Missing Coverage

The following areas are not yet covered by automated tests:

- **Agent orchestration (`orchestrate_agent`)**: only provider rejection is tested; no end-to-end HTTP/response-path test (intentionally avoided — requires mocking the AI provider HTTP client).
- **Vault lifecycle commands**: no tests for `switch_vault`, `create_vault`, or `delete_vault`.
- **AI media commands**: no tests for `generate_image`, `generate_speech`, or `test_provider_connection`.
- **Settings persistence**: no `save_settings`/`load_settings` round-trip test.
- **Plugin host command**: no `execute_plugin_hook` command-level test (only lower-level `plugins.rs` hook tests).
- **Canvas file commands**: no `save_canvas_file`/`load_canvas_file` command test.
