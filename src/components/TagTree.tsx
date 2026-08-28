import React, { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Tag } from "lucide-react";
import { CampaignNote } from "../types";
import { buildTagTree, TagNode } from "../utils/tags";

interface TagTreeProps {
  notes: CampaignNote[];
  setSelectedNoteId: (id: string) => void;
}

/**
 * Collapsible tag-hierarchy tree for the vault.
 *
 * Consumes {@link buildTagTree}: a tag like `#campaign/arc1/act3` renders as
 * campaign ▸ arc1 ▸ act3, with the notes carrying that exact tag listed as
 * clickable rows under the deepest node. Branches expand/collapse on click.
 */
export const TagTree: React.FC<TagTreeProps> = ({ notes, setSelectedNoteId }) => {
  const roots = useMemo(() => buildTagTree(notes), [notes]);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  if (roots.length === 0) {
    return (
      <div
        style={{
          fontSize: "12px",
          color: "var(--muted)",
          fontStyle: "italic",
        }}
      >
        No tags in this vault.
      </div>
    );
  }

  const toggle = (path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: TagNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedPaths.has(node.path);
    const indent = { paddingLeft: `${depth * 14 + 4}px` };

    return (
      <div key={node.path}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 4px",
            cursor: hasChildren ? "pointer" : "default",
            fontSize: "12px",
            color: "var(--fg)",
            ...indent,
          }}
          onClick={() => hasChildren && toggle(node.path)}
          role={hasChildren ? "button" : undefined}
          data-od-id={`tag-node-${node.path}`}
        >
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight size={12} style={{ color: "var(--muted)", flexShrink: 0 }} />
            ) : (
              <ChevronDown size={12} style={{ color: "var(--muted)", flexShrink: 0 }} />
            )
          ) : (
            <span style={{ width: 12, flexShrink: 0 }} />
          )}
          <Tag size={11} style={{ color: "var(--muted)", flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>{node.name}</span>
        </div>

        {!isCollapsed && (
          <>
            {node.noteIds.map((noteId) => {
              const note = notes.find((n) => n.id === noteId);
              if (!note) return null;
              return (
                <button
                  key={noteId}
                  type="button"
                  className="nav-item"
                  onClick={() => setSelectedNoteId(noteId)}
                  style={{
                    padding: "3px 8px",
                    fontSize: "12px",
                    textAlign: "left",
                    justifyContent: "flex-start",
                    cursor: "pointer",
                    ...indent,
                  }}
                  data-od-id={`tag-note-${node.path}-${noteId}`}
                >
                  {note.title}
                </button>
              );
            })}
            {node.children.map((child) => renderNode(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>{roots.map((node) => renderNode(node, 0))}</div>;
};
