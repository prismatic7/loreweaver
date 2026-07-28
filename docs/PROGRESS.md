# Session Progress

## Completed 2026-07-28

- Fixed note and rule trash/delete so filesystem and SQLite/FTS5/vector-chunk state stay consistent.
- Fixed empty folders disappearing after deleting the last note: folder discovery is now filesystem-first and empty folders remain visible.
- Added rules `path` column so rule folders persist and can be deleted atomically.
- Added atomic `delete_rules_folder` backend command.
- Replaced all browser `confirm()` dialogs with a custom React confirm modal using a ref-based callback (avoids stale closures in Tauri WebView).
- Added `list_folders` backend command, registered it in `generate_handler!`, and added it to the Tauri ACL allow-list.
- Updated `notesByFolder` to seed groups from `discoveredFolders` so empty folders render.
- Added 2-second background polling interval to refresh notes/folders from disk.
- Refactored backend DB connection model to a single shared connection to eliminate `DatabaseBusy` lock contention.
- Removed temporary debug logging from frontend and backend.
- Updated docs: `docs/codebase/ARCHITECTURE.md`, `CONCERNS.md`, `CONVENTIONS.md`, `INTEGRATIONS.md`, `user/FEATURES.md`, `developer/API.md`.
- Rebuilt clean production `.app` and `.dmg` bundles.

## Verified

- `npm run build` passes (TypeScript + Vite).
- `npm run tauri build` succeeds.
- Production app launches and initializes search engine.
- Trashing a note moves it to `.trash/` and the parent folder remains visible after the last note is removed.
- Runtime logs are clean (no `[list_folders]` or `[trash_note]` debug spam).

## Blockers

None.

## Next Actions

1. Review the diff before committing.
2. Commit with a conventional commit message.
3. Push/sync with the remote repository.
