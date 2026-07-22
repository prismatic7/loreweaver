# Loreweaver Agent Guide

Loreweaver is a Tauri v2 desktop app: a React 19 + TypeScript frontend (`src/`) talks over Tauri IPC to a Rust backend (`src-tauri/src/`) that owns SQLite persistence, vault file watching, hybrid semantic search, AI provider calls, and a Boa-based JS plugin runtime.

Read [docs/codebase/ARCHITECTURE.md](docs/codebase/ARCHITECTURE.md) first — it and its siblings in `docs/codebase/` are the source of truth for how this repo actually works today (as opposed to aspirational claims in [README.md](README.md) and [ARCHITECTURE.md](ARCHITECTURE.md), which describe some not-yet-built features like real image generation and a stronger plugin sandbox).

## Reference Docs (read before making claims about the codebase)

| Doc                                                            | Covers                                                                              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [docs/codebase/ARCHITECTURE.md](docs/codebase/ARCHITECTURE.md) | System shape, data flow, backend layers, plugin model                               |
| [docs/codebase/STACK.md](docs/codebase/STACK.md)               | Frontend/backend dependencies, tooling                                              |
| [docs/codebase/STRUCTURE.md](docs/codebase/STRUCTURE.md)       | Directory layout, entry points                                                      |
| [docs/codebase/CONVENTIONS.md](docs/codebase/CONVENTIONS.md)   | Naming, command patterns, data shapes                                               |
| [docs/codebase/INTEGRATIONS.md](docs/codebase/INTEGRATIONS.md) | Filesystem, SQLite, search/embeddings, AI providers, plugins                        |
| [docs/codebase/CONCERNS.md](docs/codebase/CONCERNS.md)         | Known risk areas — read before touching plugins or search                           |
| [docs/codebase/TESTING.md](docs/codebase/TESTING.md)           | What test coverage exists (currently: none; `npm run build` is the type-check gate) |

Keep these docs current: if you change architecture, conventions, or a risk area meaningfully, update the relevant file in the same change.

## Specialized Agents

This repo defines role-scoped subagents in `.github/agents/`. Prefer delegating to these over general-purpose editing when the task is squarely in their domain:

- **rust-backend** — `src-tauri/src/` (db, watcher, search, ingest, agent orchestration, plugin host, Tauri commands in `lib.rs`).
- **frontend** — `src/` (React/TypeScript UI, Tauri `invoke()` call sites).
- **plugin-dev** — `plugins/*/manifest.json` + `index.js`, and the Boa-engine plugin host contract in `src-tauri/src/plugins.rs`.

## Build & Verify

```bash
npm install          # frontend deps
npm run build         # vite build; also the de-facto TypeScript type-check gate (strict mode)
npm run tauri dev     # full app dev loop (Rust + frontend)
```

- There is no `npm test` script and no Rust test suite discovered in the repo — do not assume one exists. If you add tests, also update [docs/codebase/TESTING.md](docs/codebase/TESTING.md).
- Cargo/rustc may not be available in every terminal environment here; if `cargo check` isn't runnable, say so rather than assuming the Rust side compiles.

## Cross-Cutting Conventions

- Tauri commands return `Result<..., String>`; propagate errors the same way in new commands (see [docs/codebase/CONVENTIONS.md](docs/codebase/CONVENTIONS.md)).
- All vault-derived state (chat history, plugin runtime state, search/DB access) must be scoped by the active vault path — this was a real bug class fixed before; do not reintroduce cross-vault bleed. See repo memory notes for specifics if using an agent with memory access.
- Vault writes must go through `validate_safe_path` — never bypass it for new file-write commands.
- Plugin permissions are allow-listed (currently only `"hooks"` in `src-tauri/src/plugins.rs`); do not silently widen the permission surface without an explicit decision.

## Known Gaps (do not paper over these — flag them if relevant to a task)

- Image generation in the UI is a timed placeholder, not a real backend call.
- The plugin system runs arbitrary JS in Boa with no strong sandbox/isolation beyond the permission allow-list.
- Search embeddings are hardcoded to 384 dimensions; changing embedding providers requires a full reindex with no automatic compatibility check.
