---
description: "Introduce new developers or agents to the Loreweaver repository structure and runtimes."
---

# Developer Onboarding Workflow

Welcome to Loreweaver development. Follow these steps to understand and get started with the repository:

## 1. Quick Architecture Walkthrough

- Loreweaver is a Tauri-based desktop app.
- **Frontend** (`src/`): A standard React 19 app compiled with Vite. Communication with the backend is done asynchronously using Tauri's IPC handlers (`invoke`).
- **Backend** (`src-tauri/`): A Rust application that implements:
  - SQLite persistence (`db.rs`)
  - Semantic and FTS5 search (`search.rs`)
  - Vault filesystem watcher (`watcher.rs`)
  - Boa JS Engine Plugin execution (`plugins.rs`)
  - LLM system orchestration (`agent.rs`)

## 2. Dev Environment Setup

1. Make sure you have Node.js (v20+) and Rust (stable toolchain) installed.
2. Run `npm install` inside the project root directory.
3. Boot the application in development mode:
   ```bash
   npm run tauri dev
   ```
4. Verify compiling and type-checking pass:
   ```bash
   npm run build
   ```

## 3. Key Design Pitfalls to Avoid

- **Vault Sandboxing**: Never write files without verifying their paths via `validate_safe_path`.
- **Tauri WebViews vs Dialogs**: The Tauri webview suppresses browser `confirm()` and `alert()`. Any confirmation modals must be built in React.
- **Cross-Vault Isolation**: Do not cache vault-derived states globally. Scopes must strictly follow the active vault path.
