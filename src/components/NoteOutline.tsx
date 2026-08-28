import React, { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { parseOutline, OutlineNode } from "../utils/outline";

interface NoteOutlineProps {
  content: string;
}

/**
 * Dynamic outliner for a note's read-mode view.
 *
 * Parses the note's markdown headings into a nested tree and renders it as a
 * collapsible outline. Renders nothing when the note has no headings.
 */
export const NoteOutline: React.FC<NoteOutlineProps> = ({ content }) => {
  const tree = useMemo(() => parseOutline(content), [content]);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  if (tree.length === 0) return null;

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

  const renderNode = (node: OutlineNode, path: string, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedPaths.has(path);

    return (
      <div key={path}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "3px 4px",
            cursor: hasChildren ? "pointer" : "default",
            fontSize: "12px",
            color: "var(--fg)",
            paddingLeft: `${depth * 14 + 4}px`,
          }}
          onClick={() => hasChildren && toggle(path)}
          role={hasChildren ? "button" : undefined}
          data-od-id={`outline-node-${path}`}
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
          <span style={{ fontWeight: depth === 0 ? 600 : 400 }}>{node.text}</span>
        </div>
        {!isCollapsed && node.children.map((child) => renderNode(child, `${path}/${child.text}`, depth + 1))}
      </div>
    );
  };

  return (
    <div
      style={{
        width: "200px",
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        alignSelf: "flex-start",
        position: "sticky",
        top: 0,
        maxHeight: "70vh",
        overflowY: "auto",
      }}
      data-od-id="note-outline"
    >
      <span
        style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--muted)",
        }}
      >
        Outline
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {tree.map((node) => renderNode(node, node.text, 0))}
      </div>
    </div>
  );
};
