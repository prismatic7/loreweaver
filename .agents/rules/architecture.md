# Architectural Guidelines

This document outlines the core architecture, layers, and communication patterns of the Loreweaver application.

## 1. System Shape & Communication

```
┌─────────────────────────────────┐
│        React Frontend           │
│   (State, Viewports, Editors)   │
└────────────────┬────────────────┘
                 │ Tauri IPC (invoke)
                 ▼
┌─────────────────────────────────┐
│         Rust Backend            │
│   (Watcher, DB, AI, Plugins)    │
└─────────────────────────────────┘
```

- **Frontend-Backend decoupling**: The React frontend must focus on presentation, user-driven events, and rendering local UI states. It must make asynchronous IPC calls to request backend operations.
- **Backend persistence & logic**: The Rust backend acts as the source of truth for filesystem management, SQLite persistence, indexing, search embeddings, and execution sandboxing.

## 2. Layers & Responsibilities

- **`lib.rs` (Bootstrap & Tauri API Entry)**: Defines `AppState`, handles handlers, registers command callbacks, and manages the global Tauri runtime handles.
- **`db.rs` (Persistence)**: Manages SQLite setup, schema migrations, WAL mode setup, and low-level CRUD queries.
- **`watcher.rs` (VCS & Index Sync)**: Monitors note creation, updates, and deletes, parsing frontmatter / headers on the fly.
- **`search.rs` (Embeddings & Semantic Search)**: Handles local embedding model execution, semantic cosine similarity scoring, and FTS5 search integration.
- **`plugins.rs` (Extension Engine)**: Owns the plugin registry, lifecycle, and Boa runtime.
- **`agent.rs` (AI Orchestrator)**: Constructs system prompts, injects reference context, and manages LLM provider integrations.
