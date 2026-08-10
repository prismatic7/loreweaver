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
  normalizeCampaignMarkdown: (
    input: string,
    mode?: "save" | "render",
  ) => string;
  setSelectedNoteId: (id: string) => void;
  setSelectedRuleId: (id: string) => void;
  setActiveView: (view: any) => void;
  setIsEditingNote: (editing: boolean) => void;
  setCurrentCanvasFolder: (folder: string | null) => void;
  confirm: (message: string, onConfirm: () => void) => void;
  alert: (message: string) => void;
  handleRollCharacterSheet: (
    alert: (m: string) => void,
    onSave: (note: CampaignNote) => Promise<void>,
  ) => void;
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
        const normalizedNote: CampaignNote = {
          ...note,
          content: normalizedContent,
        };

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
          targetNote.frontmatter?.type === "Canvas" ||
          targetNote.path.endsWith(".canvas");
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
    [
      notes,
      setSelectedNoteId,
      setCurrentCanvasFolder,
      setActiveView,
      setIsEditingNote,
    ],
  );

  const handleSelectCanvas = useCallback(
    (canvasPath: string) => {
      const targetNote = notes.find(
        (n) =>
          n.frontmatter?.canvasPath === canvasPath || n.path === canvasPath,
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
      confirm(
        `Are you sure you want to move "${notePath}" to the trash?`,
        async () => {
          await trashNote(notePath);
        },
      );
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
    confirm(
      "Are you sure you want to permanently delete all items in the trash?",
      async () => {
        await emptyTrash();
      },
    );
  }, [confirm, emptyTrash]);

  const handleDeleteTrashedNote = useCallback(
    (trashNotePath: string) => {
      confirm(
        "Permanently delete this item from disk? This cannot be undone.",
        async () => {
          await deleteTrashedNote(trashNotePath);
        },
      );
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
