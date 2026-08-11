import React, { useState, useEffect, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FilePlus,
  FolderPlus,
  ChevronRight,
  Eye,
  PenLine,
  Trash2,
  Copy,
} from "lucide-react";
import { CampaignNote, DEFAULT_PROVENANCE_TAXONOMY, ProvenanceType } from "../types";

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
  renderFolderDropdown: (folderName: string, isRulebook?: boolean) => React.ReactNode;
  handleNewNote: () => void;
  handleNewFolder: () => void;
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
  setContextMenu,
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
  provenanceTaxonomy = DEFAULT_PROVENANCE_TAXONOMY,
}) => {
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);

  useEffect(() => {
    invoke<TemplateEntry[]>("list_templates")
      .then((data) => setTemplates(data || []))
      .catch((err) => console.error("Failed loading templates:", err));
  }, [currentNote]);

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
            width: 220,
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            padding: "12px 8px",
            flexShrink: 0,
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "6px",
              margin: "4px 8px 12px 8px",
            }}
          >
            <button
              className="btn btn-sm btn-primary"
              onClick={handleNewNote}
              style={{
                flex: 1,
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                fontSize: "11px",
                cursor: "pointer",
                borderRadius: 0,
              }}
              title="Create a new note"
              data-od-id="vault-new-note-btn"
            >
              <FilePlus size={12} /> New Note
            </button>
            <button
              className="btn btn-sm"
              onClick={handleNewFolder}
              style={{
                flex: 1,
                padding: "6px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                fontSize: "11px",
                cursor: "pointer",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 0,
                color: "var(--fg)",
              }}
              title="Create a new folder"
              data-od-id="vault-new-folder-btn"
            >
              <FolderPlus size={12} /> Folder
            </button>
          </div>

          <span
            className="section-label"
            style={{
              marginLeft: 8,
              display: "block",
              marginBottom: "8px",
            }}
          >
            Campaign Notes
          </span>

          {Object.entries(notesByFolder).map(
            ([folderName, folderNotes]) => {
              const isCollapsed = !!collapsedFolders[folderName];
              return (
                <div key={folderName} style={{ marginBottom: "8px" }}>
                  {/* Folder Header */}
                  <div
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        type: "folder",
                        targetId: folderName,
                      });
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      paddingRight: "8px",
                      borderRadius: 0,
                    }}
                    className="folder-item-header"
                    data-od-id={`folder-header-${folderName}`}
                  >
                    <button
                      onClick={() =>
                        setCollapsedFolders((prev) => ({
                          ...prev,
                          [folderName]: !isCollapsed,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setCollapsedFolders((prev) => ({
                            ...prev,
                            [folderName]: !isCollapsed,
                          }));
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={!isCollapsed}
                      aria-label={`Toggle ${folderName} folder`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 8px",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--fg)",
                        userSelect: "none",
                        flex: 1,
                        overflow: "hidden",
                        background: "transparent",
                        border: "none",
                        textAlign: "left",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      <ChevronRight
                        size={12}
                        style={{
                          transform: isCollapsed
                            ? "rotate(0deg)"
                            : "rotate(90deg)",
                          transition: "transform 0.15s ease",
                          color: "var(--muted)",
                        }}
                      />
                      <span style={{ fontSize: "13px" }}>
                        {folderName === "Root" ? "📦" : "📁"}
                      </span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {folderName}
                      </span>
                    </button>

                    {/* Plus dropdown button */}
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFolderDropdown(
                            activeFolderDropdown === folderName
                              ? null
                              : folderName,
                          );
                        }}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--muted)",
                          cursor: "pointer",
                          padding: "2px 6px",
                          display: "flex",
                          alignItems: "center",
                          fontSize: "14px",
                          fontWeight: "bold",
                        }}
                        title="Add Asset to folder..."
                        data-od-id={`folder-actions-${folderName}`}
                      >
                        +
                      </button>

                      {renderFolderDropdown(folderName, false)}
                    </div>
                  </div>

                  {/* Note List Inside Folder */}
                  {!isCollapsed && (
                    <div
                      style={{
                        paddingLeft: "16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                        marginTop: "2px",
                      }}
                    >
                      {folderNotes.map((note) => {
                        const isCanvas =
                          note.frontmatter?.type === "Canvas" ||
                          note.path.endsWith(".canvas.md") ||
                          note.path.endsWith(".canvas");
                        let icon = <span>📄</span>;
                        if (isCanvas) icon = <span>🗺️</span>;
                        else if (
                          note.frontmatter.type === "Character" ||
                          note.frontmatter.type === "NPC"
                        )
                          icon = <span>👤</span>;
                        else if (
                          note.frontmatter.type === "Location" ||
                          note.frontmatter.type === "City"
                        )
                          icon = <span>📍</span>;
                        else if (
                          note.frontmatter.type === "Item" ||
                          note.frontmatter.type === "Artifact"
                        )
                          icon = <span>⚔️</span>;
                        else if (
                          note.frontmatter.type === "AUDIO"
                        )
                          icon = <span>🎵</span>;
                        else if (
                          note.frontmatter.type === "IMAGE"
                        )
                          icon = <span>🖼️</span>;

                        return (
                          <button
                            key={note.id}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                type: "note",
                                targetId: note.id,
                                path: note.path,
                              });
                            }}
                            className={`nav-item ${selectedNoteId === note.id ? "active" : ""}`}
                            onClick={() => {
                              setSelectedNoteId(note.id);
                              if (isCanvas) {
                                const parts = note.path.split("/");
                                parts.pop();
                                const folderName = parts.join("/");
                                setCurrentCanvasFolder(folderName);
                                setActiveView("canvas");
                              } else {
                                setActiveView("vault");
                              }
                            }}
                            style={{
                              padding: "6px 8px",
                              fontSize: "12px",
                              display: "flex",
                              alignItems: "center",
                              width: "100%",
                              textAlign: "left",
                            }}
                            data-od-id={`note-${note.id}`}
                          >
                            {icon}
                            <span
                              style={{
                                marginLeft: "6px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {note.title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            },
          )}
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
                            value={(editFrontmatter.tags || []).join(", ")}
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
                      {Array.isArray(currentNote.frontmatter.tags) &&
                        currentNote.frontmatter.tags.map((t) => (
                          <span key={t} className="doc-meta-tag tag-pill">
                            #{t}
                          </span>
                        ))}
                    </div>
                    <div className="doc-body">
                      {renderMarkdown(currentNote.content)}
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
                  onClick={handleNewNote}
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
