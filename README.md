# Loreweaver

Loreweaver is a secure, private, local-first desktop application designed to help Game Masters (GMs) and players develop, run, and orchestrate RPG campaigns for any tabletop system (D&D, Pathfinder, Call of Cthulhu, Cyberpunk, Fate, etc.).

---

## Core Principles

- **Local-First & Private**: Your lore, rules, and campaigns are stored locally on your machine in open formats (Markdown). No forced cloud sync, no tracking, and complete privacy.
- **Copyright Compliant**: Users import their own System Reference Documents (SRDs) and rulebooks. No copyrighted material is bundled with the application.
- **Markdown-Centric**: Everything is plain Markdown files, allowing you to edit, preview, and link notes using standard syntax (compatible with Obsidian/Logseq).
- **Semantically Searchable**: Deep search across rules, lore, and notes using local vector embeddings (ONNX runtime) and classic keyword search (SQLite FTS5).
- **Tight & Fast**: Powered by a lightweight Rust backend (using Tauri v2) and a responsive React + TypeScript frontend.
- **Extensible**: Supports custom plugins via a lightweight JavaScript execution runtime (powered by the Boa engine).

---

## What Works Today

1. **Markdown Campaign Vault**: Standard Markdown campaign sheets with full Obsidian-style wikilink support (e.g. `[[Eldoria]]`).
2. **Interactive Board Canvas**: Interactive canvas board views showing maps, flowcharts, or cards.
3. **Local Hybrid Search**: Blended search combining keyword matching (FTS5) and vector similarity (ONNX `all-MiniLM-L6-v2` model) to find relevant lore and rules.
4. **AI Campaign Architect**: RAG (Retrieval-Augmented Generation) chat assistant querying your campaign vault using Ollama, OpenAI, Gemini, or Anthropic.
5. **Rulebook Ingestion**: Import plaintext/markdown SRD documents and parse them automatically into structured rules databases.
6. **Extensible Plugin System**: Execute third-party rules scripts and dice rolling modifiers using JS hooks.

### Known Gaps & Limitations
- **Image Generation:** The image generation panel is currently a timed placeholder demonstration and is not yet connected to a live Stable Diffusion backend.
- **Plugin Sandbox:** The plugin sandbox runs in the Boa JavaScript engine. It is not fully sandboxed and is protected by a whitelist constraint (only the `"hooks"` permission is allowed).

---

## Directory Structure

```text
loreweaver/
├── src-tauri/          # Rust backend (Tauri v2)
│   ├── src/            # Rust application logic, DB, search, watcher, agent, plugins
│   └── Cargo.toml      # Rust dependencies
├── src/                # React + TypeScript frontend
│   ├── components/     # Canvas and editor views
│   └── package.json    # Frontend dependencies
├── docs/               # User guides and developer references
```

---

## Getting Started

To run the Tauri app locally, you need to set up the dependencies:

1. **Prerequisites**: Ensure you have installed the prerequisites for your OS: [Tauri Prerequisites](https://tauri.app/start/prerequisites/).
2. **Install Node dependencies**:
   ```bash
   npm install
   ```
3. **Install Rust**: Refer to [Rust Installation](https://www.rust-lang.org/learn/get-started#installing-rust).
4. **Run the Development Server**:
   ```bash
   npm run tauri dev
   ```

To run the automated tests:
- **Frontend tests:** `npm run test`
- **Backend Rust tests:** `cd src-tauri && cargo test`

For detailed setup, see [QUICKSTART.md](file:///Users/chris/Development/loreweaver/docs/user/QUICKSTART.md) and [CONTRIBUTING.md](file:///Users/chris/Development/loreweaver/docs/developer/CONTRIBUTING.md).
