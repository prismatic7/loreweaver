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

### Coverage
- [App.test.tsx](file:///Users/chris/Development/loreweaver/src/App.test.tsx): Validates sidebar navigation click states, dashboard layout mounting, and initial data loading via a mocked `invoke`.
- [DashboardView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/DashboardView.test.tsx): Verifies rendering of campaign notes and rule entries.
- [MarkdownEditor.test.tsx](file:///Users/chris/Development/loreweaver/src/components/MarkdownEditor.test.tsx): Verifies rendering of CodeMirror bindings, input changes, and prop propagation.
- [TrashView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/TrashView.test.tsx): Verifies rendering of trashed notes and restore/delete actions.
- [SettingsView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/SettingsView.test.tsx): Verifies settings form rendering and provider configuration.
- [FolderCanvas.test.tsx](file:///Users/chris/Development/loreweaver/src/components/FolderCanvas.test.tsx): Verifies folder canvas rendering and interactions.
- [RulesView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/RulesView.test.tsx): Verifies rule list rendering and editing behavior.
- [CampaignVaultView.test.tsx](file:///Users/chris/Development/loreweaver/src/components/CampaignVaultView.test.tsx): Verifies campaign vault note rendering and interactions.

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

Currently **30 tests** pass.

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
