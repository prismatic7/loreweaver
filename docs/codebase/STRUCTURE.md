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
- `src/hooks/` contains domain hooks (`useVault`, `useNotes`, `useRules`, `useSearch`, `useAgent`, `usePlugins`, `useSettings`, `useDialogs`, `useIngest`, `useMarkdownRender`, `useFolderActions`) that encapsulate Tauri IPC calls and local state.
- `src/components/` contains shell and feature components (`AppShell.tsx`, `RightDrawer.tsx`, `Modals.tsx`, `SettingsRightPanel.tsx`, plus existing views like `CampaignVaultView`, `RulesView`, `AiView`, `TrashView`, `DashboardView`, `FolderCanvas`, `MarkdownEditor`).
- `src/utils/` contains shared utilities (`dice.ts`, `pdf.ts`).
- `src/App.css` and `src/index.css` provide the visual system.

## Backend Entry Points

- `src-tauri/src/main.rs` is the binary entry and forwards to the library crate.
- `src-tauri/src/lib.rs` defines application state, Tauri commands, and the `run()` bootstrap.
- `src-tauri/src/db.rs`, `search.rs`, `ingest.rs`, `watcher.rs`, `agent.rs`, and `plugins.rs` hold the domain logic.

## Plugin Layout

- `plugins/character-roller/` contains a manifest and `index.js` implementation.
- `plugins/threat-evaluator/` contains a manifest and `index.js` implementation.
- The backend also seeds a `dice-bonus` plugin at runtime under the app data directory.

## Documentation Layout

- `docs/` contains complete application documentation:
  - `docs/codebase/`: Developer-focused internal design notes (structure, stack, INTEGRATIONS, concerns).
  - `docs/user/`: End-user guides (quickstart, features, settings).
  - `docs/developer/`: Technical developer guides (Tauri commands API, plugin authoring, troubleshooting).
  - `docs/DOCUMENTATION_PLAN.md`: Roadmap detailing the documentation updates.

- [index.html](/Users/chris/Development/loreweaver/index.html)
- [src/main.tsx](/Users/chris/Development/loreweaver/src/main.tsx)
- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [src/App.css](/Users/chris/Development/loreweaver/src/App.css)
- [src/index.css](/Users/chris/Development/loreweaver/src/index.css)
- [src-tauri/src/main.rs](/Users/chris/Development/loreweaver/src-tauri/src/main.rs)
- [src-tauri/src/lib.rs](/Users/chris/Development/loreweaver/src-tauri/src/lib.rs)
- [plugins/character-roller/manifest.json](/Users/chris/Development/loreweaver/plugins/character-roller/manifest.json)
- [plugins/threat-evaluator/manifest.json](/Users/chris/Development/loreweaver/plugins/threat-evaluator/manifest.json)
