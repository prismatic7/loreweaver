# Loreweaver Master Guide

Welcome to Loreweaver. This file serves as the main entry point for the Antigravity AI coding assistant to understand the project structure, constraints, and development guidelines.

## 1. Project Overview

Loreweaver is a Tauri v2 desktop app that acts as an AI-powered campaign planner, organizer, and reference tool for tabletop RPG game masters. It features a React 19 + TypeScript frontend and a Rust backend with SQLite persistence, file watching, hybrid semantic search, AI provider integration, and a custom plugin execution runtime.

## 2. Tech Stack

- **Frontend**: React 19, TypeScript 5.x, Vite, TailwindCSS (if enabled, otherwise Vanilla CSS), Lucide React.
- **Backend**: Rust (Edition 2021), Tauri v2.
- **Database**: SQLite via the `rusqlite` crate.
- **Search**: Local vector search (384-dimensional embeddings) and SQLite FTS5 lexical indexing.
- **Plugin Interpreter**: Boa JS engine.

## 3. Directory Map

- [`src/`](file:///Users/chris/Development/loreweaver/src/) - React + TypeScript frontend code.
  - [`src/App.tsx`](file:///Users/chris/Development/loreweaver/src/App.tsx) - Central state and layout shell.
  - [`src/components/`](file:///Users/chris/Development/loreweaver/src/components/) - UI views (Canvas, Editor, Settings, Rulebooks).
- [`src-tauri/`](file:///Users/chris/Development/loreweaver/src-tauri/) - Rust Tauri backend.
  - [`src-tauri/src/lib.rs`](file:///Users/chris/Development/loreweaver/src-tauri/src-tauri/src/lib.rs) - State handling and Tauri command IPC routes.
  - [`src-tauri/src/db.rs`](file:///Users/chris/Development/loreweaver/src-tauri/src-tauri/src/db.rs) - SQLite schemas and initialization.
  - [`src-tauri/src/search.rs`](file:///Users/chris/Development/loreweaver/src-tauri/src-tauri/src/search.rs) - Embedding generation and similarity search.
  - [`src-tauri/src/watcher.rs`](file:///Users/chris/Development/loreweaver/src-tauri/src-tauri/src/watcher.rs) - Filesystem watcher and frontmatter/header indexing.
  - [`src-tauri/src/plugins.rs`](file:///Users/chris/Development/loreweaver/src-tauri/src/plugins.rs) - JS plugin runtime host using Boa.
- [`plugins/`](file:///Users/chris/Development/loreweaver/plugins/) - Bundle directory for campaign plugins.

## 4. Development Commands

- **Frontend Setup**: `npm install`
- **Frontend Verify**: `npm run build` (type-checks and compiles frontend code)
- **Tauri Dev Loop**: `npm run tauri dev` (launches Tauri dev app with Hot Reloading)

## 5. Coding Conventions

- **Tauri IPC Command handlers**:
  - Always return a `Result<T, String>` to serialize success types or return human-readable error messages.
  - State guards are accessed via Tauri's `tauri::State` wrappers.
- **Scoping**: All vault operations must be scoped by the current active vault path to prevent cross-vault data leaks.
- **Safe Path validation**: All vault writes must execute path verification via `validate_safe_path` before disk writes.
- **TypeScript Quality**: Avoid using the `any` type. Define clear interfaces for all properties and functions.

## 6. Critical Rules

- **No Traversal**: Never write or edit files outside the user's selected campaign vault directory bounds.
- **Keep Build Green**: All PRs/commits must compile cleanly without TypeScript or Rust compilation errors.
- **Suppressed Confirms**: Do not use `confirm()` or `alert()` on the frontend; use React overlay modals for destructive actions.
