# Loreweaver Implementation Plan

This document outlines the core architecture and development phases for building and launching Loreweaver.

---

## Phase 1: Vault Core & Distraction-Free Editor
- [x] Initialize Tauri v2 project with React 19 (TypeScript) and Vite.
- [x] Establish Rust backend architecture (`src-tauri`).
- [x] Implement directory watcher in Rust (`notify`) monitoring workspace folder.
- [x] Implement Markdown parsing & YAML frontmatter extraction (`gray_matter`).
- [x] Set up SQLite indexer with relational tables for notes and metadata.
- [x] Build CodeMirror distraction-free editor with live preview and `[[Wiki-link]]` autocompletion.

## Phase 2: Local AI & Semantic RAG Pipeline
- [x] Integrate ONNX Runtime (`ort`) into Rust backend.
- [x] Download & embed `all-MiniLM-L6-v2` ONNX model for local sentence embeddings.
- [x] Implement RAG context assembly engine combining vector similarity search + active note context.
- [x] Connect LLM orchestration layer supporting Ollama local API and cloud API providers (OpenAI, Gemini).

## Phase 3: Sandboxed Plugin Engine & Security
- [x] Integrate embedded JavaScript runtime host in Rust (`boa_engine`).
- [x] Build capability permission validator (`validate_permissions`).
- [x] Implement isolated JS hook execution engine (`run_plugin_hook`).
- [x] Support persistent plugin state scoping per vault (`globalThis.__state`).

## Phase 4: SRD Ingestion & Interactive Knowledge Graph
- [x] Build Markdown SRD ingestion engine chunking rulebooks by header sections (`#`, `##`, `###`).
- [x] Index SRD rules into SQLite with vector embeddings for instant rule lookups.
- [x] Build interactive visual node-edge Knowledge Graph canvas (`FolderCanvas.tsx`).

## Phase 5: Documentation & Onboarding
- [x] Reconcile root `README.md` and `ARCHITECTURE.md` with the actual implemented feature set.
- [x] Refresh `docs/codebase/*.md` to remove stale `[TODO]` markers and intent-vs-reality gaps.
- [x] Add user-facing docs: quickstart, feature guide, and settings reference.
- [x] Add developer docs: API/command reference, plugin authoring guide, contributing guide, troubleshooting.
- [x] Add a lightweight doc-verification script to keep docs consistent with code.

See [docs/DOCUMENTATION_PLAN.md](docs/DOCUMENTATION_PLAN.md) for the detailed overnight execution plan.
