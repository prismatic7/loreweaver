# Stack

## Core Stack

- Frontend: React 19.1.9 (react + react-dom pinned exactly) with TypeScript and Vite, plus `@tauri-apps/api`, `@tauri-apps/plugin-opener`, and `lucide-react`.
- Backend: Tauri v2 with Rust 2021 edition.
- Storage: Local SQLite via `rusqlite` with bundled SQLite.
- File parsing and sync: `notify` and `gray_matter`.
- Search and embeddings: `ort`, `tokenizers`, `ndarray`, and `ureq`.
- Plugin execution: `boa_engine`.
- Serialization/time: `serde`, `serde_json`, `serde_yaml`, `uuid`, and `chrono`.

## Tooling

- TypeScript is configured in strict mode with `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.
- Vite is configured for Tauri dev/build with a fixed dev port of 1420.
- Tauri uses a local app-data directory for the database, vaults, and plugins.
- npm scripts: `dev`, `build` (tsc + vite build), `preview`, `tauri`, `test`, `coverage`, `lint`, `verify-docs`. `npm run verify-docs` (`node docs/verify.mjs`) checks doc links and that every `lib.rs` Tauri command is documented in `docs/developer/API.md` and every frontend `invoke()` target exists.

## What I Could Verify

- The frontend package manifest defines `build`, `dev`, `preview`, `tauri`, `test`, `coverage`, `lint`, and `verify-docs` scripts.
- The Rust manifest defines the backend dependencies and the Tauri v2 build dependency.

## Code Verification & Tooling

- **Frontend Tests:** Configured using Vitest and React Testing Library (`npm run test`).
- **Backend Tests:** Built-in unit and command integration tests validated via Cargo (`cargo test` in `src-tauri/`).
- **TypeScript:** Enforced strictly under strict compiler settings.
- **Cargo Toolchain:** Fully verified and operational locally.

## Evidence

- [package.json](package.json)
- [src-tauri/Cargo.toml](src-tauri/Cargo.toml)
- [tsconfig.json](tsconfig.json)
- [vite.config.ts](vite.config.ts)
- [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json)
