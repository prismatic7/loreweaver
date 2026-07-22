# Stack

## Core Stack

- Frontend: React 19.1.0 with TypeScript and Vite, plus `@tauri-apps/api`, `@tauri-apps/plugin-opener`, and `lucide-react`.
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

## What I Could Verify

- The frontend package manifest defines `build`, `dev`, `preview`, and `tauri` scripts.
- The Rust manifest defines the backend dependencies and the Tauri v2 build dependency.

## [TODO]

- No lint or test scripts are defined in the root package manifest.
- Cargo could not be executed in this terminal environment, so the Rust toolchain was not runtime-verified here.

## Evidence

- [package.json](/Users/chris/Development/loreweaver/package.json)
- [src-tauri/Cargo.toml](/Users/chris/Development/loreweaver/src-tauri/Cargo.toml)
- [tsconfig.json](/Users/chris/Development/loreweaver/tsconfig.json)
- [vite.config.ts](/Users/chris/Development/loreweaver/vite.config.ts)
- [src-tauri/tauri.conf.json](/Users/chris/Development/loreweaver/src-tauri/tauri.conf.json)
