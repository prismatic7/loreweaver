import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CampaignNote } from "../types";

export function useNotes(vaultPath: string) {
  const [notes, setNotes] = useState<CampaignNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string>("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editFrontmatter, setEditFrontmatter] = useState<Record<string, any>>({});
  const [trashedNotes, setTrashedNotes] = useState<CampaignNote[]>([]);
  const [discoveredFolders, setDiscoveredFolders] = useState<string[]>([]);
  const [currentCanvasFolder, setCurrentCanvasFolder] = useState<string | null>(
    null,
  );
  const activeEditingNoteIdRef = useRef<string | null>(null);

  const loadNotes = useCallback(async () => {
    try {
      const loadedNotes = await invoke<CampaignNote[]>("load_notes");
      if (loadedNotes) {
        setNotes(loadedNotes);
        if (!selectedNoteId && loadedNotes.length > 0) {
          setSelectedNoteId(loadedNotes[0].id);
        }
      } else {
        setNotes([]);
      }
    } catch (err) {
      console.error("Failed to load notes:", err);
    }
  }, [selectedNoteId]);

  const loadTrashNotes = useCallback(async () => {
    try {
      const res = await invoke<CampaignNote[]>("load_trash_notes");
      if (res) setTrashedNotes(res);
    } catch (err) {
      console.error("Failed to load trash notes:", err);
    }
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const folders = await invoke<string[]>("list_folders");
      setDiscoveredFolders(folders || []);
    } catch (err) {
      console.error("Failed to list folders:", err);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadNotes(), loadTrashNotes(), loadFolders()]);
  }, [loadNotes, loadTrashNotes, loadFolders]);

  useEffect(() => {
    if (!vaultPath) return;
    refresh();
  }, [vaultPath, refresh]);

  useEffect(() => {
    const note = notes.find((n) => n.id === selectedNoteId);
    if (note) {
      setEditTitle(note.title);
      setEditContent(note.content);
      setEditFrontmatter(note.frontmatter || {});
      activeEditingNoteIdRef.current = note.id;
    } else {
      activeEditingNoteIdRef.current = null;
    }
  }, [selectedNoteId, notes]);

  const normalizeCampaignMarkdown = (
    input: string,
    _mode: "save" | "render" = "save",
  ) => {
    if (!input) return "";
    let text = input;
    while (/loreweaver-note:.*loreweaver-note:/.test(text)) {
      text = text.replace(/\[([^\]]+)\]\(loreweaver-note:[^)]+\)/g, "$1");
    }
    text = text.replace(/(?:loreweaver-note:)+/g, "loreweaver-note:");
    return text;
  };

  const saveNote = useCallback(
    async (note: CampaignNote) => {
      try {
        await invoke("save_note", { note });
        await loadNotes();
      } catch (err) {
        console.error("Failed to save note:", err);
        throw err;
      }
    },
    [loadNotes],
  );

  const immediateSave = useCallback(() => {
    if (!selectedNoteId || activeEditingNoteIdRef.current !== selectedNoteId)
      return;
    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note) return;
    const normalizedContent = normalizeCampaignMarkdown(editContent);
    if (
      editTitle === note.title &&
      normalizedContent === note.content &&
      JSON.stringify(editFrontmatter) === JSON.stringify(note.frontmatter)
    ) {
      return;
    }
    const updatedNote: CampaignNote = {
      ...note,
      title: editTitle,
      content: normalizedContent,
      frontmatter: editFrontmatter,
    };
    saveNote(updatedNote).catch((err) =>
      console.error("Immediate save failed:", err),
    );
  }, [selectedNoteId, notes, editTitle, editContent, editFrontmatter, saveNote]);

  const trashNote = useCallback(
    async (notePath: string) => {
      const cleanPath = notePath.replace(/^\/+/, "");
      try {
        activeEditingNoteIdRef.current = null;
        await invoke("trash_note", { notePath: cleanPath });
        await refresh();
        const remaining = notes.filter((n) => n.path !== cleanPath);
        if (remaining.length > 0) {
          setSelectedNoteId(remaining[0].id);
        } else {
          setSelectedNoteId("");
        }
        setIsEditingNote(false);
      } catch (err) {
        console.error("[frontend] trash_note error:", err);
        throw err;
      }
    },
    [notes, refresh],
  );

  const trashFolder = useCallback(
    async (folderName: string) => {
      try {
        activeEditingNoteIdRef.current = null;
        await invoke("trash_folder", { folderPath: folderName });
        await refresh();
      } catch (err) {
        console.error("Error deleting folder:", err);
        throw err;
      }
    },
    [refresh],
  );

  const restoreNote = useCallback(
    async (trashNotePath: string) => {
      try {
        await invoke("restore_note", { trashNotePath });
        await refresh();
      } catch (err) {
        console.error("Error restoring note:", err);
        throw err;
      }
    },
    [refresh],
  );

  const deleteTrashedNote = useCallback(
    async (trashNotePath: string) => {
      try {
        await invoke("delete_trashed_note", { trashNotePath });
        await loadTrashNotes();
      } catch (err) {
        console.error("Error deleting trashed note:", err);
        throw err;
      }
    },
    [loadTrashNotes],
  );

  const emptyTrash = useCallback(async () => {
    try {
      await invoke("empty_trash");
      await loadTrashNotes();
      await loadFolders();
    } catch (err) {
      console.error("Error emptying trash:", err);
      throw err;
    }
  }, [loadTrashNotes, loadFolders]);

  const handleNewNote = useCallback(
    async (folder = "Worldbuilding") => {
      const newId = `note-${Date.now()}`;
      const cleanFolder = folder === "Root" ? "" : folder;
      const prefix = cleanFolder ? `${cleanFolder}/` : "";
      const newNote: CampaignNote = {
        id: newId,
        title: "New Note",
        path: `${prefix}New_Note_${newId}.md`,
        frontmatter: { type: "Note", tags: ["draft"] },
        content: `# New Note\n\nStart writing your campaign details here...`,
      };
      setEditTitle(newNote.title);
      setEditContent(newNote.content);
      setEditFrontmatter(newNote.frontmatter);
      activeEditingNoteIdRef.current = newId;
      try {
        await saveNote(newNote);
        setSelectedNoteId(newId);
        setIsEditingNote(true);
      } catch (err) {
        console.error("Failed to create new note:", err);
      }
    },
    [saveNote],
  );

  const notesByFolder = useMemo<Record<string, CampaignNote[]>>(() => {
    const groups: Record<string, CampaignNote[]> = {};
    discoveredFolders.forEach((folder) => {
      groups[folder] = [];
    });
    notes.forEach((note) => {
      const parts = note.path.split("/");
      let folder = "Root";
      if (parts.length > 1) {
        parts.pop();
        folder = parts.join("/");
      }
      if (!groups[folder]) {
        groups[folder] = [];
      }
      groups[folder].push(note);
    });
    return groups;
  }, [notes, discoveredFolders]);

  const currentNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId),
    [notes, selectedNoteId],
  );

  return {
    notes,
    notesByFolder,
    selectedNoteId,
    setSelectedNoteId,
    currentNote,
    isEditingNote,
    setIsEditingNote,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    editFrontmatter,
    setEditFrontmatter,
    trashedNotes,
    discoveredFolders,
    currentCanvasFolder,
    setCurrentCanvasFolder,
    activeEditingNoteIdRef,
    loadNotes,
    loadTrashNotes,
    loadFolders,
    refresh,
    saveNote,
    immediateSave,
    trashNote,
    trashFolder,
    restoreNote,
    deleteTrashedNote,
    emptyTrash,
    handleNewNote,
    normalizeCampaignMarkdown,
  };
}
