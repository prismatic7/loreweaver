# Design: Foundation + Character Sheet Builder

**Date:** 2026-08-10
**Status:** Approved (design), pending spec review
**Slice:** 1 of a larger roadmap (session-running plugins, AI depth, worldbuilding, polish follow later)

## Overview

This slice delivers three changes that unblock the rest of the roadmap and ship the flagship
"Character Sheet Builder with PDF import" feature:

1. **P11 — Reindex command**: a user-facing escape hatch to rebuild all vector embeddings after
   an embedding-provider change.
2. **P15 — App.tsx refactor**: split the 775-line monolith into focused hooks, strictly mechanical
   (no behavior or visual change).
3. **P4 — Character Sheet Builder (modular + PDF import)**: data-driven character sheet templates
   plus a PDF→Markdown import path that renders the PDF as a note first. Field auto-mapping is
   explicitly deferred until the PDF-as-note path is mature.

## Principles

- **System-agnostic**: character sheets are data-driven templates, never hardcoded per game system.
- **Local-first & private**: PDF conversion runs fully on-device via a native Rust crate. No cloud,
  no Python runtime, no model downloads, no GPU.
- **YAGNI**: PDF import renders as a note first. Auto-mapping fields into the template form is out of
  scope for this slice.

## P11 — Reindex Command

### Backend

- New Tauri command `reindex_vault(state)` in `src-tauri/src/lib.rs`.
- Clears and rebuilds all `note_chunks` and `rule_chunks` embeddings from stored content.
- Reuses existing helpers: `search::chunk_text(content, 120, 20)` and `search::generate_embedding`,
  with the same zero-filled 384-dim fallback used by `reindex_rule_chunks`.
- Runs inside `run_blocking` (spawn_blocking) so it does not block the async runtime or hold DB locks
  across I/O.
- Calls `search::invalidate_cache()` on completion.
- Returns `Result<(), String>` per repo convention.

### Frontend

- A "Reindex Vault" button in `SettingsView` (near provider config), gated behind a confirm dialog
  (reuse `ConfirmModal`), with a completion/failure alert (reuse `AlertModal`).
- Wired through a small handler in `App.tsx` (or the new refactored hook).

## P15 — App.tsx Refactor

Strictly mechanical. No behavior change, no visual change, no design change.

- Extract the session-tool state + handlers (scratchpad, dice, image, TTS — currently roughly
  `App.tsx` lines 216–381) into a new hook `useSessionTools`.
- Extract the vault-action confirm/trash/delete/normalize handlers (currently roughly lines 383–482)
  into a new hook `useVaultActions`.
- `App.tsx` becomes a thin composition shell that wires hooks → views.
- Follow existing hook patterns in `src/hooks/` (e.g. `useNotes`, `useRules`).

## P4 — Character Sheet Builder

### Modular templates

- Character sheets are `.templates/*.md` files with YAML frontmatter declaring `properties`
  (reusing the existing `TemplateProperty` schema parsed by `list_templates`) and a body skeleton.
- System-agnostic: D&D, Pathfinder, Call of Cthulhu, etc. each define their own template; nothing is
  hardcoded to a system.

### PDF import (flagship)

1. User picks a PDF in the character-sheet import UI.
2. Backend command `convert_pdf_to_markdown(path)` reads file bytes and calls **pdf-inspector**
   (native Rust crate) → Markdown.
3. pdf-inspector's `pdf_type` classification: if `Scanned`/`ImageBased`, return a clear
   "this PDF is scanned and can't be converted locally" error. No OCR in this slice.
4. The Markdown is rendered as a note for review/edit before saving.

### New backend module

- `src-tauri/src/pdf.rs` wrapping pdf-inspector.
- Add `pdf-inspector` to `src-tauri/Cargo.toml`.
- New command `convert_pdf_to_markdown` in `lib.rs`, registered in the invoke handler.
- Runs in `run_blocking`.

### Frontend

- A dedicated `CharacterSheetView` (a new `AppView` in `AppShell`) that renders a selected template's
  properties as a form, backed by the existing `list_templates` command.
- An "Import from PDF" entry point in that view that calls `convert_pdf_to_markdown`, then opens the
  result as a note for review (no field auto-mapping in this slice).

## Out of Scope (this slice)

- Auto-mapping PDF fields into the template form (deferred until PDF-as-note is mature).
- OCR for scanned PDFs.
- docx/xlsx/epub import (would use `anydoc` later if needed).
- Session-running plugins, AI memory/summaries, graph/timeline, STT/local-TTS, plugin sandbox
  hardening.

## Dependencies & Order

- P11 and P15 are independent and can run in parallel.
- P4 depends on the pdf-inspector crate integration but not on P11/P15.

## Verification

- `npm run build` (the de-facto TypeScript type-check gate).
- `cargo check` for the Rust side (if cargo is available in the environment).
- No test suite exists in the repo; this slice does not add one. If tests are added, update
  `docs/codebase/TESTING.md`.

## Risks

- **pdf-inspector is pre-1.0** (released 2026-07-30). Verify current version and API stability at
  implementation time. Fallback: pin a known-good version.
- **No OCR**: scanned character sheets cannot be converted locally. Surface a clear error and treat
  OCR as a separate future feature.
- **Embedding dimension hardcoded to 384**: the reindex command does not change this; it only rebuilds
  embeddings at the current dimension. A provider change that alters dimensions still requires a
  manual reindex (which P11 now enables).
