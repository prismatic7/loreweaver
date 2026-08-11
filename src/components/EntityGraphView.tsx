import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CampaignNote,
  DEFAULT_NOTE_TYPES,
  DEFAULT_PROVENANCE_TAXONOMY,
  NoteType,
  ProvenanceType,
  SourceEntry,
} from "../types";

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
  kind: "entity" | "source";
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

interface EntityGraphViewProps {
  notes: CampaignNote[];
  onOpenNote: (noteId: string) => void;
  /** World note types; falls back to DEFAULT_NOTE_TYPES for legacy vaults. */
  noteTypes?: NoteType[];
  /** World provenance taxonomy; falls back to DEFAULT_PROVENANCE_TAXONOMY. */
  provenanceTaxonomy?: ProvenanceType[];
}

type ProvenanceFilter = string; // "all" | any provenance id from the taxonomy

const SOURCE_COLOR = "oklch(70% 0.12 45)";

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
  noteTypes = DEFAULT_NOTE_TYPES,
  provenanceTaxonomy = DEFAULT_PROVENANCE_TAXONOMY,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [filter, setFilter] = useState<ProvenanceFilter>("all");

  const typeColors = useMemo(() => {
    const map: Record<string, string> = {};
    noteTypes.forEach((t) => {
      map[t.id] = t.color;
    });
    return map;
  }, [noteTypes]);

  const entityTypeIds = useMemo(
    () => new Set(noteTypes.map((t) => t.id)),
    [noteTypes],
  );

  useEffect(() => {
    let cancelled = false;
    invoke<SourceEntry[]>("list_sources")
      .then((data) => {
        if (!cancelled) setSources(data || []);
      })
      .catch((err) => console.error("Failed loading sources:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const { nodes, edges } = useMemo(() => {
    // Apply the provenance filter to the note set before building the graph.
    const filteredNotes =
      filter === "all"
        ? notes
        : notes.filter(
            (n) =>
              String(n.frontmatter?.source_type || "").toLowerCase() === filter,
          );

    // Build entity nodes from notes that have a meaningful `type`.
    const entityNotes = filteredNotes.filter((n) => {
      const type = String(n.frontmatter?.type || "").toLowerCase();
      return entityTypeIds.has(type);
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
        kind: "entity",
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

    // Add source nodes and provenance edges. A note links to its source via
    // `source_id` frontmatter (falling back to `source_url`).
    const sourceById = new Map(sources.map((s) => [s.id, s]));
    const sourceByUrl = new Map(
      sources.filter((s) => s.url).map((s) => [s.url, s]),
    );
    const sourceNodeIds = new Set<string>();
    const sourceAngleOffset = 0.4;

    entityNotes.forEach((note) => {
      const sourceId = note.frontmatter?.source_id;
      const sourceUrl = note.frontmatter?.source_url;
      let source: SourceEntry | undefined;
      if (typeof sourceId === "string" && sourceById.has(sourceId)) {
        source = sourceById.get(sourceId);
      } else if (typeof sourceUrl === "string" && sourceByUrl.has(sourceUrl)) {
        source = sourceByUrl.get(sourceUrl);
      }
      if (!source) return;

      const sourceNodeId = `source-${source.id}`;
      if (!nodeMap.has(sourceNodeId)) {
        const angle =
          sourceAngleOffset +
          (sourceNodeIds.size / Math.max(sources.length, 1)) * 2 * Math.PI;
        const radius = 360;
        nodeMap.set(sourceNodeId, {
          id: sourceNodeId,
          label: source.title || source.url || source.id,
          type: source.source_type || "source",
          x: 400 + Math.cos(angle) * radius,
          y: 300 + Math.sin(angle) * radius,
          kind: "source",
        });
        sourceNodeIds.add(sourceNodeId);
      }
      addEdge(note.id, sourceNodeId, "source");
    });

    return { nodes: Array.from(nodeMap.values()), edges: edgeList };
  }, [notes, sources, filter, entityTypeIds]);

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

  const filterOptions: Array<{ value: ProvenanceFilter; label: string }> = [
    { value: "all", label: "All" },
    ...provenanceTaxonomy.map((p) => ({ value: p.id, label: p.label })),
  ];

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
          gap: "16px",
        }}
      >
        <span className="panel-title">Entity &amp; Relationship Graph</span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                style={{
                  background:
                    filter === opt.value ? "var(--border)" : "transparent",
                  border: "1px solid var(--border)",
                  color:
                    filter === opt.value ? "var(--accent)" : "var(--muted)",
                  padding: "4px 10px",
                  borderRadius: 0,
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
                data-od-id={`graph-filter-${opt.value}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            {nodes.length} nodes · {edges.length} relationships
          </span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <svg width="100%" height="100%" style={{ minWidth: 800, minHeight: 600 }}>
          {/* Edges */}
          {edges.map((e, i) => {
            const from = nodes.find((n) => n.id === e.from);
            const to = nodes.find((n) => n.id === e.to);
            if (!from || !to) return null;
            const isSourceEdge = e.label === "source";
            return (
              <g key={i}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isSourceEdge ? SOURCE_COLOR : "var(--border)"}
                  strokeWidth={isSourceEdge ? 1.5 : 1.5}
                  strokeDasharray={isSourceEdge ? "4 3" : undefined}
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
            const isSource = n.kind === "source";
            const color = isSource
              ? SOURCE_COLOR
              : typeColors[n.type] || "oklch(60% 0.15 180)";
            const isSelected = selectedId === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onClick={() => {
                  setSelectedId(n.id);
                  if (!isSource) onOpenNote(n.id);
                }}
                style={{ cursor: isSource ? "default" : "pointer" }}
              >
                {isSource ? (
                  <rect
                    x={-22}
                    y={-22}
                    width={44}
                    height={44}
                    rx={6}
                    fill={color}
                    stroke="var(--surface)"
                    strokeWidth="3"
                  />
                ) : (
                  <circle
                    r={isSelected ? 30 : 26}
                    fill={color}
                    stroke="var(--surface)"
                    strokeWidth="3"
                  />
                )}
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
