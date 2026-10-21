import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CampaignNote } from "../types";
import { buildNoteScaffold } from "../utils/templates";
import type { UndoEntry } from "./useUndo";

export function useNotes(
  vaultPath: string,
  pushUndo?: (entry: UndoEntry) => void,
) {
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

  // Debounced autosave: persist edits ~1500ms after the user stops typing.
  // immediateSave() already no-ops when the note is unmodified, so this never
  // issues spurious save_note invocations.
  useEffect(() => {
    if (!isEditingNote || !selectedNoteId) return;
    const timer = setTimeout(() => {
      immediateSave();
    }, 1500);
    return () => clearTimeout(timer);
  }, [isEditingNote, selectedNoteId, editTitle, editContent, editFrontmatter, immediateSave]);

  const trashNote = useCallback(
    async (notePath: string) => {
      const cleanPath = notePath.replace(/^\/+/, "");
      try {
        activeEditingNoteIdRef.current = null;
        const trashPath = await invoke<string>("trash_note", { notePath: cleanPath });
        await refresh();
        const remaining = notes.filter((n) => n.path !== cleanPath);
        if (remaining.length > 0) {
          setSelectedNoteId(remaining[0].id);
        } else {
          setSelectedNoteId("");
        }
        setIsEditingNote(false);
        pushUndo?.({
          label: `Trash "${cleanPath}"`,
          key: `trash:${cleanPath}`,
          undo: async () => {
            await invoke("restore_note", { trashNotePath: trashPath });
            await refresh();
          },
          redo: async () => {
            await invoke("trash_note", { notePath: cleanPath });
            await refresh();
          },
        });
      } catch (err) {
        console.error("[frontend] trash_note error:", err);
        throw err;
      }
    },
    [notes, refresh, pushUndo],
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
        const trashed = trashedNotes.find((n) => n.path === trashNotePath);
        const originalPath =
          (trashed?.frontmatter?.original_path as string | undefined) ?? null;
        await invoke("restore_note", { trashNotePath });
        await refresh();
        if (originalPath) {
          pushUndo?.({
            label: `Restore "${trashed?.title ?? trashNotePath}"`,
            key: `restore:${originalPath}`,
            undo: async () => {
              await invoke("trash_note", { notePath: originalPath });
              await refresh();
            },
            redo: async () => {
              await invoke("restore_note", { trashNotePath });
              await refresh();
            },
          });
        }
      } catch (err) {
        console.error("Error restoring note:", err);
        throw err;
      }
    },
    [refresh, trashedNotes, pushUndo],
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
    async (folder = "Worldbuilding", templateType?: string) => {
      const newId = `note-${Date.now()}`;
      const cleanFolder = folder === "Root" ? "" : folder;
      const prefix = cleanFolder ? `${cleanFolder}/` : "";
      const scaffold = templateType
        ? buildNoteScaffold(templateType, "New Note")
        : null;
      const newNote: CampaignNote = {
        id: newId,
        title: "New Note",
        path: `${prefix}New_Note_${newId}.md`,
        frontmatter: scaffold
          ? { ...scaffold.frontmatter, tags: ["draft"] }
          : { type: "Note", tags: ["draft"] },
        content: scaffold
          ? scaffold.content
          : `# New Note\n\nStart writing your campaign details here...`,
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

  const createFolder = useCallback(
    async (folderPath: string) => {
      const clean = folderPath.replace(/^\/+|\/+$/g, "");
      if (!clean) return;
      try {
        await invoke("create_folder", { folderPath: clean });
        await loadFolders();
      } catch (err) {
        console.error("Failed to create folder:", err);
        throw err;
      }
    },
    [loadFolders],
  );

  const renameNote = useCallback(
    async (note: CampaignNote, newTitle: string) => {
      const parts = note.path.split("/");
      parts.pop();
      const dir = parts.join("/");
      const sanitized = newTitle.trim().replace(/[\\/:*?"<>|]/g, "_");
      const newPath = dir ? `${dir}/${sanitized}.md` : `${sanitized}.md`;
      if (newPath === note.path && note.title === newTitle.trim()) return;

      try {
        const updated = await invoke<CampaignNote>("rename_note", {
          oldPath: note.path,
          newPath,
        });
        await refresh();
        if (selectedNoteId === note.id) {
          setEditTitle(updated.title);
        }
        pushUndo?.({
          label: `Rename "${note.title}"`,
          key: `rename:${note.id}`,
          undo: async () => {
            await invoke("rename_note", { oldPath: newPath, newPath: note.path });
            await refresh();
          },
          redo: async () => {
            await invoke("rename_note", { oldPath: note.path, newPath });
            await refresh();
          },
        });
      } catch (err) {
        console.error("Failed to rename note:", err);
        throw err;
      }
    },
    [refresh, selectedNoteId, pushUndo],
  );

  const renameFolder = useCallback(
    async (oldFolder: string, newFolderName: string) => {
      const cleanOld = oldFolder.replace(/^\/+|\/+$/g, "");
      const parts = cleanOld.split("/");
      parts.pop();
      const parent = parts.join("/");
      const sanitized = newFolderName.trim().replace(/[\\/:*?"<>|]/g, "_");
      const newFolder = parent ? `${parent}/${sanitized}` : sanitized;
      if (newFolder === cleanOld) return;

      try {
        await invoke<CampaignNote[]>("rename_folder", {
          oldFolder: cleanOld,
          newFolder,
        });
        await refresh();
      } catch (err) {
        console.error("Failed to rename folder:", err);
        throw err;
      }
    },
    [refresh],
  );

  const moveNote = useCallback(
    async (notePath: string, targetFolder: string) => {
      const cleanTarget = targetFolder.replace(/^\/+|\/+$/g, "");
      const parts = notePath.split("/");
      const filename = parts.pop() || "Note.md";
      const originalFolder = parts.join("/");
      const newPath = cleanTarget ? `${cleanTarget}/${filename}` : filename;
      try {
        await invoke<CampaignNote>("move_note", {
          notePath,
          targetFolder: cleanTarget,
        });
        await refresh();
        pushUndo?.({
          label: `Move "${filename}"`,
          key: `move:${notePath}`,
          undo: async () => {
            await invoke("move_note", { notePath: newPath, targetFolder: originalFolder });
            await refresh();
          },
          redo: async () => {
            await invoke("move_note", { notePath, targetFolder: cleanTarget });
            await refresh();
          },
        });
      } catch (err) {
        console.error("Failed to move note:", err);
        throw err;
      }
    },
    [refresh, pushUndo],
  );

  const moveFolder = useCallback(
    async (folderPath: string, targetFolder: string) => {
      const cleanFolder = folderPath.replace(/^\/+|\/+$/g, "");
      const folderName = cleanFolder.split("/").pop() || cleanFolder;
      const cleanTarget = targetFolder.replace(/^\/+|\/+$/g, "");
      const newFolder = cleanTarget ? `${cleanTarget}/${folderName}` : folderName;
      if (newFolder === cleanFolder) return;

      try {
        await invoke<CampaignNote[]>("rename_folder", {
          oldFolder: cleanFolder,
          newFolder,
        });
        await refresh();
      } catch (err) {
        console.error("Failed to move folder:", err);
        throw err;
      }
    },
    [refresh],
  );

  const duplicateNote = useCallback(
    async (note: CampaignNote) => {
      const newId = `note-${Date.now()}`;
      const parts = note.path.split("/");
      const filename = parts.pop() || "Note.md";
      const dir = parts.join("/");
      const base = filename.replace(/\.md$/, "");
      const newFilename = `${base}_Copy.md`;
      const newPath = dir ? `${dir}/${newFilename}` : newFilename;
      const copyNote: CampaignNote = {
        ...note,
        id: newId,
        title: `${note.title} (Copy)`,
        path: newPath,
      };
      try {
        await saveNote(copyNote);
        setSelectedNoteId(newId);
        await refresh();
      } catch (err) {
        console.error("Failed to duplicate note:", err);
        throw err;
      }
    },
    [saveNote, refresh],
  );

  const archiveNote = useCallback(
    async (note: CampaignNote) => {
      await moveNote(note.path, "Archive");
    },
    [moveNote],
  );

  const archiveFolder = useCallback(
    async (folderPath: string) => {
      const cleanFolder = folderPath.replace(/^\/+|\/+$/g, "");
      const folderName = cleanFolder.split("/").pop() || cleanFolder;
      await renameFolder(cleanFolder, `Archive/${folderName}`);
    },
    [renameFolder],
  );

  const changeNoteIcon = useCallback(
    async (note: CampaignNote, iconName: string | null) => {
      const updatedFrontmatter = { ...(note.frontmatter || {}) };
      if (iconName) {
        updatedFrontmatter.icon = iconName;
      } else {
        delete updatedFrontmatter.icon;
      }
      const updatedNote: CampaignNote = {
        ...note,
        frontmatter: updatedFrontmatter,
      };
      try {
        await saveNote(updatedNote);
        if (selectedNoteId === note.id) {
          setEditFrontmatter(updatedFrontmatter);
        }
        await loadNotes();
      } catch (err) {
        console.error("Failed to update note icon:", err);
        throw err;
      }
    },
    [saveNote, selectedNoteId, loadNotes],
  );

  const revealInFileManager = useCallback(
    async (relPath: string) => {
      try {
        const fullPath = vaultPath ? `${vaultPath}/${relPath}` : relPath;
        const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
        await revealItemInDir(fullPath);
      } catch (err) {
        console.error("Failed to reveal item in file manager:", err);
      }
    },
    [vaultPath],
  );

  const importFiles = useCallback(
    async (targetFolder: string, files: FileList | File[]) => {
      const cleanTarget = targetFolder.replace(/^\/+|\/+$/g, "");
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let j = 0; j < bytes.byteLength; j++) {
            binary += String.fromCharCode(bytes[j]);
          }
          const base64 = btoa(binary);
          await invoke("import_file_to_vault", {
            targetFolder: cleanTarget,
            fileName: file.name,
            base64Content: base64,
          });
        } catch (err) {
          console.error(`Failed to import file "${file.name}":`, err);
        }
      }
      await refresh();
    },
    [refresh],
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
    createFolder,
    renameNote,
    renameFolder,
    moveNote,
    moveFolder,
    duplicateNote,
    archiveNote,
    archiveFolder,
    changeNoteIcon,
    revealInFileManager,
    importFiles,
    normalizeCampaignMarkdown,
  };
}
