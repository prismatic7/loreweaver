# Formatting and Style Rules

This guide defines the formatting standards and linting expectations for the Loreweaver project.

## 1. General Rules

- **Indentation**: 
  - Rust: Standard 4 spaces (enforced by `rustfmt`).
  - TypeScript/TSX: 2 spaces.
- **Line Length**: Max 100 characters for better readability on narrow monitors.
- **Line Endings**: LF (POSIX-compliant newline format).

## 2. TypeScript and React

- **Strict Mode**: Enable strict checks in `tsconfig.json`. Explicit types are required; avoid `any`.
- **Naming Conventions**:
  - Components: PascalCase (e.g., `CampaignVaultView`).
  - Interfaces/Types: Prefix with capital letters or use clean noun phrases, PascalCase (e.g., `AiViewProps`).
  - Hooks: Prefix with `use` (e.g., `useVaultState`).
  - Variables/Functions: camelCase (e.g., `loadNotes`, `activePath`).
- **Imports**: Group imports as follows:
  1. React core imports
  2. Third-party packages (e.g., `lucide-react`, Tauri APIs)
  3. Internal component imports
  4. Stylesheets and asset files
- **Comments**: Use JSDoc comments (`/** ... */`) above functions, components, and exported types.

## 3. Rust Backend

- **Rustfmt Standard**: Standard formatting via `rustfmt` is mandatory. Run `cargo fmt` before staging.
- **Naming Conventions**:
  - Structs/Enums/Traits: PascalCase (e.g., `AppState`, `DatabaseConnection`).
  - Functions/Variables: snake_case (e.g., `init_db`, `query_param`).
  - Constants: SCREAMING_SNAKE_CASE (e.g., `DEFAULT_CHUNK_SIZE`).
- **Comments**:
  - Use `///` for item documentation.
  - Use `//!` at the top of file headers for module-level documentation.
  - Keep internal comments concise and explain the *why* rather than the *what*.
