import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Eye,
  PenLine,
  Trash2,
  Copy,
  Image as ImageIcon,
} from "lucide-react";
import { CampaignNote, DEFAULT_PROVENANCE_TAXONOMY, ProvenanceType } from "../types";
import { NoteOutline } from "./NoteOutline";
import { parseNoteTags } from "../utils/tags";
import { VaultTree } from "./VaultTree";

export interface TemplateProperty {
  type: "number" | "boolean" | "string";
  default: any;
}

export interface TemplateAction {
  label: string;
  hook: string;
  plugin: string;
}

export interface TemplateEntry {
  name: string;
  properties: Record<string, TemplateProperty>;
  actions: TemplateAction[];
}

const MarkdownEditor = lazy(() => import("./MarkdownEditor"));
const FolderCanvas = lazy(() => import("./FolderCanvas"));

export interface CampaignVaultViewProps {
  activeView: "dashboard" | "vault" | "rules" | "ai" | "settings" | "canvas" | "trash";
  notesByFolder: Record<string, CampaignNote[]>;
  collapsedFolders: Record<string, boolean>;
  setCollapsedFolders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedNoteId: string;
  setSelectedNoteId: (id: string) => void;
  currentNote: CampaignNote | undefined;
  isEditingNote: boolean;
  setIsEditingNote: (editing: boolean) => void;
  editTitle: string;
  setEditTitle: (title: string) => void;
  editFrontmatter: Record<string, any>;
  setEditFrontmatter: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  editContent: string;
  setEditContent: (content: string) => void;
  setContextMenu: (
    menu: {
      x: number;
      y: number;
      type: "note" | "folder" | "rule" | "rule-folder";
      targetId: string;
      path?: string;
      isRulebook?: boolean;
    } | null,
  ) => void;
  activeFolderDropdown: string | null;
  setActiveFolderDropdown: (key: string | null) => void;
  handleGenerateImageFromNote?: (title: string, content: string) => void;
  isGeneratingImage?: boolean;
  renderFolderDropdown: (folderName: string, isRulebook?: boolean) => React.ReactNode;
  handleNewNote: (folder?: string) => void;
  handleNewFolder: (parentFolder?: string) => void;
  handleTrashNote: (path: string) => void;
  renderMarkdown: (content: string) => React.ReactNode;
  currentCanvasFolder: string | null;
  setCurrentCanvasFolder: (folder: string | null) => void;
  handleNormalizeVaultMarkdown: () => void;
  triggerImmediateSave: () => void;
  notes: CampaignNote[];
  setActiveView: (view: "dashboard" | "vault" | "rules" | "ai" | "settings" | "canvas" | "trash") => void;
  onSelectNoteFromCanvas: (noteId: string) => void;
  onSelectCanvas: (canvasPath: string) => void;
  /** World provenance taxonomy; falls back to DEFAULT_PROVENANCE_TAXONOMY. */
  provenanceTaxonomy?: ProvenanceType[];
  discoveredFolders?: string[];
  onRenameNote?: (note: CampaignNote, newTitle: string) => Promise<void> | void;
  onRenameFolder?: (oldFolder: string, newFolderName: string) => Promise<void> | void;
  onMoveNote?: (notePath: string, targetFolder: string) => Promise<void> | void;
  onMoveFolder?: (folderPath: string, targetFolder: string) => Promise<void> | void;
  onDuplicateNote?: (note: CampaignNote) => Promise<void> | void;
  onArchiveNote?: (note: CampaignNote) => Promise<void> | void;
  onArchiveFolder?: (folderPath: string) => Promise<void> | void;
  onChangeNoteIcon?: (note: CampaignNote, iconName: string | null) => Promise<void> | void;
  onRevealInFileManager?: (path: string) => void;
  onImportFiles?: (targetFolder: string, files: FileList | File[]) => Promise<void> | void;
  onOpenImportDialog?: (targetFolder?: string) => void;
}

/**
 * CampaignVaultView Component
 * 
 * Renders the primary filesystem-first tree navigation for the campaign vault.
 * 
 * Educational Notes:
 * - Tree Filesystem-First Rendering: Notes are grouped by their physical folder paths on disk. 
 *   The component relies on the `notesByFolder` map to render a collapsible tree structure.
 * - Custom React Action Confirmation Modals: Destructive actions like trashing a note do not 
 *   use native `window.confirm()` as per project rules. They delegate to `handleTrashNote`, 
 *   which should trigger a custom React overlay modal.
 * - Trash/Restore Process: Moving notes to the trash delegates path operations to the backend, 
 *   abstracting away direct filesystem deletion from the frontend view.
 * - Cross-Vault Scoping Constraint: All workspace access (e.g., tree rendering and filesystem operations) 
 *   must be strictly scoped by the active campaign vault path to prevent cross-vault data leaks.
 */
export const CampaignVaultView: React.FC<CampaignVaultViewProps> = ({
  activeView,
  notesByFolder,
  collapsedFolders,
  setCollapsedFolders,
  selectedNoteId,
  setSelectedNoteId,
  currentNote,
  isEditingNote,
  setIsEditingNote,
  editTitle,
  setEditTitle,
  editFrontmatter,
  setEditFrontmatter,
  editContent,
  setEditContent,
  setContextMenu: _setContextMenu,
  activeFolderDropdown,
  setActiveFolderDropdown,
  renderFolderDropdown,
  handleNewNote,
  handleNewFolder,
  handleTrashNote,
  renderMarkdown,
  currentCanvasFolder,
  setCurrentCanvasFolder,
  handleNormalizeVaultMarkdown,
  triggerImmediateSave,
  notes,
  setActiveView,
  onSelectNoteFromCanvas,
  onSelectCanvas,
  handleGenerateImageFromNote,
  isGeneratingImage,
  provenanceTaxonomy = DEFAULT_PROVENANCE_TAXONOMY,
  discoveredFolders,
  onRenameNote,
  onRenameFolder,
  onMoveNote,
  onMoveFolder,
  onDuplicateNote,
  onArchiveNote,
  onArchiveFolder,
  onChangeNoteIcon,
  onRevealInFileManager,
  onImportFiles,
  onOpenImportDialog,
}) => {
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);

  const effectiveNotes = useMemo(() => {
    if (notes && notes.length > 0) return notes;
    if (notesByFolder) {
      return Object.values(notesByFolder).flat();
    }
    return [];
  }, [notes, notesByFolder]);

  const effectiveFolders = useMemo(() => {
    if (discoveredFolders && discoveredFolders.length > 0) return discoveredFolders;
    if (notesByFolder) {
      return Object.keys(notesByFolder);
    }
    return [];
  }, [discoveredFolders, notesByFolder]);

  useEffect(() => {
    invoke<TemplateEntry[]>("list_templates")
      .then((data) => setTemplates(data || []))
      .catch((err) => console.error("Failed loading templates:", err));
  }, [currentNote?.id]);

  const activeTemplate = (templates || []).find(
    (t) => t.name.toLowerCase() === (editFrontmatter.type || "").toLowerCase()
  );

  const templatePropKeys = activeTemplate
    ? Object.keys(activeTemplate.properties)
    : [];

  const otherFrontmatterKeys = Object.keys(editFrontmatter).filter(
    (key) =>
      key !== "type" &&
      key !== "tags" &&
      !templatePropKeys.includes(key) &&
      ![
        "source_type",
        "source_title",
        "source_author",
        "source_url",
        "source_date",
        "source_id",
      ].includes(key),
  );

  return (
    <div
      className="view-container"
      data-od-id="vault-view"
      style={{ padding: 0, overflow: "hidden" }}
    >
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        {/* Sidebar notes navigator */}
        <div
          style={{
            width: 250,
            borderRight: "1px solid var(--border)",
            height: "100%",
            flexShrink: 0,
            background: "var(--surface)",
            overflow: "hidden",
          }}
        >
          <VaultTree
            notes={effectiveNotes}
            discoveredFolders={effectiveFolders}
            collapsedFolders={collapsedFolders}
            onToggleFolder={(folderName) => {
              setCollapsedFolders((prev) => ({
                ...prev,
                [folderName]: !prev[folderName],
              }));
            }}
            selectedNoteId={selectedNoteId}
            onSelectNote={(noteId) => {
              setSelectedNoteId(noteId);
              const targetNote = effectiveNotes.find((n) => n.id === noteId);
              const isCanvas =
                targetNote?.frontmatter?.type === "Canvas" ||
                targetNote?.path.endsWith(".canvas.md") ||
                targetNote?.path.endsWith(".canvas");
              if (isCanvas && targetNote) {
                const parts = targetNote.path.split("/");
                parts.pop();
                const folderName = parts.join("/");
                setCurrentCanvasFolder(folderName);
                setActiveView("canvas");
              } else {
                setActiveView("vault");
              }
            }}
            onNewNote={(targetFolder) => {
              handleNewNote(targetFolder);
            }}
            onNewFolder={(parentFolder) => {
              handleNewFolder(parentFolder);
            }}
            onRenameNote={onRenameNote || (async (note, newTitle) => {
              const parts = note.path.split("/");
              parts.pop();
              const dir = parts.join("/");
              const sanitized = newTitle.trim().replace(/[\\/:*?"<>|]/g, "_");
              const newPath = dir ? `${dir}/${sanitized}.md` : `${sanitized}.md`;
              await invoke("rename_note", { oldPath: note.path, newPath });
            })}
            onRenameFolder={onRenameFolder || (async (oldFolder, newFolderName) => {
              const cleanOld = oldFolder.replace(/^\/+|\/+$/g, "");
              const parts = cleanOld.split("/");
              parts.pop();
              const parent = parts.join("/");
              const sanitized = newFolderName.trim().replace(/[\\/:*?"<>|]/g, "_");
              const newFolder = parent ? `${parent}/${sanitized}` : sanitized;
              await invoke("rename_folder", { oldFolder: cleanOld, newFolder });
            })}
            onMoveNote={onMoveNote || (async (notePath, targetFolder) => {
              await invoke("move_note", { notePath, targetFolder });
            })}
            onMoveFolder={onMoveFolder}
            onDuplicateNote={onDuplicateNote}
            onArchiveNote={onArchiveNote}
            onArchiveFolder={onArchiveFolder}
            onTrashNote={handleTrashNote}
            onTrashFolder={(folderPath) => {
              invoke("trash_folder", { folderPath }).catch(console.error);
            }}
            onChangeNoteIcon={onChangeNoteIcon}
            onRevealInFileManager={onRevealInFileManager}
            onImportFiles={onImportFiles}
            onOpenImportDialog={onOpenImportDialog}
            renderFolderDropdown={renderFolderDropdown}
            activeFolderDropdown={activeFolderDropdown}
            setActiveFolderDropdown={setActiveFolderDropdown}
          />
        </div>

        {/* Right Editor / Canvas Sheet */}
        {activeView === "canvas" ? (
          <div
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <Suspense
              fallback={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    color: "var(--muted)",
                  }}
                >
                  Loading Campaign Canvas...
                </div>
              }
            >
              {currentNote && (
                <FolderCanvas
                  currentFolder={currentCanvasFolder || ""}
                  activeCanvasPath={
                    (currentNote?.frontmatter?.canvasPath as string) ||
                    currentNote?.path ||
                    ""
                  }
                  notes={notes as any[]}
                  onSelectNote={onSelectNoteFromCanvas}
                  onSelectCanvas={onSelectCanvas}
                />
              )}
            </Suspense>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "32px 40px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {currentNote ? (
              <div
                className="document-sheet"
                style={{
                  padding: "40px 48px",
                  width: "100%",
                  maxWidth: "840px",
                }}
              >
                {/* Mode Toggle at top-right */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: "8px",
                    marginBottom: "16px",
                  }}
                >
                  <button
                    onClick={handleNormalizeVaultMarkdown}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--fg)",
                      padding: "4px 10px",
                      borderRadius: 0,
                      fontSize: "11px",
                      fontWeight: 600,
                      fontFamily: "var(--font-body)",
                      cursor: "pointer",
                    }}
                    title="Rewrite notes with canonical wiki links"
                    data-od-id="normalize-vault-btn"
                  >
                    <Copy size={12} /> Normalize Vault
                  </button>
                  <div
                    style={{
                      display: "flex",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 0,
                      padding: "2px",
                    }}
                  >
                    <button
                      onClick={() => {
                        triggerImmediateSave();
                        setIsEditingNote(false);
                      }}
                      data-od-id="preview-note-btn"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        border: "none",
                        background: !isEditingNote
                          ? "var(--surface)"
                          : "transparent",
                        color: !isEditingNote
                          ? "var(--accent)"
                          : "var(--muted)",
                        padding: "4px 10px",
                        borderRadius: 0,
                        fontSize: "11px",
                        fontWeight: 600,
                        fontFamily: "var(--font-body)",
                        cursor: "pointer",
                      }}
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <button
                      onClick={() => setIsEditingNote(true)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        border: "none",
                        background: isEditingNote
                          ? "var(--surface)"
                          : "transparent",
                        color: isEditingNote
                          ? "var(--accent)"
                          : "var(--muted)",
                        padding: "4px 10px",
                        borderRadius: 0,
                        fontSize: "11px",
                        fontWeight: 600,
                        fontFamily: "var(--font-body)",
                        cursor: "pointer",
                      }}
                      data-od-id="edit-note-btn"
                    >
                      <PenLine size={12} /> Edit
                    </button>
                  </div>

                  {handleGenerateImageFromNote && currentNote && (
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        triggerImmediateSave();
                        handleGenerateImageFromNote(
                          currentNote.title,
                          currentNote.content,
                        );
                      }}
                      disabled={isGeneratingImage}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 10px",
                        borderRadius: 0,
                        fontSize: "11px",
                      }}
                      title="Generate an image from this note's content"
                      data-od-id="illustrate-note-btn"
                    >
                      <ImageIcon size={12} /> Illustrate
                    </button>
                  )}

                  <button
                    className="btn btn-sm"
                    onClick={() => handleTrashNote(currentNote.path)}
                    style={{
                      color: "var(--danger)",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 10px",
                      borderRadius: 0,
                      fontSize: "11px",
                    }}
                    title="Trash this note"
                    data-od-id="trash-note-btn"
                  >
                    <Trash2 size={12} /> Trash Note
                  </button>
                </div>

                {isEditingNote ? (
                  <div>
                    {/* Title Edit */}
                    <div style={{ marginBottom: "16px" }}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "36px",
                          lineHeight: "1.1",
                          letterSpacing: "-0.02em",
                          fontWeight: 600,
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          color: "var(--fg)",
                          width: "100%",
                          padding: "0 0 6px 0",
                          borderBottom: "1px dashed var(--border)",
                        }}
                        placeholder="Note Title"
                      />
                    </div>

                    {/* Frontmatter Metadata Properties */}
                    <details
                      style={{
                        marginBottom: "20px",
                        border: "1px solid var(--border)",
                        borderRadius: 0,
                        padding: "10px 14px",
                        background: "var(--surface)",
                      }}
                    >
                      <summary
                        style={{
                          fontSize: "11px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: "var(--muted)",
                          fontWeight: 600,
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        Metadata properties
                      </summary>
                      <div
                        style={{
                          marginTop: "12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <label
                            style={{
                              fontSize: "12px",
                              width: "100px",
                              color: "var(--muted)",
                            }}
                          >
                            Type:
                          </label>
                          <input
                            type="text"
                            value={editFrontmatter.type || ""}
                            onChange={(e) =>
                              setEditFrontmatter((prev) => ({
                                ...prev,
                                type: e.target.value,
                              }))
                            }
                            style={{
                              flex: 1,
                              padding: "4px 8px",
                              fontSize: "12px",
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 0,
                              color: "var(--fg)",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <label
                            style={{
                              fontSize: "12px",
                              width: "100px",
                              color: "var(--muted)",
                            }}
                          >
                            Tags:
                          </label>
                          <input
                            type="text"
                            value={Array.isArray(editFrontmatter.tags)
                              ? editFrontmatter.tags.join(", ")
                              : String(editFrontmatter.tags ?? "")}
                            onChange={(e) =>
                              setEditFrontmatter((prev) => ({
                                ...prev,
                                tags: e.target.value
                                  .split(",")
                                  .map((t) => t.trim())
                                  .filter(Boolean),
                              }))
                            }
                            style={{
                              flex: 1,
                              padding: "4px 8px",
                              fontSize: "12px",
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 0,
                              color: "var(--fg)",
                            }}
                          />
                        </div>

                        {/* Provenance fields */}
                        <div
                          style={{
                            borderTop: "1px solid var(--border)",
                            paddingTop: "8px",
                            marginTop: "4px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: "var(--muted)",
                              display: "block",
                              marginBottom: "8px",
                            }}
                          >
                            Provenance
                          </span>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <label
                              style={{
                                fontSize: "12px",
                                width: "100px",
                                color: "var(--muted)",
                              }}
                            >
                              Source type:
                            </label>
                            <select
                              value={
                                typeof editFrontmatter.source_type === "string"
                                  ? editFrontmatter.source_type
                                  : ""
                              }
                              onChange={(e) =>
                                setEditFrontmatter((prev) => ({
                                  ...prev,
                                  source_type: e.target.value,
                                }))
                              }
                              style={{
                                flex: 1,
                                padding: "4px 8px",
                                fontSize: "12px",
                                background: "var(--bg)",
                                border: "1px solid var(--border)",
                                borderRadius: 0,
                                color: "var(--fg)",
                              }}
                            >
                              <option value="">— none —</option>
                              {provenanceTaxonomy.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label.toLowerCase()}
                                </option>
                              ))}
                              <option value="custom">custom</option>
                            </select>
                          </div>
                          {[
                            ["source_title", "Source title:"],
                            ["source_author", "Source author:"],
                            ["source_url", "Source URL:"],
                            ["source_date", "Source date:"],
                          ].map(([key, label]) => (
                            <div
                              key={key}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                              }}
                            >
                              <label
                                style={{
                                  fontSize: "12px",
                                  width: "100px",
                                  color: "var(--muted)",
                                }}
                              >
                                {label}
                              </label>
                              <input
                                type="text"
                                value={
                                  editFrontmatter[key] !== undefined
                                    ? String(editFrontmatter[key])
                                    : ""
                                }
                                onChange={(e) =>
                                  setEditFrontmatter((prev) => ({
                                    ...prev,
                                    [key]: e.target.value,
                                  }))
                                }
                                style={{
                                  flex: 1,
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                  background: "var(--bg)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 0,
                                  color: "var(--fg)",
                                }}
                              />
                            </div>
                          ))}
                        </div>

                        {/* Template defined property controls */}
                        {activeTemplate &&
                          Object.entries(activeTemplate.properties).map(
                            ([key, propDef]) => {
                              if (propDef.type === "number") {
                                return (
                                  <div
                                    key={key}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                    }}
                                  >
                                    <label
                                      style={{
                                        fontSize: "12px",
                                        width: "100px",
                                        color: "var(--muted)",
                                        textTransform: "capitalize",
                                      }}
                                    >
                                      {key}:
                                    </label>
                                    <input
                                      type="number"
                                      value={
                                        editFrontmatter[key] !== undefined
                                          ? editFrontmatter[key]
                                          : (propDef.default ?? "")
                                      }
                                      onChange={(e) =>
                                        setEditFrontmatter((prev) => ({
                                          ...prev,
                                          [key]:
                                            e.target.value === ""
                                              ? ""
                                              : Number(e.target.value),
                                        }))
                                      }
                                      style={{
                                        flex: 1,
                                        padding: "4px 8px",
                                        fontSize: "12px",
                                        background: "var(--bg)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 0,
                                        color: "var(--fg)",
                                      }}
                                    />
                                  </div>
                                );
                              }
                              if (propDef.type === "boolean") {
                                return (
                                  <div
                                    key={key}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                    }}
                                  >
                                    <label
                                      style={{
                                        fontSize: "12px",
                                        width: "100px",
                                        color: "var(--muted)",
                                        textTransform: "capitalize",
                                      }}
                                    >
                                      {key}:
                                    </label>
                                    <input
                                      type="checkbox"
                                      checked={
                                        editFrontmatter[key] !== undefined
                                          ? Boolean(editFrontmatter[key])
                                          : Boolean(propDef.default)
                                      }
                                      onChange={(e) =>
                                        setEditFrontmatter((prev) => ({
                                          ...prev,
                                          [key]: e.target.checked,
                                        }))
                                      }
                                      style={{
                                        accentColor: "var(--accent)",
                                      }}
                                    />
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={key}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                  }}
                                >
                                  <label
                                    style={{
                                      fontSize: "12px",
                                      width: "100px",
                                      color: "var(--muted)",
                                      textTransform: "capitalize",
                                    }}
                                  >
                                    {key}:
                                  </label>
                                  <input
                                    type="text"
                                    value={
                                      editFrontmatter[key] !== undefined
                                        ? editFrontmatter[key]
                                        : (propDef.default ?? "")
                                    }
                                    onChange={(e) =>
                                      setEditFrontmatter((prev) => ({
                                        ...prev,
                                        [key]: e.target.value,
                                      }))
                                    }
                                    style={{
                                      flex: 1,
                                      padding: "4px 8px",
                                      fontSize: "12px",
                                      background: "var(--bg)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 0,
                                      color: "var(--fg)",
                                    }}
                                  />
                                </div>
                              );
                            }
                          )}

                        {/* Fallback inputs for unspecified frontmatter keys */}
                        {otherFrontmatterKeys.map((key) => (
                          <div
                            key={key}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <label
                              style={{
                                fontSize: "12px",
                                width: "100px",
                                color: "var(--muted)",
                                textTransform: "capitalize",
                              }}
                            >
                              {key}:
                            </label>
                            <input
                              type="text"
                              value={
                                editFrontmatter[key] !== undefined
                                  ? typeof editFrontmatter[key] === "object"
                                    ? JSON.stringify(editFrontmatter[key])
                                    : String(editFrontmatter[key])
                                  : ""
                              }
                              onChange={(e) =>
                                setEditFrontmatter((prev) => ({
                                  ...prev,
                                  [key]: e.target.value,
                                }))
                              }
                              style={{
                                flex: 1,
                                padding: "4px 8px",
                                fontSize: "12px",
                                background: "var(--bg)",
                                border: "1px solid var(--border)",
                                borderRadius: 0,
                                color: "var(--fg)",
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </details>

                    {/* Markdown Editor */}
                    <div style={{ marginBottom: "20px" }}>
                      <Suspense
                        fallback={
                          <div
                            style={{
                              width: "100%",
                              height: "400px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              border: "1px solid var(--border)",
                              borderRadius: 0,
                              background: "var(--surface)",
                              color: "var(--muted)",
                              fontSize: "13px",
                            }}
                          >
                            Loading markdown editor...
                          </div>
                        }
                      >
                        <MarkdownEditor
                          value={editContent}
                          onChange={setEditContent}
                          notes={notes}
                          activeNotePath={currentNote.path}
                        />
                      </Suspense>
                    </div>

                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--muted)",
                        fontStyle: "italic",
                        borderTop: "1px solid var(--border)",
                        paddingTop: "8px",
                      }}
                    >
                      ● Auto-saving in background...
                    </div>
                  </div>
                ) : (
                  <div>
                    <div
                      className="doc-title"
                      style={{ wordBreak: "break-word" }}
                    >
                      {currentNote.title}
                    </div>
                    <div className="doc-meta">
                      {Boolean(currentNote.frontmatter.type) && (
                        <span className="doc-meta-tag">
                          {String(currentNote.frontmatter.type).toUpperCase()}
                        </span>
                      )}
                      <span className="doc-meta-tag">
                        {currentNote.path}
                      </span>
                      {parseNoteTags(currentNote).map((t) => (
                          <span key={t} className="doc-meta-tag tag-pill">
                            #{t}
                          </span>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                      <div className="doc-body" style={{ flex: 1, minWidth: 0 }}>
                        {renderMarkdown(currentNote.content)}
                      </div>
                      <NoteOutline content={currentNote.content} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted)",
                  fontSize: "13px",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div>No note selected.</div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleNewNote()}
                  data-od-id="vault-create-first-note-btn"
                >
                  Create your first Note
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignVaultView;
