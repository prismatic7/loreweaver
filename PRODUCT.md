# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Game Masters (GMs) preparing and running tabletop RPG campaigns (such as D&D, Pathfinder, Call of Cthulhu, Cyberpunk, Fate, etc.). They operate in low-latency, potentially offline environments, needing a clean workspace to manage complex lore, track session states, search rules, and draft campaign content.

## Product Purpose
Provide a secure, local-first campaign organizer and reference tool that combines standard Markdown note-taking, interactive visual canvas boards, and intelligent retrieval-augmented assistant tools to streamline RPG game prep and session orchestration.

## Positioning
A private, offline-first campaign manager that leverages local hybrid search (vector embeddings + classic keyword indexing) and RAG AI assistants directly on top of open, standard Markdown vaults, preventing third-party platform lock-in and protecting creative IP.

## Operating Context
A desktop application window (Tauri v2 shell wrapping a React app) used during active session planning (pre-game prep) and live session running (in-game orchestration). The application interacts directly with a local filesystem folder (the "campaign vault").

## Capabilities and Constraints
- **File Watching & SQLite Sync**: Recursive watcher indexes Markdown files, YAML frontmatter properties, and headings into SQLite automatically.
- **Local Hybrid Search**: Integrates SQLite FTS5 lexical index and a local ONNX model (384-dimensional embeddings) to calculate similarity scores.
- **AI Orchestrator**: Retrieval-Augmented Generation context stitching supporting local Ollama models and cloud AI providers.
- **Extensible Hooks**: Boa-based JavaScript engine running custom plugins with a whitelisted permission model (currently restricted to `"hooks"`).
- **Security Bounds**: Active campaign vault scoping is strictly enforced; path validation via `validate_safe_path` blocks unauthorized file access.
- **UI Gaps**: The image generation panel is a timed visual placeholder, not currently backed by a functional generator backend.

## Brand Commitments
- **Name**: Loreweaver.
- **Visual Tone**: Immersive, atmospheric, and clean; a premium dark-themed aesthetic that highlights campaign text and canvas visuals.
- **Privacy & Ownership**: No tracking or forced cloud sync. Maximize portability of user data via standard formats.

## Evidence on Hand
- React + TypeScript codebase in `src/` managing custom panels (CodeMirror 6 Markdown editor, Folder Canvas interactive board, Settings, Search, and Rules).
- Rust Tauri v2 core in `src-tauri/` managing SQLite CRUD (`db.rs`), text chunking and similarity math (`search.rs`), file watcher (`watcher.rs`), and plugin loading (`plugins.rs`).

## Product Principles
- **Local-First Security**: Data never leaves the machine unless explicitly sent to user-selected AI APIs.
- **Interoperability**: Vault files remain pure Markdown compatible with external editors (Obsidian, Logseq).
- **Hybrid Retrieval**: Search must blend lexical precision (FTS5) and semantic similarity to reliably recover both exact rules and conceptual lore.
- **Atmospheric Focus**: The UI serves to showcase campaign content and canvas layouts, minimizing interface clutter.

## Accessibility & Inclusion
- High typography contrast and sizing options for GMs scanning text during high-pressure live play.
- Clear workspace layouts prioritizing readability and rapid switching between notes and maps.
