# Conventions

## Frontend

- The frontend is written in TypeScript with strict compiler settings.
- `App.tsx` uses a single, large stateful component rather than a split feature tree.
- UI state is managed with `useState`, `useEffect`, and `useRef`.
- Tauri calls are made through `invoke(...)` and are named after backend commands.
- The UI uses `data-od-id` attributes on key controls, which suggests automation-friendly selectors.

### `data-od-id` Selector Convention

`data-od-id` attributes are stable, test/automation-friendly hooks. They must not be used for styling or business logic — only for selection in tests, audits, and辅助 tooling.

Rules for adding selectors:

- **Kebab-case, lowercase values.** Use only letters, numbers, and hyphens (`-`). No spaces or camelCase.
- **Prefix by scope.** Use short, predictable prefixes so selectors group naturally in audits:
  - Global chrome: `nav-<view>`, `btn-theme-toggle`, `toolbar`
  - View roots: `dashboard-view`, `vault-view`, `rules-view`, `ai-view`, `settings-view`, `trash-view`
  - Primary actions: `vault-new-note-btn`, `rules-new-rule-btn`, `settings-save-config-btn`
  - Per-item actions: `note-<id>`, `rule-<id>`, `trash-restore-<id>`, `trash-delete-<id>`
  - Canvas toolbar: `canvas-zoom-in-btn`, `canvas-zoom-out-btn`, `canvas-add-container-btn`, `canvas-save-btn`
  - Right drawer: `tab-<name>`, `collapsed-tab-<name>`, `generate-image-btn`, `generate-speech-btn`, `btn-ai-send`
- **One selector per actionable element.** Do not add redundant selectors to every wrapper.
- **Do not change existing `data-od-id` values** unless the control’s identity has changed, because external audits and tests rely on them.
- **Dynamic IDs must be safe.** When interpolating note/rule IDs, make sure the resulting value is still a valid HTML `data-*` attribute value (no spaces, quotes, or angle brackets). IDs from user content should already be normalized by the backend.

## Backend

- Tauri commands are declared in `src-tauri/src/lib.rs` with `#[tauri::command]` and exposed through `generate_handler!`.
- Shared app state is held in `AppState` with `Mutex` guards around paths and the filesystem watcher.
- Persistence and command handlers generally return `Result<..., String>` for error propagation.
- Vault writes are checked with `validate_safe_path` before file output.

## Naming and Data Shape

- Notes use `id`, `title`, `path`, `frontmatter`, and `content`.
- Rules use `id`, `title`, `category`, `source`, `path`, and `content`. The `path` column groups rules into folders in the UI.
- Search results use a string `type` field, a title, a snippet, a score, and a path.

## UI Conventions

- Destructive actions (trash, delete folder, empty trash, delete vault) require confirmation through a custom React modal. Browser `confirm()` dialogs are not used because Tauri WebViews suppress them.

## Code Quality & Conventions

- **Formatting:** Frontend files use ESLint and Prettier for automated checks. Backend Rust files follow `rustfmt` standard style conventions.
- **Strict Typing:** All new React components and functions should declare explicit interfaces and avoid using the `any` type to ensure type safety.
- **Component Splitting:** Rather than expanding the monolithic `App.tsx` sheet, new features (like canvas variants or settings panels) should be placed in dedicated sub-files under `src/components/`.

## Evidence

- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [src-tauri/src/lib.rs](/Users/chris/Development/loreweaver/src-tauri/src/lib.rs)
- [tsconfig.json](/Users/chris/Development/loreweaver/tsconfig.json)
- [src-tauri/src/db.rs](/Users/chris/Development/loreweaver/src-tauri/src/db.rs)
