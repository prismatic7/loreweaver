# Loreweaver

Loreweaver is a secure, private, local-first desktop application designed to help Game Masters (GMs) and players develop, run, and orchestrate RPG campaigns for any tabletop system (D&D, Pathfinder, Call of Cthulhu, Cyberpunk, Fate, etc.).

## Core Principles

- **Local-First & Private**: Your lore, rules, and campaigns are stored locally on your machine in open formats (Markdown). No forced cloud sync, no tracking, and complete privacy.
- **Copyright Compliant**: Users import their own System Reference Documents (SRDs) and rulebooks. No copyrighted material is bundled with the application.
- **Markdown-Centric**: Everything is plain Markdown files, allowing you to edit, preview, and link notes using standard syntax (compatible with Obsidian/Logseq).
- **Semantically Searchable**: Deep search across rules, lore, and notes using local vector embeddings and classic keyword search.
- **Tight & Fast**: Powered by a lightweight Rust backend (using Tauri) and a responsive TypeScript frontend.
- **Extensible**: A pluggable architecture with a robust API for third-party plugins, custom memory backends, image generation workflows, and AI agent orchestration.

## Key Features

1. **SRD & Rulebook Ingestion**: Import SRDs and rulebooks (Markdown, PDF, HTML) and extract rules, lore, monsters, spells, and items into structured databases.
2. **Structured Note-Taking**: Dedicated templates and schemas for worldbuilding (locations, geography, factions), characters (NPCs, adversaries, PCs), items, events, and sessions.
3. **Semantic & Keyword Search**: Multi-modal search capability utilizing a local vector store alongside a keyword search index (FTS5).
4. **Agent Orchestration & Memory**: Integrate local/remote LLMs to run NPCs, simulate faction decisions, generate ideas, and assist with prep work, with memory backends storing context.
5. **Image Generation Workflows**: In-app generation of character portraits, maps, items, and scenes using local Stable Diffusion instances or remote API providers.
6. **Plugin System**: A robust API allowing community-built plugins for sheet builders, virtual table tops (VTT) integrations, combat trackers, and custom system rules.

## Directory Structure

```text
loreweaver/
├── src-tauri/          # Rust backend (Tauri)
│   ├── src/            # Rust application logic
│   └── Cargo.toml      # Rust dependencies
├── src/                # TypeScript frontend
│   ├── src/            # React/Vue/Solid components & logic
│   └── package.json    # Frontend dependencies
├── plugins/            # Core and third-party plugin directory
├── data/               # Default local database, vector store, and media storage
└── docs/               # System documentation and developer guides
```

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

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
