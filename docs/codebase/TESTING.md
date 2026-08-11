# Testing

Loreweaver uses a split automated testing strategy to cover both the Rust backend and the React + TypeScript frontend.

---

## 1. Frontend Testing

### Setup & Tools
- **Framework:** [Vitest](https://vitest.dev/)
- **Utility:** [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- **Environment:** `jsdom` (simulates browser environment in Node.js)
- **Globals/Mocking:** Standard `window` globals are configured in `test/setup.ts` to mock Tauri's `invoke` IPC interface and `localStorage` state.

### Running Frontend Tests
Run all frontend test suites using:
```bash
npm run test
```

**14 Vitest suites / 52 tests** pass (measured 2026-08-11). Note: `npm run test`
sets `NODE_ENV=test` internally; if you run `vitest` directly in an environment
where `NODE_ENV=production` is ambient (e.g. inside the Hermes TUI), prefix with
`env -u NODE_ENV` or dev dependencies (`vitest`) will be missing and React will
load its production build (no `React.act`), breaking `@testing-library/react`.

### Coverage
- [App.test.tsx](file:///Users/chris/Development/loreweaver/src/App.test.tsx): Validates sidebar navigation click states, dashboard layout mounting, and initial data loading via a mocked `invoke`.
- [DashboardView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/DashboardView.test.tsx): Verifies rendering of campaign notes and rule entries.
- [MarkdownEditor.test.tsx](file:///Users/chris/Development/loreweaver/src/components/MarkdownEditor.test.tsx): Verifies rendering of CodeMirror bindings, input changes, and prop propagation.
- [TrashView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/TrashView.test.tsx): Verifies rendering of trashed notes and restore/delete actions.
- [SettingsView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/SettingsView.test.tsx): Verifies settings form rendering and provider configuration.
- [FolderCanvas.test.tsx](file:///Users/chris/Development/loreweaver/src/components/FolderCanvas.test.tsx): Verifies folder canvas rendering and interactions.
- [RulesView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/RulesView.test.tsx): Verifies rule list rendering and editing behavior.
- [CampaignVaultView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/CampaignVaultView.test.tsx): Verifies campaign vault note rendering and interactions.
- [EntityGraphView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/EntityGraphView.test.tsx): Verifies entity graph rendering and provenance filtering.
- [RightDrawer.test.tsx](file:///Users/chris/Development/loreweaver/src/components/RightDrawer.test.tsx): Verifies drawer tabs, capture inbox actions, and chat wiring.
- [WorldShelf.test.tsx](file:///Users/chris/Development/loreweaver/src/components/WorldShelf.test.tsx): Verifies world switcher, new-world flow, Liminal entry, export/import triggers.
- [LiminalView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/LiminalView.test.tsx): Verifies the Liminal list, claim-into-world (with default-target fallback), birth-a-world, back navigation, and error state.
- [types.test.ts](file:///Users/chris/Development/loreweaver/src/types.test.ts): Verifies type-level invariants.

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

Currently **57 Rust tests** (56 pass; `test_api_key_round_trip` is excluded — it blocks indefinitely when the macOS Keychain is locked, a pre-existing flake). Measured 2026-08-11: 43 baseline + 10 webclip + 3 `list_liminal_notes` + 1 keychain round-trip. Run from `src-tauri/` — Cargo.toml lives there, not the repo root. To get a full pass without a keychain unlock prompt: `cargo test -- --skip test_api_key_round_trip`.

### Coverage
- **Database (`db.rs`):** Validates CRUD queries for campaign notes, rulebooks, and settings.
- **Watcher (`watcher.rs`):** Tests markdown frontmatter parsing (with H1 fallback) and canvas JSON file loading.
- **Ingestion (`ingest.rs`):** Verifies splitting rules on heading tokens during SRD imports.
- **Plugins (`plugins.rs`):** Tests JS hook execution, state-injection breakout resistance, and timeout killing of infinite loops.
- **Search Similarity (`search.rs`):** Tests text chunking math and cosine similarity dot products.
- **Providers (`providers/llm.rs`):** Tests unsupported-provider rejection and missing-API-key handling.
- **Commands (`lib.rs`):** Covers command handler integration, including note trash/restore, symlink-escape rejection, API-key round-trip, provider-URL private-range blocking, wiki-link escaping, folder listing excluding trash/assets, rule save/load/delete, `search_vault`, system-context compilation, `orchestrate_agent` provider rejection, and template-list parsing.

---

## 3. Roadmap / Missing Coverage

The following areas are not yet covered by automated tests:

- **Agent orchestration (`orchestrate_agent`)**: only provider rejection is tested; no end-to-end HTTP/response-path test (intentionally avoided — requires mocking the AI provider HTTP client).
- **Vault lifecycle commands**: no tests for `switch_vault`, `create_vault`, or `delete_vault`.
- **AI media commands**: no tests for `generate_image`, `generate_speech`, or `test_provider_connection`.
- **Settings persistence**: no `save_settings`/`load_settings` round-trip test.
- **Plugin host command**: no `execute_plugin_hook` command-level test (only lower-level `plugins.rs` hook tests).
- **Canvas file commands**: no `save_canvas_file`/`load_canvas_file` command test.
