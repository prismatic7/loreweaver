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
import { CampaignNote } from "../types";

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
}

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
}) => {
  const [templates, setTemplates] = useState<TemplateEntry[]>([]);

  useEffect(() => {
    invoke<TemplateEntry[]>("list_templates")
      .then((data) => setTemplates(data))
      .catch((err) => console.error("Failed loading templates:", err));
  }, [currentNote]);

  const activeTemplate = templates.find(
    (t) => t.name.toLowerCase() === (editFrontmatter.type || "").toLowerCase()
  );

  const templatePropKeys = activeTemplate
    ? Object.keys(activeTemplate.properties)
    : [];

  const otherFrontmatterKeys = Object.keys(editFrontmatter).filter(
    (key) => key !== "type" && key !== "tags" && !templatePropKeys.includes(key)
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
                borderRadius: "4px",
              }}
              title="Create a new note"
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
                borderRadius: "4px",
                color: "var(--fg)",
              }}
              title="Create a new folder"
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
                      borderRadius: "4px",
                    }}
                    className="folder-item-header"
                  >
                    <div
                      onClick={() =>
                        setCollapsedFolders((prev) => ({
                          ...prev,
                          [folderName]: !isCollapsed,
                        }))
                      }
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
                    </div>

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
                        const isCanvas = note.path.endsWith(".canvas.json");
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
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 600,
                      fontFamily: "var(--font-body)",
                      cursor: "pointer",
                    }}
                    title="Rewrite notes with canonical wiki links"
                  >
                    <Copy size={12} /> Normalize Vault
                  </button>
                  <div
                    style={{
                      display: "flex",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      padding: "2px",
                    }}
                  >
                    <button
                      onClick={() => {
                        triggerImmediateSave();
                        setIsEditingNote(false);
                      }}
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
                        borderRadius: "4px",
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
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 600,
                        fontFamily: "var(--font-body)",
                        cursor: "pointer",
                      }}
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
                      borderRadius: "4px",
                      fontSize: "11px",
                    }}
                    title="Trash this note"
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
                        borderRadius: "4px",
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
                              borderRadius: "4px",
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
                              borderRadius: "4px",
                              color: "var(--fg)",
                            }}
                          />
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
                                        borderRadius: "4px",
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
                                      borderRadius: "4px",
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
                                borderRadius: "4px",
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
                              borderRadius: "6px",
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
                      {currentNote.frontmatter.type && (
                        <span className="doc-meta-tag">
                          {String(currentNote.frontmatter.type).toUpperCase()}
                        </span>
                      )}
                      <span className="doc-meta-tag">
                        {currentNote.path}
                      </span>
                      {currentNote.frontmatter.tags &&
                        Array.isArray(currentNote.frontmatter.tags) &&
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
