# Concerns

## Highest-Risk Areas

- The plugin system executes JavaScript with Boa, but the inspected code does not show a strong isolation boundary, permission model, or per-plugin sandbox beyond script evaluation.
- The image generation UI is presented as a feature, but the current implementation is only a timed placeholder that swaps in a static image path.
- The app depends on runtime model downloads from Hugging Face for embeddings, which creates a startup/network dependency and a possible offline failure mode.
- The search pipeline assumes 384-dimensional embeddings throughout; changing providers requires a full reindex and the code does not show automatic compatibility enforcement.

## Maintainability Risks

- `src/App.tsx` is a very large component that owns navigation, vault editing, settings, chat, search, dice rolling, and plugin entry points in one file.
- The frontend still uses `any` in several places, which weakens the value of strict TypeScript settings.

## Validation Gaps

- The workspace has limited automated test coverage. `npm run build` and `npm run tauri build` serve as the current type-check and compile gates.

## Intent vs Reality

- README-level claims about image generation, memory backends, and broader orchestration are ahead of what the inspected source currently implements.
- The app looks like a product prototype with real persistence/search/plugin plumbing, but not a fully complete multi-modal system yet.

## Decided Decisions & Status

- **Image Generation Panel:** The image generation panel will remain a timed placeholder demonstration for now. Real ComfyUI/Stable Diffusion backend integration remains planned for a future release.
- **Plugin Sandbox Isolation:** The plugin system will continue utilizing the lightweight Boa JS engine with basic permission checks. Hardening sandbox isolation beyond basic scope bounds is deferred until security threat models are fully evaluated.

## Evidence

- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [src-tauri/src/plugins.rs](/Users/chris/Development/loreweaver/src-tauri/src/plugins.rs)
- [src-tauri/src/search.rs](/Users/chris/Development/loreweaver/src-tauri/src/search.rs)
- [src-tauri/src/watcher.rs](/Users/chris/Development/loreweaver/src-tauri/src/watcher.rs)
- [src-tauri/src/lib.rs](/Users/chris/Development/loreweaver/src-tauri/src/lib.rs)
- [README.md](/Users/chris/Development/loreweaver/README.md)
- [ARCHITECTURE.md](/Users/chris/Development/loreweaver/ARCHITECTURE.md)
