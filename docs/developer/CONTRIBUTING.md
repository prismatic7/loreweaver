# Loreweaver Contributor Guide

Thank you for contributing to Loreweaver! This document outlines local environment setup, testing gates, role-scoped subagents, and pull request guidelines.

---

## 1. Local Environment Setup

### System Tools
Ensure you have standard developer tools installed:
* **Node.js:** Node v18+ is recommended.
* **Rust:** Rustup compiler manager (supports Rust 2021 edition).
* **Tauri v2 CLI:** Integrated via `npm run tauri`.

Refer to the [Tauri Setup Guides](https://tauri.app/start/prerequisites/) for operating system libraries (webview2, GCC, or Xcode tools).

### Setup Commands
1. Clone the codebase and enter the workspace root.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Boot the desktop development client:
   ```bash
   npm run tauri dev
   ```
4. Build the distribution client (checks strict typescript typing):
   ```bash
   npm run build
   ```

---

## 2. Automated Test Gates

Before submitting a Pull Request, all automated tests must be completely verified:

### Frontend Unit & Component Tests
Tests are executed using Vitest and React Testing Library:
```bash
npm run test
```

### Backend Rust Tests
Tests are validated using cargo:
```bash
cd src-tauri
cargo test
```

---

## 3. Specialized Subagent Delegation

Loreweaver provides role-scoped subagent instructions located under `.github/agents/`. When delegating tasks to coding assistants, match the assistant role to the task scope:
* **rust-backend assistant:** Handlers for SQLite operations, directory watches, vector indexing, or AI provider clients.
* **frontend assistant:** Handlers for React layout components, CodeMirror modifications, or tauri IPC calls.
* **plugin-dev assistant:** Handlers for JS manifests, dice roll modifiers, or Boa host bindings.

---

## 4. Commit and Pull Request Rules

We follow **Conventional Commits** formatting. Keep messages clean, descriptive, and prefixed:
- `feat:` New features (e.g. `feat: add markdown table formatter`).
- `fix:` Bug fixes (e.g. `fix: resolve SQLite busy timeout lock`).
- `docs:` Documentation improvements (e.g. `docs: add contributing reference`).
- `test:` Adding or repairing test suites (e.g. `test: add db note operations coverage`).

Make sure to run both `npm run build` and `cargo check` to prevent CI pipeline failures.
