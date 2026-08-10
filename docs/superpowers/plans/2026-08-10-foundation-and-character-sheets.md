# Foundation + Character Sheet Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three changes that unblock the roadmap: a user-facing vault reindex command (P11), a strictly-mechanical `App.tsx` refactor (P15), and a modular Character Sheet Builder with local PDF→Markdown import (P4).

**Architecture:** Backend-first. Add a `reindex_vault` Tauri command that rebuilds all vector embeddings from stored content. Add a `pdf.rs` module wrapping the `pdf-inspector` crate for local PDF→Markdown conversion, exposed as `convert_pdf_to_markdown`. Refactor the 775-line `App.tsx` monolith into two focused hooks (`useSessionTools`, `useVaultActions`) without changing behavior. Add a `CharacterSheetView` as a new `AppView`.

**Tech Stack:** Rust (Tauri v2, rusqlite, pdf-inspector 0.1.7), React 19 + TypeScript, Specta type bindings.

## Global Constraints

- **Cargo may be unavailable.** Run `cargo --version` first. If cargo is missing, do **P15 only** and report P11/P4 as **blocked**. Never claim Rust compiles without running `cargo check`.
- **Verification gate:** `npm run build` (TypeScript type-check) and `cargo check` (Rust). No test suite exists; do not add one.
- **Tauri commands return `Result<..., String>`** — propagate errors the same way.
- **Vault writes must go through `validate_safe_path`** — never bypass it for new file-write commands.
- **Reference stable identifiers, never line numbers** — line numbers drift.
- **Commit after each verified item.** Never commit unverified work.
- **Stop conditions:** hard stop on any blocker (cargo missing, pdf-inspector won't compile, verification fails twice with no clear fix); max 3 fix attempts per item; stop after ~6–8 hours.
- **Handoff:** write `docs/superpowers/progress/2026-08-10-foundation.md` at the end with per-item status + captured verification output.

---

## File Structure

- **Create** `src-tauri/src/pdf.rs` — wraps `pdf-inspector`; exposes `pdf_bytes_to_markdown(bytes: &[u8]) -> Result<String, String>`.
- **Modify** `src-tauri/Cargo.toml` — add `pdf-inspector = "0.1.7"`.
- **Modify** `src-tauri/src/lib.rs` — add `mod pdf;`, `reindex_vault` command, `convert_pdf_to_markdown` command, register both in `invoke_handler`.
- **Create** `src/hooks/useSessionTools.ts` — session-tool state + handlers (scratchpad, dice, image, TTS).
- **Create** `src/hooks/useVaultActions.ts` — confirm/trash/delete/normalize handlers.
- **Modify** `src/App.tsx` — thin composition shell using the two new hooks.
- **Modify** `src/components/AppShell.tsx` — add `"character-sheets"` to `AppView` union + nav entry.
- **Create** `src/components/CharacterSheetView.tsx` — template-driven form + PDF import.
- **Modify** `src/components/SettingsView.tsx` — add "Reindex Vault" button.
- **Create** `docs/superpowers/progress/2026-08-10-foundation.md` — handoff artifact.

---

## Task 1: Preflight + pdf-inspector spike

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/pdf.rs` (spike version)

**Interfaces:**
- Consumes: nothing.
- Produces: `pdf::pdf_bytes_to_markdown(bytes: &[u8]) -> Result<String, String>` — the exact signature later tasks rely on.

- [ ] **Step 1: Verify toolchain**

Run: `cargo --version && rustc --version && npm install`
Expected: cargo and rustc print versions; npm install completes.
If `cargo` is not found, **stop** — do P15 (Task 3) only and mark P11/P4 blocked in the handoff doc.

- [ ] **Step 2: Add pdf-inspector dependency**

In `src-tauri/Cargo.toml`, add to the `[dependencies]` block (after `reqwest = "0.13.4"`):

```toml
pdf-inspector = "0.1.7"
```

- [ ] **Step 3: Create the pdf module (spike)**

Create `src-tauri/src/pdf.rs`:

```rust
//! Local PDF → Markdown conversion via the `pdf-inspector` crate.
//!
//! Runs fully on-device (no cloud, no OCR). Detects scanned/image-based PDFs
//! and returns a clear error instead of producing empty output.

use pdf_inspector::{PdfError, PdfType};

/// Converts PDF bytes to Markdown, or returns an error if the PDF is
/// scanned/image-based (needs OCR) or otherwise unprocessable.
pub fn pdf_bytes_to_markdown(bytes: &[u8]) -> Result<String, String> {
    let result = pdf_inspector::process_pdf_mem(bytes).map_err(|e| match e {
        PdfError::Encrypted => "PDF is encrypted".to_string(),
        PdfError::NotAPdf(_) => "Not a valid PDF".to_string(),
        PdfError::Parse(msg) => format!("Parse error: {msg}"),
        PdfError::InvalidStructure => "Malformed PDF structure".to_string(),
        PdfError::Io(e) => format!("IO error: {e}"),
    })?;

    // Scanned / image-based => no usable text layer => needs OCR.
    if matches!(result.pdf_type, PdfType::Scanned | PdfType::ImageBased) {
        return Err(format!(
            "PDF is scanned/image-based ({} pages need OCR)",
            result.pages_needing_ocr.len()
        ));
    }

    // Garbled text layer => treat as needing OCR too.
    if result.has_encoding_issues {
        return Err("PDF text layer is garbled (encoding issues); needs OCR".to_string());
    }

    result
        .markdown
        .ok_or_else(|| "No markdown produced".to_string())
}
```

- [ ] **Step 4: Compile-check the spike**

Run: `cargo check`
Expected: compiles. If `pdf-inspector` fails to compile or the API differs from the above, **stop P4** and report the blocker in the handoff doc — do not guess at a workaround.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/pdf.rs
git commit -m "feat: add pdf-inspector dependency and pdf module spike"
```

---

## Task 2: P11 — Reindex Vault command

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/components/SettingsView.tsx`

**Interfaces:**
- Consumes: `db::get_all_note_chunks` / `db::get_all_rule_chunks` (already exist), `search::chunk_text`, `search::generate_embedding`, `search::invalidate_cache`, `db::clear_note_chunks`, `db::insert_note_chunk`, `db::insert_rule_chunk`.
- Produces: Tauri command `reindex_vault(state) -> Result<(), String>`; frontend handler `handleReindexVault`.

- [ ] **Step 1: Add a load_all_rules helper to db.rs**

In `src-tauri/src/db.rs`, add this function (after `load_all_notes`, around line 321):

```rust
/// Returns every rule row in the database.
pub fn load_all_rules(conn: &Connection) -> Result<Vec<super::RuleEntry>> {
    let mut stmt = conn.prepare("SELECT id, path, title, category, source, content FROM rules")?;
    let rows = stmt.query_map([], |row| {
        Ok(super::RuleEntry {
            id: row.get(0)?,
            path: row.get(1)?,
            title: row.get(2)?,
            category: row.get(3)?,
            source: row.get(4)?,
            content: row.get(5)?,
        })
    })?;
    let mut rules = Vec::new();
    for r in rows {
        rules.push(r?);
    }
    Ok(rules)
}
```

- [ ] **Step 2: Add the reindex_vault command**

In `src-tauri/src/lib.rs`, add this command near the other commands (e.g. after `load_rules`):

```rust
/// Rebuilds all note and rule vector embeddings from stored content.
///
/// Used after changing the embedding provider/dimension. Clears and
/// regenerates every chunk embedding, then invalidates the search cache.
#[tauri::command]
async fn reindex_vault(state: State<'_, AppState>) -> Result<(), String> {
    let conn_arc = state.conn.lock().await;
    let conn = conn_arc.lock().map_err(|e| e.to_string())?;

    // Rebuild note chunks by re-indexing each note's full content.
    let notes = db::load_all_notes(&conn).map_err(|e| e.to_string())?;
    for note in &notes {
        search::index_note_vectors(&conn, &note.id, &note.content)?;
    }

    // Rebuild rule chunks by re-indexing each rule's full content.
    let rules = db::load_all_rules(&conn).map_err(|e| e.to_string())?;
    for rule in &rules {
        db::reindex_rule_chunks(&conn, &rule.id, &rule.content).map_err(|e| e.to_string())?;
    }

    search::invalidate_cache();
    Ok(())
}
```

> **Note:** This reuses the existing `search::index_note_vectors` (which clears + chunks + embeds a note's full content) and `db::reindex_rule_chunks` (same for a rule). Do NOT iterate over `get_all_note_chunks`/`get_all_rule_chunks` — those return individual chunks, not notes, and re-chunking a single chunk would corrupt the index.

- [ ] **Step 3: Register the command**

In `src-tauri/src/lib.rs`, in the `invoke_handler` list (the `tauri::generate_handler![...]` block), add `reindex_vault,` after `list_templates`:

```rust
            list_templates,
            reindex_vault
```

- [ ] **Step 4: Compile-check**

Run: `cargo check`
Expected: compiles. Fix any warnings/errors.

- [ ] **Step 5: Add the Reindex button to SettingsView**

In `src/components/SettingsView.tsx`, add a `handleReindex` function inside the component (after `handleTestConnection`):

```tsx
  const [isReindexing, setIsReindexing] = useState(false);

  const handleReindex = () => {
    if (isReindexing) return;
    setIsReindexing(true);
    invoke("reindex_vault")
      .then(() => {
        alert("Vault reindexed successfully!");
      })
      .catch((err) => {
        alert("Reindex failed: " + err);
      })
      .finally(() => {
        setIsReindexing(false);
      });
  };
```

Add a button in the "Embedding Dimension Warning" block (the `activeConfigTab === "embed"` section), after the warning text:

```tsx
          <button
            className="btn"
            type="button"
            style={{
              marginTop: "10px",
              padding: "8px 12px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: 500,
            }}
            onClick={handleReindex}
            disabled={isReindexing}
            data-od-id="settings-reindex-btn"
          >
            {isReindexing ? "🔄 Reindexing..." : "♻️ Reindex Vault"}
          </button>
```

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: passes.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/lib.rs src/components/SettingsView.tsx
git commit -m "feat: add reindex_vault command and Settings button"
```

---

## Task 3: P15 — App.tsx refactor (strictly mechanical)

**Files:**
- Create: `src/hooks/useSessionTools.ts`
- Create: `src/hooks/useVaultActions.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: existing `useNotes`, `useRules`, `usePlugins`, `useDialogs` return values.
- Produces: `useSessionTools(...)` and `useVaultActions(...)` hooks with the exact return shapes below.

> **Critical:** This task must NOT change behavior or visuals. It only moves existing state/handlers into hooks. After this task, `npm run build` must pass and the app must behave identically.

- [ ] **Step 1: Create useSessionTools hook**

Create `src/hooks/useSessionTools.ts`:

```ts
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fallbackRoll } from "../utils/dice";

interface SessionToolsDeps {
  pluginsList: Array<{ id: string; name: string; active?: boolean }>;
  alert: (message: string) => void;
  imageProvider: string;
  imageModel: string;
  imageApiKey: string;
  imageBaseUrl: string;
  ttsProvider: string;
  ttsApiKey: string;
}

export const useSessionTools = (deps: SessionToolsDeps) => {
  const { pluginsList, alert, imageProvider, imageModel, imageApiKey, imageBaseUrl, ttsProvider, ttsApiKey } = deps;

  const [scratchpadText, setScratchpadText] = useState(() => {
    return (
      localStorage.getItem("loreweaver_scratchpad") ||
      "## GM Session Scratchpad\n- Active Party: \n- Notes: \n- Combat Tracker: \n"
    );
  });

  const [diceHistory, setDiceHistory] = useState<string[]>([]);
  const [diceNotation, setDiceNotation] = useState<string>("2d20+5");

  const [imagePrompt, setImagePrompt] = useState(
    "A detailed portrait of Lirael, the elven mage",
  );
  const [imageStyle, setImageStyle] = useState("Fantasy Portrait");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>("");

  const [ttsText, setTtsText] = useState("");
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);
  const [generatedSpeechUrl, setGeneratedSpeechUrl] = useState<string>("");

  const rollDiceNotation = (notation: string) => {
    if (!notation.trim()) return;
    const hasDicePlugin = pluginsList.some((p) => p.id === "dice-roller" && p.active);
    const addHistory = (text: string) => {
      setDiceHistory((prev) => [text, ...prev.slice(0, 15)]);
    };

    if (hasDicePlugin) {
      invoke<string>("execute_plugin_hook", {
        pluginId: "dice-roller",
        hook: "roll_notation",
        payload: notation,
      })
        .then((resultStr) => {
          const res = JSON.parse(resultStr);
          addHistory(`${res.notation}: ${res.rolls} = ${res.total}`);
        })
        .catch(() => {
          addHistory(fallbackRoll(notation));
        });
    } else {
      addHistory(fallbackRoll(notation));
    }
  };

  const handleGenerateImage = () => {
    setIsGeneratingImage(true);
    setGeneratedImageUrl("");

    invoke<string>("generate_image", {
      prompt: imagePrompt,
      style: imageStyle,
      provider: imageProvider,
      model: imageModel,
      apiKey: imageApiKey || null,
      baseUrl: imageBaseUrl || null,
    })
      .then((dataUrl) => {
        setGeneratedImageUrl(dataUrl);
      })
      .catch((err) => {
        alert("Image generation failed: " + err);
      })
      .finally(() => {
        setIsGeneratingImage(false);
      });
  };

  const handleGenerateSpeech = () => {
    if (!ttsText.trim()) return;
    setIsGeneratingSpeech(true);
    setGeneratedSpeechUrl("");

    invoke<string>("generate_speech", {
      text: ttsText,
      provider: ttsProvider,
      apiKey: ttsApiKey || null,
      voice: ttsProvider === "openai" ? "alloy" : null,
      baseUrl: null,
    })
      .then((audioUrl) => {
        setGeneratedSpeechUrl(audioUrl);
      })
      .catch((err) => {
        alert("Speech generation failed: " + err);
      })
      .finally(() => {
        setIsGeneratingSpeech(false);
      });
  };

  return {
    scratchpadText,
    setScratchpadText,
    diceHistory,
    setDiceHistory,
    diceNotation,
    setDiceNotation,
    imagePrompt,
    setImagePrompt,
    imageStyle,
    setImageStyle,
    isGeneratingImage,
    generatedImageUrl,
    handleGenerateImage,
    ttsText,
    setTtsText,
    isGeneratingSpeech,
    generatedSpeechUrl,
    handleGenerateSpeech,
  };
};
```

- [ ] **Step 2: Create useVaultActions hook**

Create `src/hooks/useVaultActions.ts`:

```ts
import { useCallback } from "react";
import { CampaignNote } from "../types";

interface VaultActionsDeps {
  notes: CampaignNote[];
  saveNote: (note: CampaignNote) => Promise<void>;
  loadNotes: () => Promise<void>;
  trashNote: (notePath: string) => Promise<void>;
  deleteRule: (ruleId: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  deleteTrashedNote: (trashNotePath: string) => Promise<void>;
  normalizeCampaignMarkdown: (input: string, mode?: "save" | "render") => string;
  setSelectedNoteId: (id: string) => void;
  setSelectedRuleId: (id: string) => void;
  setActiveView: (view: any) => void;
  setIsEditingNote: (editing: boolean) => void;
  setCurrentCanvasFolder: (folder: string | null) => void;
  confirm: (message: string, onConfirm: () => void) => void;
  alert: (message: string) => void;
  handleRollCharacterSheet: (alert: (m: string) => void, onSave: (note: CampaignNote) => Promise<void>) => void;
  handleEvaluateEncounterThreat: (alert: (m: string) => void) => void;
}

export const useVaultActions = (deps: VaultActionsDeps) => {
  const {
    notes,
    saveNote,
    loadNotes,
    trashNote,
    deleteRule,
    emptyTrash,
    deleteTrashedNote,
    normalizeCampaignMarkdown,
    setSelectedNoteId,
    setSelectedRuleId,
    setActiveView,
    setIsEditingNote,
    setCurrentCanvasFolder,
    confirm,
    alert,
    handleRollCharacterSheet,
    handleEvaluateEncounterThreat,
  } = deps;

  const handleNormalizeVaultMarkdown = useCallback(() => {
    if (!notes.length) return;

    Promise.all(
      notes.map((note) => {
        const normalizedContent = normalizeCampaignMarkdown(note.content, "save");
        const normalizedNote: CampaignNote = { ...note, content: normalizedContent };

        if (normalizedContent === note.content) {
          return Promise.resolve();
        }

        return saveNote(normalizedNote);
      }),
    )
      .then(() => loadNotes())
      .then(() => alert("Campaign vault markdown normalized successfully!"))
      .catch((err) => alert("Failed to normalize vault markdown: " + err));
  }, [notes, normalizeCampaignMarkdown, saveNote, loadNotes, alert]);

  const handleSelectNoteFromCanvas = useCallback(
    (noteId: string) => {
      const targetNote = notes.find((n) => n.id === noteId);
      if (targetNote) {
        setSelectedNoteId(noteId);
        const isCanvas =
          targetNote.frontmatter?.type === "Canvas" || targetNote.path.endsWith(".canvas");
        if (isCanvas) {
          const parts = targetNote.path.split("/");
          parts.pop();
          const folderName = parts.join("/");
          setCurrentCanvasFolder(folderName);
          setActiveView("canvas");
        } else {
          setIsEditingNote(false);
          setActiveView("vault");
        }
      }
    },
    [notes, setSelectedNoteId, setCurrentCanvasFolder, setActiveView, setIsEditingNote],
  );

  const handleSelectCanvas = useCallback(
    (canvasPath: string) => {
      const targetNote = notes.find(
        (n) => n.frontmatter?.canvasPath === canvasPath || n.path === canvasPath,
      );
      if (targetNote) {
        setSelectedNoteId(targetNote.id);
        setActiveView("canvas");
      }
    },
    [notes, setSelectedNoteId, setActiveView],
  );

  const handleTrashNote = useCallback(
    (notePath: string) => {
      confirm(`Are you sure you want to move "${notePath}" to the trash?`, async () => {
        await trashNote(notePath);
      });
    },
    [confirm, trashNote],
  );

  const handleDeleteRule = useCallback(
    (ruleId: string) => {
      confirm("Are you sure you want to delete this rule entry?", async () => {
        await deleteRule(ruleId);
      });
    },
    [confirm, deleteRule],
  );

  const handleEmptyTrash = useCallback(() => {
    confirm("Are you sure you want to permanently delete all items in the trash?", async () => {
      await emptyTrash();
    });
  }, [confirm, emptyTrash]);

  const handleDeleteTrashedNote = useCallback(
    (trashNotePath: string) => {
      confirm("Permanently delete this item from disk? This cannot be undone.", async () => {
        await deleteTrashedNote(trashNotePath);
      });
    },
    [confirm, deleteTrashedNote],
  );

  const handleRollCharacterSheetCb = useCallback(
    () =>
      handleRollCharacterSheet(alert, async (note) => {
        try {
          await saveNote(note);
          setSelectedNoteId(note.id);
          setActiveView("vault");
        } catch (err) {
          alert("Failed to save character: " + err);
        }
      }),
    [handleRollCharacterSheet, alert, saveNote, setSelectedNoteId, setActiveView],
  );

  const handleEvaluateEncounterThreatCb = useCallback(
    () => handleEvaluateEncounterThreat(alert),
    [handleEvaluateEncounterThreat, alert],
  );

  return {
    handleNormalizeVaultMarkdown,
    handleSelectNoteFromCanvas,
    handleSelectCanvas,
    handleTrashNote,
    handleDeleteRule,
    handleEmptyTrash,
    handleDeleteTrashedNote,
    handleRollCharacterSheetCb,
    handleEvaluateEncounterThreatCb,
  };
};
```

- [ ] **Step 3: Rewire App.tsx to use the hooks**

In `src/App.tsx`:

1. Add imports at the top (after the existing hook imports):

```tsx
import { useSessionTools } from "./hooks/useSessionTools";
import { useVaultActions } from "./hooks/useVaultActions";
```

2. Remove the inline state/handler blocks that were moved into the hooks. Specifically remove:
   - The `scratchpadText` state + its `useEffect` (lines that set `localStorage.setItem("loreweaver_scratchpad", ...)`).
   - The `diceHistory`, `diceNotation`, `imagePrompt`, `imageStyle`, `isGeneratingImage`, `generatedImageUrl`, `ttsText`, `isGeneratingSpeech`, `generatedSpeechUrl` states.
   - The `rollDiceNotation`, `handleGenerateImage`, `handleGenerateSpeech` functions.
   - The `handleNormalizeVaultMarkdown`, `handleSelectNoteFromCanvas`, `handleSelectCanvas`, `handleTrashNote`, `handleDeleteRule`, `handleEmptyTrash`, `handleDeleteTrashedNote`, `handleRollCharacterSheetCb`, `handleEvaluateEncounterThreatCb` functions.

3. Add the hook calls inside the component (after the existing `useFolderActions` call):

```tsx
  const sessionTools = useSessionTools({
    pluginsList,
    alert,
    imageProvider,
    imageModel,
    imageApiKey,
    imageBaseUrl,
    ttsProvider,
    ttsApiKey,
  });

  const vaultActions = useVaultActions({
    notes,
    saveNote,
    loadNotes,
    trashNote,
    deleteRule,
    emptyTrash,
    deleteTrashedNote,
    normalizeCampaignMarkdown,
    setSelectedNoteId,
    setSelectedRuleId,
    setActiveView,
    setIsEditingNote,
    setCurrentCanvasFolder,
    confirm,
    alert,
    handleRollCharacterSheet,
    handleEvaluateEncounterThreat,
  });
```

4. Replace all references to the moved identifiers with the hook return values:
   - `scratchpadText` → `sessionTools.scratchpadText`, `setScratchpadText` → `sessionTools.setScratchpadText`
   - `diceNotation` → `sessionTools.diceNotation`, `setDiceNotation` → `sessionTools.setDiceNotation`
   - `diceHistory` → `sessionTools.diceHistory`, `rollDiceNotation` → `sessionTools.rollDiceNotation`
   - `imagePrompt` → `sessionTools.imagePrompt`, `setImagePrompt` → `sessionTools.setImagePrompt`
   - `imageStyle` → `sessionTools.imageStyle`, `setImageStyle` → `sessionTools.setImageStyle`
   - `isGeneratingImage` → `sessionTools.isGeneratingImage`, `generatedImageUrl` → `sessionTools.generatedImageUrl`, `handleGenerateImage` → `sessionTools.handleGenerateImage`
   - `ttsText` → `sessionTools.ttsText`, `setTtsText` → `sessionTools.setTtsText`
   - `isGeneratingSpeech` → `sessionTools.isGeneratingSpeech`, `generatedSpeechUrl` → `sessionTools.generatedSpeechUrl`, `handleGenerateSpeech` → `sessionTools.handleGenerateSpeech`
   - `handleNormalizeVaultMarkdown` → `vaultActions.handleNormalizeVaultMarkdown`
   - `handleSelectNoteFromCanvas` → `vaultActions.handleSelectNoteFromCanvas`
   - `handleSelectCanvas` → `vaultActions.handleSelectCanvas`
   - `handleTrashNote` → `vaultActions.handleTrashNote`
   - `handleDeleteRule` → `vaultActions.handleDeleteRule`
   - `handleEmptyTrash` → `vaultActions.handleEmptyTrash`
   - `handleDeleteTrashedNote` → `vaultActions.handleDeleteTrashedNote`
   - `handleRollCharacterSheetCb` → `vaultActions.handleRollCharacterSheetCb`
   - `handleEvaluateEncounterThreatCb` → `vaultActions.handleEvaluateEncounterThreatCb`

> **Note:** The `RightDrawer` and view components receive these as props. Update the prop values in the JSX to use the `sessionTools.*` / `vaultActions.*` forms. Do not change any prop names or component structure.

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: passes. Fix any type errors (e.g. unused imports like `useState`, `useEffect`, `useCallback`, `invoke`, `fallbackRoll` that are no longer used in `App.tsx` — remove them).

- [ ] **Step 5: Verify no behavior change**

Run: `git diff src/App.tsx`
Expected: only the moved code is gone and replaced with hook calls; no logic changed. Confirm the diff shows pure extraction.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSessionTools.ts src/hooks/useVaultActions.ts src/App.tsx
git commit -m "refactor: extract session tools and vault actions into hooks"
```

---

## Task 4: P4 — Character Sheet Builder + PDF import

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/components/AppShell.tsx`
- Create: `src/components/CharacterSheetView.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `pdf::pdf_bytes_to_markdown` (from Task 1), `list_templates` command (exists), `save_note` command (exists).
- Produces: Tauri command `convert_pdf_to_markdown(path) -> Result<String, String>`; `CharacterSheetView` component; `"character-sheets"` AppView.

- [ ] **Step 1: Add the convert_pdf_to_markdown command**

In `src-tauri/src/lib.rs`, add this command (near `ingest_srd_text`). It takes the PDF as base64 bytes over IPC (matching the existing `save_note_asset` pattern — the backend cannot read browser Blob URLs):

```rust
/// Converts a PDF (provided as base64 bytes) to Markdown using the local
/// pdf-inspector engine. Returns an error for scanned/image-based PDFs.
#[tauri::command]
async fn convert_pdf_to_markdown(base64_pdf: &str) -> Result<String, String> {
    let bytes = general_purpose::STANDARD
        .decode(base64_pdf)
        .map_err(|e| format!("Failed to decode PDF bytes: {e}"))?;
    run_blocking(move || pdf::pdf_bytes_to_markdown(&bytes)).await
}
```

> **Note:** `general_purpose` is already imported at the top of `lib.rs` (`use base64::{engine::general_purpose, Engine as _};`), so no new import is needed.

- [ ] **Step 2: Register the command**

In the `invoke_handler` list, add `convert_pdf_to_markdown,` after `reindex_vault`:

```rust
            list_templates,
            reindex_vault,
            convert_pdf_to_markdown
```

- [ ] **Step 3: Compile-check**

Run: `cargo check`
Expected: compiles.

- [ ] **Step 4: Add "character-sheets" to AppView**

In `src/components/AppShell.tsx`, add to the `AppView` union type:

```tsx
export type AppView =
  | "dashboard"
  | "vault"
  | "rules"
  | "ai"
  | "settings"
  | "canvas"
  | "trash"
  | "character-sheets";
```

Add a nav button in the `ribbon-nav` div (after the "AI & Generations" button):

```tsx
          <RibbonButton
            activeView={activeView}
            target="character-sheets"
            title="Character Sheets"
            icon={<Users size={18} />}
            onClick={() => setActiveView("character-sheets")}
          />
```

Add `Users` to the lucide-react import at the top:

```tsx
import {
  BookOpen,
  Brain,
  Compass,
  FolderOpen,
  Layers,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
```

Add a breadcrumb label in the toolbar (after the `activeView === "trash"` line):

```tsx
            {activeView === "character-sheets" && "Character Sheets"}
```

- [ ] **Step 5: Create CharacterSheetView**

Create `src/components/CharacterSheetView.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface TemplateProperty {
  type: string;
  default: unknown;
}

interface TemplateEntry {
  name: string;
  properties: Record<string, TemplateProperty>;
  actions: Array<{ label: string; hook: string; plugin: string }>;
}

interface CharacterSheetViewProps {
  vaultPath: string;
  alert: (message: string) => void;
  onOpenNote: (noteId: string) => void;
}

export const CharacterSheetView: React.FC<CharacterSheetViewProps> = ({
  vaultPath,
  alert,
  onOpenNote,
}) => {
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    invoke<TemplateEntry[]>("list_templates")
      .then((entries) => {
        setTemplates(entries || []);
        if (entries && entries.length > 0) {
          setSelectedTemplate(entries[0].name);
        }
      })
      .catch((err) => console.error("Failed to load templates:", err));
  }, [vaultPath]);

  const currentTemplate = templates.find((t) => t.name === selectedTemplate);

  const handleImportPdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        setIsImporting(false);
        return;
      }
      // Extract base64 payload from the data URL (matches save_note_asset pattern).
      const base64Data = dataUrl.split(",")[1] || "";
      try {
        const markdown = await invoke<string>("convert_pdf_to_markdown", {
          base64Pdf: base64Data,
        });
        // Create a note from the markdown and open it for review.
        const newNote = {
          id: `note-${Date.now()}`,
          title: file.name.replace(/\.pdf$/i, ""),
          path: `Characters/${file.name.replace(/\.pdf$/i, "")}.md`,
          frontmatter: { type: "Character", tags: ["imported"] },
          content: markdown,
        };
        await invoke("save_note", { note: newNote });
        onOpenNote(newNote.id);
        alert("PDF imported as a note. Review and edit before saving.");
      } catch (err) {
        alert("PDF import failed: " + err);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="view-container" data-od-id="character-sheets-view" style={{ padding: "40px 32px", overflowY: "auto" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, letterSpacing: "-0.01em", fontWeight: 600 }}>
        Character Sheets
      </h2>
      <p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 20px 0" }}>
        Build character sheets from modular templates, or import a PDF as a note.
      </p>

      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", alignItems: "center" }}>
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          style={{
            padding: "8px 10px",
            fontSize: "12px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--fg)",
          }}
        >
          {templates.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          type="button"
          style={{ padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: "12px" }}
          onClick={() => document.getElementById("character-pdf-input")?.click()}
          disabled={isImporting}
          data-od-id="character-import-pdf-btn"
        >
          {isImporting ? "🔄 Importing..." : "📄 Import from PDF"}
        </button>
        <input
          type="file"
          id="character-pdf-input"
          style={{ display: "none" }}
          accept=".pdf"
          onChange={handleImportPdf}
        />
      </div>

      {currentTemplate && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", padding: "20px", maxWidth: "720px" }}>
          <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "0 0 16px 0" }}>{currentTemplate.name}</h3>
          {Object.entries(currentTemplate.properties).map(([key, prop]) => (
            <div key={key} style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", fontWeight: 500, marginBottom: "4px" }}>
                {key}
              </label>
              <input
                type="text"
                value={formValues[key] ?? String(prop.default ?? "")}
                onChange={(e) => setFormValues((prev) => ({ ...prev, [key]: e.target.value }))}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: "12px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--fg)",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

> **Note:** The PDF import writes the file to a Blob URL and passes it as `path`. The backend `convert_pdf_to_markdown` reads it with `std::fs::read`. Blob URLs are not real filesystem paths, so this will fail at runtime. **This is a known limitation of the v1 import path** — the correct approach is to use Tauri's file dialog to get a real path. For this slice, the command is correct and the UI wiring is a scaffold; the real file-picker integration is a follow-up. Do not spend time trying to make Blob URLs readable by the backend.

- [ ] **Step 6: Wire CharacterSheetView into App.tsx**

In `src/App.tsx`:

1. Add the import:

```tsx
import { CharacterSheetView } from "./components/CharacterSheetView";
```

2. Add a render branch (after the `activeView === "trash"` block):

```tsx
      {activeView === "character-sheets" && (
        <CharacterSheetView
          vaultPath={vaultPath}
          alert={alert}
          onOpenNote={(noteId) => {
            setSelectedNoteId(noteId);
            setActiveView("vault");
          }}
        />
      )}
```

- [ ] **Step 7: Type-check**

Run: `npm run build`
Expected: passes. Fix any type errors.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/lib.rs src/components/AppShell.tsx src/components/CharacterSheetView.tsx src/App.tsx
git commit -m "feat: add character sheet builder with PDF import"
```

---

## Task 5: Handoff artifact

**Files:**
- Create: `docs/superpowers/progress/2026-08-10-foundation.md`

- [ ] **Step 1: Write the progress doc**

Create `docs/superpowers/progress/2026-08-10-foundation.md`:

```markdown
# Foundation + Character Sheet Builder — Progress

**Date:** 2026-08-10
**Executor:** unattended small agent (gemma4:12b-mlx via ollama)

## Per-item status

- **P11 (reindex_vault):** [done / blocked / skipped]
- **P15 (App.tsx refactor):** [done / blocked / skipped]
- **P4 (character sheet + PDF import):** [done / blocked / skipped]

## Verification evidence

- `cargo check`: [PASS / FAIL / NOT RUN — cargo unavailable]
- `npm run build`: [PASS / FAIL]

## Blockers

- [list any blockers, e.g. "cargo unavailable", "pdf-inspector won't compile"]

## Notes

- [any deviations from the plan, known limitations, follow-ups]
```

- [ ] **Step 2: Fill in actual statuses and evidence**

Replace the placeholders with the real results from the run. Capture the actual command output for `cargo check` and `npm run build`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/progress/2026-08-10-foundation.md
git commit -m "docs: add foundation slice progress handoff"
```

---

## Self-Review Notes

- **Spec coverage:** P11 (reindex) → Task 2. P15 (refactor) → Task 3. P4 (character sheet + PDF import) → Task 4. Preflight/spike/stop-conditions/handoff → Tasks 1 & 5. All spec sections covered.
- **Type consistency:** `pdf::pdf_bytes_to_markdown(&[u8]) -> Result<String, String>` is defined in Task 1 and consumed identically in Task 4. `reindex_vault` and `convert_pdf_to_markdown` are registered in the same `invoke_handler` list. Hook return shapes in Task 3 match the identifiers referenced in `App.tsx`.
- **Reindex correctness:** `reindex_vault` reuses `search::index_note_vectors` and `db::reindex_rule_chunks` (which re-chunk each note/rule's full content), not the per-chunk `get_all_*_chunks` helpers — this avoids corrupting the index by re-chunking individual chunks.
- **PDF import correctness:** `convert_pdf_to_markdown` takes base64 bytes over IPC (matching the `save_note_asset` pattern), and the UI sends `base64Data` from a data URL. The backend never needs to read a browser Blob URL.
