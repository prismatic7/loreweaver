# Concerns

## Highest-Risk Areas

- The plugin system runs JavaScript in Boa with a strict permission allow-list (only `"hooks"`), no host bindings (no fs/network/process), a 1 MiB script cap, 32 KiB payload cap, loop-iteration/recursion/stack limits, and a 5 s wall-clock timeout. **Accepted residual risk:** Boa 0.19 exposes no heap-memory cap, so a plugin that allocates unbounded memory (e.g. `new Array(1e9)`) is bounded only by process memory. Plugins are installed by the user (not untrusted third parties), so this is a low-severity accepted risk.
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
- **Plugin Sandbox Isolation:** The plugin system uses the Boa JS engine with a strict permission allow-list, no host bindings, and explicit loop-iteration/recursion/stack limits plus a 5 s wall-clock timeout. **Hardened 2026-08-21:** recursion limit tightened to 256 and stack limit to 512 (from Boa defaults), applied consistently via `apply_runtime_limits` in both the load-time dry-run and hook execution. A heap-memory cap is not possible in Boa 0.19 and remains an accepted low-severity risk (plugins are user-installed, not untrusted).

## Evidence

- [src/App.tsx](/Users/chris/Development/loreweaver/src/App.tsx)
- [src-tauri/src/plugins.rs](/Users/chris/Development/loreweaver/src-tauri/src/plugins.rs)
- [src-tauri/src/search.rs](/Users/chris/Development/loreweaver/src-tauri/src/search.rs)
- [src-tauri/src/watcher.rs](/Users/chris/Development/loreweaver/src-tauri/src/watcher.rs)
- [src-tauri/src/lib.rs](/Users/chris/Development/loreweaver/src-tauri/src/lib.rs)
- [README.md](/Users/chris/Development/loreweaver/README.md)
- [ARCHITECTURE.md](/Users/chris/Development/loreweaver/ARCHITECTURE.md)
