import React, { useMemo, useState } from "react";
import { CampaignNote } from "../types";

/**
 * EntityGraphView
 *
 * Renders a relationship graph of campaign entities (NPCs, locations, factions,
 * etc.) derived from note frontmatter `type` and relationships from wiki-links
 * and frontmatter fields. Entities are placed in a simple force-ish layout and
 * connected by edges. Clicking a node opens the note.
 */

interface GraphNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

interface EntityGraphViewProps {
  notes: CampaignNote[];
  onOpenNote: (noteId: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  npc: "oklch(60% 0.22 340)",
  location: "oklch(65% 0.2 260)",
  faction: "oklch(60% 0.15 80)",
  item: "oklch(70% 0.18 140)",
  event: "oklch(75% 0.15 320)",
};

const extractWikiLinks = (text: string): string[] => {
  const links: string[] = [];
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(text || "")) !== null) {
    links.push(match[1].trim());
  }
  return links;
};

const normalize = (str: string) =>
  str.replace(/[\s\-_]/g, "").toLowerCase();

export const EntityGraphView: React.FC<EntityGraphViewProps> = ({
  notes,
  onOpenNote,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { nodes, edges } = useMemo(() => {
    // Build entity nodes from notes that have a meaningful `type`.
    const entityNotes = notes.filter((n) => {
      const type = String(n.frontmatter?.type || "").toLowerCase();
      return ["npc", "location", "faction", "item", "event"].includes(type);
    });

    const nodeMap = new Map<string, GraphNode>();
    entityNotes.forEach((note, i) => {
      const type = String(note.frontmatter?.type || "npc").toLowerCase();
      const angle = (i / Math.max(entityNotes.length, 1)) * 2 * Math.PI;
      const radius = 220;
      nodeMap.set(note.id, {
        id: note.id,
        label: note.title,
        type,
        x: 400 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
      });
    });

    // Build edges from wiki-links and frontmatter relationships.
    const edgeSet = new Set<string>();
    const edgeList: GraphEdge[] = [];
    const addEdge = (fromId: string, toId: string, label: string) => {
      const key = [fromId, toId, label].join("|");
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edgeList.push({ from: fromId, to: toId, label });
    };

    entityNotes.forEach((note) => {
      // Wiki-links in content
      extractWikiLinks(note.content).forEach((target) => {
        const targetNote = notes.find(
          (n) =>
            normalize(n.title) === normalize(target) ||
            normalize(n.path.split("/").pop()?.replace(/\.md$/, "") || "") ===
              normalize(target),
        );
        if (targetNote && targetNote.id !== note.id && nodeMap.has(targetNote.id)) {
          addEdge(note.id, targetNote.id, "references");
        }
      });

      // Frontmatter relationships (string values pointing at other entities)
      Object.entries(note.frontmatter || {}).forEach(([key, value]) => {
        if (["type", "tags", "aliases", "canvaspath", "layout"].includes(key.toLowerCase())) {
          return;
        }
        const targets = Array.isArray(value) ? value : [value];
        targets.forEach((v) => {
          if (typeof v !== "string" || !v.trim()) return;
          const targetNote = notes.find((n) => normalize(n.title) === normalize(v));
          if (targetNote && targetNote.id !== note.id && nodeMap.has(targetNote.id)) {
            addEdge(note.id, targetNote.id, key);
          }
        });
      });
    });

    return { nodes: Array.from(nodeMap.values()), edges: edgeList };
  }, [notes]);

  if (nodes.length === 0) {
    return (
      <div
        className="view-container"
        data-od-id="entity-graph-view"
        style={{ padding: "40px 32px" }}
      >
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>
          Entity Graph
        </h2>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
          No entities found. Add notes with a frontmatter{" "}
          <code>type</code> of <code>npc</code>, <code>location</code>,{" "}
          <code>faction</code>, <code>item</code>, or <code>event</code> to see
          them here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="view-container"
      data-od-id="entity-graph-view"
      style={{ padding: 0, overflow: "hidden" }}
    >
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className="panel-title">Entity &amp; Relationship Graph</span>
        <span style={{ fontSize: "11px", color: "var(--muted)" }}>
          {nodes.length} entities · {edges.length} relationships
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <svg width="100%" height="100%" style={{ minWidth: 800, minHeight: 600 }}>
          {/* Edges */}
          {edges.map((e, i) => {
            const from = nodes.find((n) => n.id === e.from);
            const to = nodes.find((n) => n.id === e.to);
            if (!from || !to) return null;
            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="var(--border)"
                  strokeWidth="1.5"
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 6}
                  fontSize="9"
                  fill="var(--muted)"
                  textAnchor="middle"
                >
                  {e.label}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const color = TYPE_COLORS[n.type] || "oklch(60% 0.15 180)";
            const isSelected = selectedId === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onClick={() => {
                  setSelectedId(n.id);
                  onOpenNote(n.id);
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={isSelected ? 30 : 26}
                  fill={color}
                  stroke="var(--surface)"
                  strokeWidth="3"
                />
                <text
                  y="4"
                  fontSize="12"
                  textAnchor="middle"
                  fill="#fff"
                  fontWeight="bold"
                >
                  {n.label.charAt(0).toUpperCase()}
                </text>
                <text
                  y="44"
                  fontSize="10"
                  textAnchor="middle"
                  fill="var(--fg)"
                  fontWeight={600}
                >
                  {n.label}
                </text>
                <text
                  y="56"
                  fontSize="9"
                  textAnchor="middle"
                  fill="var(--muted)"
                >
                  {n.type}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default EntityGraphView;
