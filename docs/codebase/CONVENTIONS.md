# Conventions

## Frontend

- The frontend is written in TypeScript with strict compiler settings.
- `App.tsx` uses a single, large stateful component rather than a split feature tree.
- UI state is managed with `useState`, `useEffect`, and `useRef`.
- Tauri calls are made through `invoke(...)` and are named after backend commands.
- The UI uses `data-od-id` attributes on key controls, which suggests automation-friendly selectors.

## Backend

- Tauri commands are declared in `src-tauri/src/lib.rs` with `#[tauri::command]` and exposed through `generate_handler!`.
- Shared app state is held in `AppState` with `Mutex` guards around paths and the filesystem watcher.
- Persistence and command handlers generally return `Result<..., String>` for error propagation.
- Vault writes are checked with `validate_safe_path` before file output.

## Naming and Data Shape

- Notes use `id`, `title`, `path`, `frontmatter`, and `content`.
- Rules use `id`, `title`, `category`, `source`, and `content`.
- Search results use a string `type` field, a title, a snippet, a score, and a path.

## [TODO]

- No formatter or lint configuration file was inspected in the repo root.
- The frontend still uses a few `any`-typed values, so type discipline is partial even though `strict` mode is enabled.
- The codebase is small enough that the current monolithic `App.tsx` works, but it will become harder to maintain as features expand.

## Evidence

- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [src-tauri/src/lib.rs](/Users/chris/Development/loreweaver/src-tauri/src/lib.rs)
- [tsconfig.json](/Users/chris/Development/loreweaver/tsconfig.json)
- [src-tauri/src/db.rs](/Users/chris/Development/loreweaver/src-tauri/src/db.rs)
