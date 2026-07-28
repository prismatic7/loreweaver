# Testing

Loreweaver uses a split automated testing strategy to cover both the Rust backend and the React + TypeScript frontend.

---

## 1. Frontend Testing

### Setup & Tools
- **Framework:** [Vitest](https://vitest.dev/)
- **Utility:** [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- **Environment:** `jsdom` (simulates browser environment in Node.js)
- **Globals/Mocking:** Standard `window` globals are configured in `src/test/setup.ts` to mock Tauri's `invoke` IPC interface and `localStorage` state.

### Running Frontend Tests
Run all frontend test suites using:
```bash
npm run test
```

### Coverage
- [App.test.tsx](file:///Users/chris/Development/loreweaver/src/App.test.tsx): Validates sidebar navigation click states, dashboard layout mounting, and initial data loading.
- [MarkdownEditor.test.tsx](file:///Users/chris/Development/loreweaver/src/components/MarkdownEditor.test.tsx): Verifies rendering of CodeMirror bindings, input changes, and prop propagation.

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

### Coverage
- **Database (`db.rs`):** Validates CRUD queries for campaign notes, rulebooks, and settings.
- **Watcher (`watcher.rs`):** Tests markdown frontmatter parsing and canvas JSON file loading.
- **Ingestion (`ingest.rs`):** Verifies splitting rules on heading tokens during SRD imports.
- **Plugins (`plugins.rs`):** Tests JS hook evaluations and state mutation cycles.
- **Search Similarity (`search.rs`):** Tests text chunking math and cosine similarity dot products.
- **Orchestration (`agent.rs`):** Validates RAG prompt compilation and model configuration checks.
- **Commands (`lib.rs`):** Includes integration verification of file deletion/restoration cycles.
