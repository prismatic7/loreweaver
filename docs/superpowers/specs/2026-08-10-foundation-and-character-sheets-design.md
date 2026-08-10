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

- Extract the session-tool state + handlers (scratchpad, dice, image, TTS — the state/handlers named
  `scratchpadText`, `diceHistory`, `diceNotation`, `imagePrompt`, `imageStyle`, `isGeneratingImage`,
  `generatedImageUrl`, `ttsText`, `isGeneratingSpeech`, `generatedSpeechUrl`, `rollDiceNotation`,
  `handleGenerateImage`, `handleGenerateSpeech`) into a new hook `useSessionTools`.
- Extract the vault-action confirm/trash/delete/normalize handlers (`handleNormalizeVaultMarkdown`,
  `handleSelectNoteFromCanvas`, `handleSelectCanvas`, `handleTrashNote`, `handleDeleteRule`,
  `handleEmptyTrash`, `handleDeleteTrashedNote`, `handleRollCharacterSheetCb`,
  `handleEvaluateEncounterThreatCb`) into a new hook `useVaultActions`.
- `App.tsx` becomes a thin composition shell that wires hooks → views.
- Follow existing hook patterns in `src/hooks/` (e.g. `useNotes`, `useRules`).
- **Reference stable identifiers (hook/state/function names), never line numbers** — line numbers
  drift as the file changes.

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
- **AppView wiring touchpoints** (must not be missed): add `"character-sheets"` to the `AppView`
  union type in `src/components/AppShell.tsx`, register the nav entry, and render the new view in
  `App.tsx` alongside the other `activeView === "..."` branches.

## Out of Scope (this slice)

- Auto-mapping PDF fields into the template form (deferred until PDF-as-note is mature).
- OCR for scanned PDFs.
- docx/xlsx/epub import (would use `anydoc` later if needed).
- Session-running plugins, AI memory/summaries, graph/timeline, STT/local-TTS, plugin sandbox
  hardening.

## Dependencies & Order

- P11 and P15 are independent and can run in parallel.
- P4 depends on the pdf-inspector crate integration but not on P11/P15.

## Unattended Execution (overnight small agent)

This slice is designed to be iterated by a small local agent overnight to save token bloat. The
following safeguards are mandatory.

### Preflight (run first, before any code)

1. `cargo --version` and `rustc --version` — confirm the Rust toolchain is available.
2. `npm install` — confirm frontend deps are installed.
3. If **cargo is unavailable**, do **P15 only** and report P11/P4 as **blocked** (never claim Rust
   work compiles without running `cargo check`). Do not attempt Rust edits without verification.

### pdf-inspector spike (before P4 real integration)

- Add `pdf-inspector` to `Cargo.toml` pinned to a known-good version, then run a small throwaway
  compile + API probe (e.g. convert a tiny text PDF) to confirm the crate compiles and the API
  matches the spec.
- If the crate will not compile or the API differs materially, **stop P4** and report the blocker
  rather than guessing at a workaround.

### Definition of Done (per item)

- **P15**: `npm run build` passes; `App.tsx` is a thin shell; no behavior/visual change (diff review).
- **P11**: `cargo check` passes; `reindex_vault` command exists and is registered; Settings button
  wired; `npm run build` passes.
- **P4**: `cargo check` passes; `pdf.rs` module + `convert_pdf_to_markdown` command registered;
  `CharacterSheetView` added to `AppView` and rendered; PDF import opens result as a note;
  `npm run build` passes.

### Stop conditions & iteration cap

- Hard stop on any blocker: cargo missing, pdf-inspector won't compile, or a verification command
  fails twice with no clear fix.
- Iteration cap: max 3 fix attempts per item before stopping and reporting.
- Runtime cap: stop after ~6–8 hours (overnight) regardless of progress.

### Commit discipline

- Commit after each verified item (P15, then P11, then P4) so partial work survives and is
  reviewable. Never commit unverified work.

### Handoff artifact

- Write a progress doc (e.g. `docs/superpowers/progress/2026-08-10-foundation.md`) with: per-item
  status (done/blocked/skipped), captured verification output, and any blockers. This is the
  handoff for the next session.

### Serial order for a single agent

1. Preflight.
2. pdf-inspector spike (isolated, throwaway).
3. **P15** (safe, verifiable win).
4. **P11** (bounded, mechanical).
5. **P4** (riskiest, last, isolated).

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
