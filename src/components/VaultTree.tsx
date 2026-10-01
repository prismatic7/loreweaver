import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ChevronRight,
  Plus,
  FolderPlus,
  FilePlus,
  Upload,
  ArrowUpDown,
  Search,
  PenLine,
  Trash2,
  Copy,
  Archive,
  FolderOpen,
  Sparkles,
  Eye,
  X,
} from "lucide-react";
import { CampaignNote } from "../types";
import { NoteIcon, FolderIcon } from "./VaultIcons";
import { IconPickerModal } from "./IconPickerModal";

export type SortMode = "name-asc" | "name-desc" | "date-desc" | "date-asc";

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  kind: "folder" | "note";
  note?: CampaignNote;
  children: TreeNode[];
  depth: number;
}

export interface VaultTreeProps {
  notes: CampaignNote[];
  discoveredFolders?: string[];
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (folderPath: string) => void;
  selectedNoteId: string;
  onSelectNote: (noteId: string) => void;
  onNewNote: (targetFolder?: string) => void;
  onNewFolder: (parentFolder?: string) => void;
  onRenameNote: (note: CampaignNote, newTitle: string) => Promise<void> | void;
  onRenameFolder: (oldFolder: string, newFolderName: string) => Promise<void> | void;
  onMoveNote: (notePath: string, targetFolder: string) => Promise<void> | void;
  onMoveFolder?: (folderPath: string, targetFolder: string) => Promise<void> | void;
  onDuplicateNote?: (note: CampaignNote) => Promise<void> | void;
  onArchiveNote?: (note: CampaignNote) => Promise<void> | void;
  onArchiveFolder?: (folderPath: string) => Promise<void> | void;
  onTrashNote: (notePath: string) => void;
  onTrashFolder: (folderPath: string) => void;
  onChangeNoteIcon?: (note: CampaignNote, iconName: string | null) => Promise<void> | void;
  onRevealInFileManager?: (path: string) => void;
  onImportFiles?: (targetFolder: string, files: FileList | File[]) => Promise<void> | void;
  onOpenImportDialog?: (targetFolder?: string) => void;
  renderFolderDropdown?: (folderName: string) => React.ReactNode;
  activeFolderDropdown?: string | null;
  setActiveFolderDropdown?: (folder: string | null) => void;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

interface ContextMenuState {
  x: number;
  y: number;
  kind: "note" | "folder";
  targetNode: TreeNode;
}

/**
 * Builds a recursive tree from a flat list of notes and folder paths.
 */
function buildTree(
  notes: CampaignNote[],
  discoveredFolders: string[] = [],
  sortMode: SortMode = "name-asc",
  searchQuery: string = "",
): TreeNode {
  const rootNode: TreeNode = {
    id: "Root",
    name: "Root",
    path: "",
    kind: "folder",
    children: [],
    depth: 0,
  };

  const folderMap = new Map<string, TreeNode>();
  folderMap.set("", rootNode);

  // Helper to ensure all folder segments exist in the tree
  const ensureFolder = (folderPath: string): TreeNode => {
    const clean = folderPath.replace(/^\/+|\/+$/g, "");
    if (!clean) return rootNode;
    if (folderMap.has(clean)) return folderMap.get(clean)!;

    const parts = clean.split("/");
    let currentPath = "";
    let parent = rootNode;

    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i];
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let node = folderMap.get(currentPath);
      if (!node) {
        node = {
          id: currentPath,
          name: segment,
          path: currentPath,
          kind: "folder",
          children: [],
          depth: i + 1,
        };
        folderMap.set(currentPath, node);
        parent.children.push(node);
      }
      parent = node;
    }

    return folderMap.get(clean)!;
  };

  // 1. Add all discovered folders
  discoveredFolders.forEach((folder) => {
    if (folder && folder !== "Root") {
      ensureFolder(folder);
    }
  });

  // 2. Add notes to their respective folders
  notes.forEach((note) => {
    const parts = note.path.split("/");
    const filename = parts.pop() || note.title;
    const parentFolder = parts.join("/");
    const parentNode = ensureFolder(parentFolder);

    const displayName = note.title || filename.replace(/\.md$/, "");

    parentNode.children.push({
      id: note.id,
      name: displayName,
      path: note.path,
      kind: "note",
      note,
      children: [],
      depth: parentNode.depth + 1,
    });
  });

  // 3. Recursive sort function
  const sortNodes = (node: TreeNode) => {
    node.children.sort((a, b) => {
      // Folders always come first
      if (a.kind !== b.kind) {
        return a.kind === "folder" ? -1 : 1;
      }

      if (sortMode === "name-asc") {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
      }
      if (sortMode === "name-desc") {
        return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: "base" });
      }

      // Date sorting (falling back to name if no date info)
      const aDate = a.note?.frontmatter?.updated_at || a.note?.frontmatter?.created_at || "";
      const bDate = b.note?.frontmatter?.updated_at || b.note?.frontmatter?.created_at || "";
      if (aDate && bDate) {
        return sortMode === "date-desc"
          ? String(bDate).localeCompare(String(aDate))
          : String(aDate).localeCompare(String(bDate));
      }

      return a.name.localeCompare(b.name);
    });

    // Recursively sort children
    node.children.forEach(sortNodes);
  };

  sortNodes(rootNode);

  // 4. Filter tree if searchQuery is present
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    const filterNode = (node: TreeNode): TreeNode | null => {
      if (node.kind === "note") {
        const matches =
          node.name.toLowerCase().includes(q) ||
          node.note?.content?.toLowerCase().includes(q) ||
          node.path.toLowerCase().includes(q);
        return matches ? node : null;
      }

      // For folder, keep if matches query OR if any children match
      const matchingChildren = node.children
        .map(filterNode)
        .filter((child): child is TreeNode => child !== null);

      if (matchingChildren.length > 0 || node.name.toLowerCase().includes(q)) {
        return {
          ...node,
          children: matchingChildren,
        };
      }
      return null;
    };

    const filtered = filterNode(rootNode);
    return filtered || { ...rootNode, children: [] };
  }

  return rootNode;
}

export const VaultTree: React.FC<VaultTreeProps> = ({
  notes,
  discoveredFolders = [],
  collapsedFolders,
  onToggleFolder,
  selectedNoteId,
  onSelectNote,
  onNewNote,
  onNewFolder,
  onRenameNote,
  onRenameFolder,
  onMoveNote,
  onMoveFolder,
  onDuplicateNote,
  onArchiveNote,
  onArchiveFolder,
  onTrashNote,
  onTrashFolder,
  onChangeNoteIcon,
  onRevealInFileManager,
  onImportFiles,
  onOpenImportDialog,
  renderFolderDropdown,
  activeFolderDropdown,
  setActiveFolderDropdown,
  title = "Campaign Notes",
  className,
  style,
}) => {
  const [sortMode, setSortMode] = useState<SortMode>("name-asc");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  // Inline editing state
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Drag-and-drop drag over highlight state
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Icon picker state
  const [iconPickerNote, setIconPickerNote] = useState<CampaignNote | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingNodeId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingNodeId]);

  // Build recursive tree
  const rootTree = useMemo(() => {
    return buildTree(notes, discoveredFolders, sortMode, searchQuery);
  }, [notes, discoveredFolders, sortMode, searchQuery]);

  const handleStartRename = (node: TreeNode) => {
    setEditingNodeId(node.id);
    setEditingValue(node.name);
    setContextMenu(null);
  };

  const handleCommitRename = async (node: TreeNode) => {
    const trimmed = editingValue.trim();
    setEditingNodeId(null);
    if (!trimmed || trimmed === node.name) return;

    if (node.kind === "note" && node.note) {
      await onRenameNote(node.note, trimmed);
    } else if (node.kind === "folder") {
      await onRenameFolder(node.path, trimmed);
    }
  };

  const handleKeyDownRename = (e: React.KeyboardEvent, node: TreeNode) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommitRename(node);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditingNodeId(null);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, node: TreeNode) => {
    if (node.kind === "note") {
      e.dataTransfer.setData("application/loreweaver-note-path", node.path);
      e.dataTransfer.setData("text/plain", node.path);
    } else {
      e.dataTransfer.setData("application/loreweaver-folder-path", node.path);
      e.dataTransfer.setData("text/plain", node.path);
    }
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverFolder !== folderPath) {
      setDragOverFolder(folderPath);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);

    // 1. Check for files dropped from OS/desktop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (onImportFiles) {
        await onImportFiles(targetFolder, e.dataTransfer.files);
      }
      return;
    }

    // 2. Check for dragged note
    const notePath = e.dataTransfer.getData("application/loreweaver-note-path");
    if (notePath) {
      await onMoveNote(notePath, targetFolder);
      return;
    }

    // 3. Check for dragged folder
    const folderPath = e.dataTransfer.getData("application/loreweaver-folder-path");
    if (folderPath && folderPath !== targetFolder && onMoveFolder) {
      await onMoveFolder(folderPath, targetFolder);
    }
  };

  // Native file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onImportFiles) {
      onImportFiles("", e.target.files);
    }
  };

  // Render individual tree node recursively
  const renderNode = (node: TreeNode): React.ReactNode => {
    if (node.kind === "folder") {
      const isRoot = node.id === "Root" || node.path === "";
      const isCollapsed = !isRoot && !!collapsedFolders[node.path || node.name];
      const isDragTarget = dragOverFolder === node.path;
      const folderKey = node.path || node.name;

      return (
        <div
          key={node.id}
          style={{ marginBottom: "2px" }}
          onDragOver={(e) => handleDragOver(e, node.path)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, node.path)}
        >
          {/* Don't render folder header for synthetic root if empty name, unless root items need container */}
          {!isRoot && (
            <div
              className={`folder-item-header ${isDragTarget ? "drag-over" : ""}`}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  kind: "folder",
                  targetNode: node,
                });
              }}
              draggable
              onDragStart={(e) => handleDragStart(e, node)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                paddingRight: "6px",
                paddingLeft: `${Math.max(0, (node.depth - 1) * 12)}px`,
                borderRadius: 0,
                background: isDragTarget ? "var(--accent-subtle, rgba(200, 150, 60, 0.15))" : "transparent",
                outline: isDragTarget ? "1px dashed var(--accent)" : "none",
              }}
              data-od-id={`folder-header-${node.name}`}
              data-testid={`folder-header-${node.name}`}
            >
              <button
                type="button"
                onClick={() => onToggleFolder(folderKey)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleFolder(folderKey);
                  } else if (e.key === "F2") {
                    e.preventDefault();
                    handleStartRename(node);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-expanded={!isCollapsed}
                aria-label={`Toggle ${node.name} folder`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "4px 6px",
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
                    transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                    transition: "transform 0.15s ease",
                    color: "var(--muted)",
                    flexShrink: 0,
                  }}
                />
                <FolderIcon folderName={node.name} isExpanded={!isCollapsed} size={13} />
                {editingNodeId === node.id ? (
                  <input
                    ref={editInputRef}
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={() => handleCommitRename(node)}
                    onKeyDown={(e) => handleKeyDownRename(e, node)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "var(--bg)",
                      color: "var(--fg)",
                      border: "1px solid var(--accent)",
                      padding: "1px 4px",
                      fontSize: "12px",
                      outline: "none",
                      width: "80%",
                    }}
                  />
                ) : (
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(node);
                    }}
                  >
                    {node.name}
                  </span>
                )}
              </button>

              {/* Action Plus Button */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (setActiveFolderDropdown) {
                      setActiveFolderDropdown(
                        activeFolderDropdown === folderKey ? null : folderKey,
                      );
                    }
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--muted)",
                    cursor: "pointer",
                    padding: "2px 5px",
                    display: "flex",
                    alignItems: "center",
                    fontSize: "13px",
                    fontWeight: "bold",
                  }}
                  title="Folder options..."
                  data-od-id={`folder-actions-${node.name}`}
                >
                  +
                </button>
                {renderFolderDropdown && renderFolderDropdown(folderKey)}
              </div>
            </div>
          )}

          {/* Children container */}
          {(!isCollapsed || isRoot) && (
            <div
              style={{
                paddingLeft: isRoot ? 0 : "12px",
                borderLeft: isRoot ? "none" : "1px solid var(--border)",
                marginLeft: isRoot ? 0 : `${Math.max(6, (node.depth - 1) * 12 + 6)}px`,
                display: "flex",
                flexDirection: "column",
                gap: "1px",
                marginTop: "1px",
              }}
            >
              {node.children.map(renderNode)}
            </div>
          )}
        </div>
      );
    }

    // Render Note Leaf Item
    const note = node.note!;
    const isSelected = selectedNoteId === note.id;
    const customIcon = note.frontmatter?.icon;

    return (
      <div
        key={node.id}
        draggable
        onDragStart={(e) => handleDragStart(e, node)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            kind: "note",
            targetNode: node,
          });
        }}
        className={`nav-item ${isSelected ? "active" : ""}`}
        onClick={() => onSelectNote(note.id)}
        onKeyDown={(e) => {
          if (e.key === "F2") {
            e.preventDefault();
            handleStartRename(node);
          }
        }}
        tabIndex={0}
        role="button"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 8px",
          paddingLeft: `${Math.max(8, node.depth * 8)}px`,
          cursor: "pointer",
          fontSize: "12px",
          color: isSelected ? "var(--fg)" : "var(--muted)",
          background: isSelected ? "var(--surface-hover, rgba(255, 255, 255, 0.05))" : "transparent",
          border: "none",
          width: "100%",
          textAlign: "left",
          fontFamily: "var(--font-body)",
          userSelect: "none",
          borderRadius: 0,
        }}
        data-od-id={`tree-note-${note.id}`}
        data-testid={`tree-note-${note.id}`}
      >
        <NoteIcon
          type={typeof note.frontmatter?.type === "string" ? note.frontmatter.type : undefined}
          iconName={typeof customIcon === "string" ? customIcon : undefined}
          path={note.path}
          size={13}
          style={{ color: isSelected ? "var(--accent)" : "var(--muted)" }}
        />

        {editingNodeId === node.id ? (
          <input
            ref={editInputRef}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => handleCommitRename(node)}
            onKeyDown={(e) => handleKeyDownRename(e, node)}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)",
              color: "var(--fg)",
              border: "1px solid var(--accent)",
              padding: "1px 4px",
              fontSize: "12px",
              outline: "none",
              width: "80%",
            }}
          />
        ) : (
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleStartRename(node);
            }}
          >
            {node.name}
          </span>
        )}
      </div>
    );
  };

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    const handleGlobalClick = () => {
      if (contextMenu) closeContextMenu();
      if (showSortDropdown) setShowSortDropdown(false);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, [contextMenu, showSortDropdown, closeContextMenu]);

  return (
    <div
      className={`vault-tree-container ${className || ""}`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        userSelect: "none",
        ...style,
      }}
      onDragOver={(e) => handleDragOver(e, "")}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, "")}
    >
      {/* Hidden file input for native file dialog fallback */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        multiple
        style={{ display: "none" }}
      />

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          padding: "4px 8px 8px 8px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => onNewNote()}
            style={{
              flex: 1,
              padding: "5px 6px",
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
            <FilePlus size={12} /> Note
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onNewFolder()}
            style={{
              flex: 1,
              padding: "5px 6px",
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

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              if (onOpenImportDialog) {
                onOpenImportDialog();
              } else {
                fileInputRef.current?.click();
              }
            }}
            style={{
              padding: "5px 7px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              cursor: "pointer",
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
            }}
            title="Import files into vault"
            data-od-id="vault-import-btn"
          >
            <Upload size={12} />
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setShowSortDropdown(!showSortDropdown);
            }}
            style={{
              padding: "5px 7px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              cursor: "pointer",
              background: showSortDropdown ? "var(--surface-hover)" : "transparent",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
              position: "relative",
            }}
            title="Sort options"
            data-od-id="vault-sort-btn"
          >
            <ArrowUpDown size={12} />
          </button>

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShowSearch(!showSearch)}
            style={{
              padding: "5px 7px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              cursor: "pointer",
              background: showSearch ? "var(--surface-hover)" : "transparent",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
            }}
            title="Filter tree"
          >
            <Search size={12} />
          </button>
        </div>

        {/* Sort dropdown menu */}
        {showSortDropdown && (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "4px 0",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setSortMode("name-asc");
                setShowSortDropdown(false);
              }}
              style={{
                padding: "6px 12px",
                background: sortMode === "name-asc" ? "var(--surface-hover)" : "transparent",
                border: "none",
                textAlign: "left",
                fontSize: "11px",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            >
              Name (A to Z)
            </button>
            <button
              type="button"
              onClick={() => {
                setSortMode("name-desc");
                setShowSortDropdown(false);
              }}
              style={{
                padding: "6px 12px",
                background: sortMode === "name-desc" ? "var(--surface-hover)" : "transparent",
                border: "none",
                textAlign: "left",
                fontSize: "11px",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            >
              Name (Z to A)
            </button>
            <button
              type="button"
              onClick={() => {
                setSortMode("date-desc");
                setShowSortDropdown(false);
              }}
              style={{
                padding: "6px 12px",
                background: sortMode === "date-desc" ? "var(--surface-hover)" : "transparent",
                border: "none",
                textAlign: "left",
                fontSize: "11px",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            >
              Date (Newest First)
            </button>
            <button
              type="button"
              onClick={() => {
                setSortMode("date-asc");
                setShowSortDropdown(false);
              }}
              style={{
                padding: "6px 12px",
                background: sortMode === "date-asc" ? "var(--surface-hover)" : "transparent",
                border: "none",
                textAlign: "left",
                fontSize: "11px",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            >
              Date (Oldest First)
            </button>
          </div>
        )}

        {/* Search filter bar */}
        {showSearch && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              padding: "3px 6px",
            }}
          >
            <Search size={11} style={{ color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="Filter notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "11px",
                color: "var(--fg)",
                width: "100%",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  padding: "0 2px",
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {title && (
        <span
          className="section-label"
          style={{
            marginLeft: 8,
            display: "block",
            marginTop: "6px",
            marginBottom: "4px",
          }}
        >
          {title}
        </span>
      )}

      {/* Tree Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 0",
        }}
      >
        {rootTree.children.length === 0 ? (
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              fontSize: "12px",
              color: "var(--muted)",
            }}
          >
            {searchQuery ? "No matching files" : "Vault is empty"}
          </div>
        ) : (
          rootTree.children.map(renderNode)
        )}
      </div>

      {/* Context Menu Overlay */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
          }}
          onClick={closeContextMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeContextMenu();
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: contextMenu.y,
              left: contextMenu.x,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "4px 0",
              minWidth: "160px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {contextMenu.kind === "note" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onSelectNote(contextMenu.targetNode.note!.id);
                    closeContextMenu();
                  }}
                  style={contextMenuItemStyle}
                >
                  <Eye size={12} /> Open Note
                </button>
                <button
                  type="button"
                  onClick={() => handleStartRename(contextMenu.targetNode)}
                  style={contextMenuItemStyle}
                >
                  <PenLine size={12} /> Rename (F2)
                </button>
                {onChangeNoteIcon && (
                  <button
                    type="button"
                    onClick={() => {
                      setIconPickerNote(contextMenu.targetNode.note!);
                      closeContextMenu();
                    }}
                    style={contextMenuItemStyle}
                  >
                    <Sparkles size={12} /> Change Icon
                  </button>
                )}
                {onDuplicateNote && (
                  <button
                    type="button"
                    onClick={() => {
                      onDuplicateNote(contextMenu.targetNode.note!);
                      closeContextMenu();
                    }}
                    style={contextMenuItemStyle}
                  >
                    <Copy size={12} /> Duplicate
                  </button>
                )}
                {onArchiveNote && (
                  <button
                    type="button"
                    onClick={() => {
                      onArchiveNote(contextMenu.targetNode.note!);
                      closeContextMenu();
                    }}
                    style={contextMenuItemStyle}
                  >
                    <Archive size={12} /> Archive Note
                  </button>
                )}
                {onRevealInFileManager && (
                  <button
                    type="button"
                    onClick={() => {
                      onRevealInFileManager(contextMenu.targetNode.path);
                      closeContextMenu();
                    }}
                    style={contextMenuItemStyle}
                  >
                    <FolderOpen size={12} /> Reveal in Finder
                  </button>
                )}
                <div style={{ height: "1px", background: "var(--border)", margin: "4px 0" }} />
                <button
                  type="button"
                  onClick={() => {
                    onTrashNote(contextMenu.targetNode.path);
                    closeContextMenu();
                  }}
                  style={{ ...contextMenuItemStyle, color: "var(--danger)" }}
                >
                  <Trash2 size={12} /> Move to Trash
                </button>
              </>
            )}

            {contextMenu.kind === "folder" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onNewNote(contextMenu.targetNode.path);
                    closeContextMenu();
                  }}
                  style={contextMenuItemStyle}
                >
                  <Plus size={12} /> New Note
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNewFolder(contextMenu.targetNode.path);
                    closeContextMenu();
                  }}
                  style={contextMenuItemStyle}
                >
                  <FolderPlus size={12} /> New Subfolder
                </button>
                <button
                  type="button"
                  onClick={() => handleStartRename(contextMenu.targetNode)}
                  style={contextMenuItemStyle}
                >
                  <PenLine size={12} /> Rename (F2)
                </button>
                {onArchiveFolder && (
                  <button
                    type="button"
                    onClick={() => {
                      onArchiveFolder(contextMenu.targetNode.path);
                      closeContextMenu();
                    }}
                    style={contextMenuItemStyle}
                  >
                    <Archive size={12} /> Archive Folder
                  </button>
                )}
                {onRevealInFileManager && (
                  <button
                    type="button"
                    onClick={() => {
                      onRevealInFileManager(contextMenu.targetNode.path);
                      closeContextMenu();
                    }}
                    style={contextMenuItemStyle}
                  >
                    <FolderOpen size={12} /> Reveal in Finder
                  </button>
                )}
                <div style={{ height: "1px", background: "var(--border)", margin: "4px 0" }} />
                <button
                  type="button"
                  onClick={() => {
                    onTrashFolder(contextMenu.targetNode.path);
                    closeContextMenu();
                  }}
                  style={{ ...contextMenuItemStyle, color: "var(--danger)" }}
                >
                  <Trash2 size={12} /> Delete Folder
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Icon Picker Modal */}
      {iconPickerNote && (
        <IconPickerModal
          open={!!iconPickerNote}
          currentIcon={typeof iconPickerNote.frontmatter?.icon === "string" ? iconPickerNote.frontmatter.icon : undefined}
          onClose={() => setIconPickerNote(null)}
          onSelect={async (newIcon) => {
            if (onChangeNoteIcon && iconPickerNote) {
              await onChangeNoteIcon(iconPickerNote, newIcon);
            }
            setIconPickerNote(null);
          }}
        />
      )}
    </div>
  );
};

const contextMenuItemStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--fg)",
  padding: "6px 12px",
  fontSize: "12px",
  textAlign: "left",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
};
