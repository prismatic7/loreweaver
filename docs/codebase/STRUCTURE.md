# Structure

## Top Level

- `src/` contains the React frontend.
- `src-tauri/` contains the Rust backend and Tauri configuration.
- `plugins/` contains repo-bundled plugin examples.
- `public/` contains static frontend assets.
- `dist/` exists in the workspace and is generated output from the frontend build.

## Frontend Entry Points

- `index.html` loads `/src/main.tsx`.
- `src/main.tsx` mounts the React app.
- `src/App.tsx` is the top-level orchestrator that composes domain hooks and renders shell components.
- `src/hooks/` contains domain hooks (`useVault`, `useNotes`, `useRules`, `useSearch`, `useAgent`, `usePlugins`, `useSettings`, `useDialogs`, `useIngest`, `useMarkdownRender`, `useFolderActions`, `useWorld`, `useCaptureInbox`, `useSessionTools`, `useFocusTrap`) that encapsulate Tauri IPC calls and local state.
- `src/components/` contains shell and feature components (`AppShell.tsx`, `RightDrawer.tsx`, `Modals.tsx`, `SettingsRightPanel.tsx`, views like `CampaignVaultView`, `RulesView`, `AiView`, `TrashView`, `DashboardView`, `FolderCanvas`, `MarkdownEditor`, `EntityGraphView`, `WorldShelf`, `LiminalView`, `TimelineView`, `MapBuilderView`, `CharacterSheetView`, `CommandPalette`, plus organisation helpers like `TagTree`, `NoteOutline`, and a `markdown/` subdirectory of remark-driven render primitives).
- `src/utils/` contains shared utilities (`dice.ts`, `pdf.ts`, `tags.ts` (frontmatter tags → tree), `outline.ts` (markdown headings → tree), `links.ts` (wikilink parsing), plus `utils/editor/` and `utils/markdown/` (remark-* modules) subdirectories).
- `src/App.css` and `src/index.css` provide the visual system.

## Backend Entry Points

- `src-tauri/src/main.rs` is the binary entry and forwards to the library crate.
- `src-tauri/src/lib.rs` defines application state, Tauri commands, and the `run()` bootstrap.
- `src-tauri/src/db.rs`, `search.rs`, `ingest.rs`, `watcher.rs`, `agent.rs`, and `plugins.rs` hold the domain logic.

## Plugin Layout

- Repo plugins (each with a `manifest.json` and `index.js`): `plugins/character-roller/`, `plugins/threat-evaluator/`, `plugins/initiative-tracker/`, `plugins/encounter-builder/`.
- The backend also seeds a `dice-roller` plugin at runtime under the app data directory.

## Documentation Layout

- `docs/` contains complete application documentation:
  - `docs/codebase/`: Developer-focused internal design notes (structure, stack, INTEGRATIONS, concerns).
  - `docs/user/`: End-user guides (quickstart, features, settings).
  - `docs/developer/`: Technical developer guides (Tauri commands API, plugin authoring, troubleshooting).
  - `docs/DOCUMENTATION_PLAN.md`: Roadmap detailing the documentation updates.

- [index.html](index.html)
- [src/main.tsx](src/main.tsx)
- [src/App.tsx](src/App.tsx)
- [src/App.css](src/App.css)
- [src/index.css](src/index.css)
- [src-tauri/src/main.rs](src-tauri/src/main.rs)
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs)
- [plugins/character-roller/manifest.json](plugins/character-roller/manifest.json)
- [plugins/threat-evaluator/manifest.json](plugins/threat-evaluator/manifest.json)
