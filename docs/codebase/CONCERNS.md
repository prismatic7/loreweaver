# Concerns

## Highest-Risk Areas

- The plugin system executes JavaScript with Boa, but the inspected code does not show a strong isolation boundary, permission model, or per-plugin sandbox beyond script evaluation.
- The image generation UI is presented as a feature, but the current implementation is only a timed placeholder that swaps in a static image path.
- The app depends on runtime model downloads from Hugging Face for embeddings, which creates a startup/network dependency and a possible offline failure mode.
- The search pipeline assumes 384-dimensional embeddings throughout; changing providers requires a full reindex and the code does not show automatic compatibility enforcement.

## Maintainability Risks

- `src/App.tsx` is a very large component that owns navigation, vault editing, settings, chat, search, dice rolling, and plugin entry points in one file.
- The frontend still uses `any` in several places, which weakens the value of strict TypeScript settings.
- The Rust backend relies on watcher-driven persistence after writing notes to disk, so the DB state is indirectly synchronized instead of being updated in the same call path.

## Validation Gaps

- I could not run the Rust backend compiler in this environment because Cargo is unavailable.
- The workspace is not a git checkout here, so I could not inspect churn with `git log`.

## Intent vs Reality

- README-level claims about image generation, memory backends, and broader orchestration are ahead of what the inspected source currently implements.
- The app looks like a product prototype with real persistence/search/plugin plumbing, but not a fully complete multi-modal system yet.

## [ASK USER]

- Should the image-generation panel remain a placeholder for now, or should I wire it to a real backend command and model runner?
- Should the plugin system stay Boa-based and lightweight, or do you want a stronger sandbox and permission model before feature work expands further?

## Evidence

- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [src-tauri/src/plugins.rs](/Users/chris/Development/loreweaver/src-tauri/src/plugins.rs)
- [src-tauri/src/search.rs](/Users/chris/Development/loreweaver/src-tauri/src/search.rs)
- [src-tauri/src/watcher.rs](/Users/chris/Development/loreweaver/src-tauri/src/watcher.rs)
- [src-tauri/src/lib.rs](/Users/chris/Development/loreweaver/src-tauri/src/lib.rs)
- [README.md](/Users/chris/Development/loreweaver/README.md)
- [ARCHITECTURE.md](/Users/chris/Development/loreweaver/ARCHITECTURE.md)
