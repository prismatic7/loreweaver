import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Maximize2, Network } from "lucide-react";
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

const SOURCE_COLOR = "oklch(60% 0.10 28)";

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

/**
 * Deterministic Fruchterman-Reingold force-directed layout.
 * Seeded PRNG (mulberry32, seed=42) guarantees identical output across
 * renders, machines, and sessions — no jitter on filter change.
 * ~100 lines, no dependencies. Runs in useMemo on [nodes, edges, filter].
 */
function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  W = 800,
  H = 600,
): GraphNode[] {
  const N = nodes.length;
  if (N === 0) return nodes;

  // 1. Deterministic PRNG (mulberry32, seed=42)
  let seed = 42;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // 2. Initialise positions randomly within canvas bounds
  const pos = new Map<string, { x: number; y: number }>();
  nodes.forEach((n) => {
    pos.set(n.id, { x: rng() * W, y: rng() * H });
  });

  // 3. Ideal edge length scales with node count
  const k = 0.8 * Math.sqrt((W * H) / Math.max(N, 1));
  const kSq = k * k;

  // 4. Adjacency list for attraction
  const adj = new Map<string, Set<string>>();
  nodes.forEach((n) => adj.set(n.id, new Set()));
  edges.forEach((e) => {
    adj.get(e.from)?.add(e.to);
    adj.get(e.to)?.add(e.from);
  });

  // 5. Iterate (fixed count for determinism)
  const iterations = 300;
  let temp = W * 0.1;
  const cooling = 0.95;
  const gravity = 0.04;
  const cx = W / 2;
  const cy = H / 2;

  for (let iter = 0; iter < iterations; iter++) {
    const disp = new Map<string, { x: number; y: number }>();
    nodes.forEach((n) => disp.set(n.id, { x: 0, y: 0 }));

    // Repulsion (all pairs)
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      const pa = pos.get(a.id)!;
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        const pb = pos.get(b.id)!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const repulsion = kSq / dist;
        const fx = (dx / dist) * repulsion;
        const fy = (dy / dist) * repulsion;
        disp.get(a.id)!.x += fx;
        disp.get(a.id)!.y += fy;
        disp.get(b.id)!.x -= fx;
        disp.get(b.id)!.y -= fy;
      }
    }

    // Attraction (edges only)
    edges.forEach((e) => {
      const pa = pos.get(e.from)!;
      const pb = pos.get(e.to)!;
      let dx = pa.x - pb.x;
      let dy = pa.y - pb.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const attraction = (dist * dist) / k;
      const fx = (dx / dist) * attraction;
      const fy = (dy / dist) * attraction;
      disp.get(e.from)!.x -= fx;
      disp.get(e.from)!.y -= fy;
      disp.get(e.to)!.x += fx;
      disp.get(e.to)!.y += fy;
    });

    // Gravity (pull toward centre)
    nodes.forEach((n) => {
      const p = pos.get(n.id)!;
      disp.get(n.id)!.x += (cx - p.x) * gravity;
      disp.get(n.id)!.y += (cy - p.y) * gravity;
    });

    // Apply displacement with temperature limiting
    nodes.forEach((n) => {
      const p = pos.get(n.id)!;
      const d = disp.get(n.id)!;
      let dist = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const limited = Math.min(dist, temp);
      p.x += (d.x / dist) * limited;
      p.y += (d.y / dist) * limited;
      p.x = Math.max(-100, Math.min(W + 100, p.x));
      p.y = Math.max(-100, Math.min(H + 100, p.y));
    });

    temp *= cooling;
  }

  // 6. Overlap resolution pass (min 60px centre-to-centre)
  const minSep = 60;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const pa = pos.get(nodes[i].id)!;
      const pb = pos.get(nodes[j].id)!;
      let dx = pb.x - pa.x;
      let dy = pb.y - pa.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minSep) {
        const push = (minSep - dist) / 2;
        const nx = dx / (dist || 0.01);
        const ny = dy / (dist || 0.01);
        pa.x -= nx * push;
        pa.y -= ny * push;
        pb.x += nx * push;
        pb.y += ny * push;
      }
    }
  }

  return nodes.map((n) => ({
    ...n,
    x: pos.get(n.id)!.x,
    y: pos.get(n.id)!.y,
  }));
}

export const EntityGraphView: React.FC<EntityGraphViewProps> = ({
  notes,
  onOpenNote,
  noteTypes = DEFAULT_NOTE_TYPES,
  provenanceTaxonomy = DEFAULT_PROVENANCE_TAXONOMY,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [filter, setFilter] = useState<ProvenanceFilter>("all");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

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
    entityNotes.forEach((note) => {
      const type = String(note.frontmatter?.type || "npc").toLowerCase();
      nodeMap.set(note.id, {
        id: note.id,
        label: note.title,
        type,
        x: 0,
        y: 0,
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
        nodeMap.set(sourceNodeId, {
          id: sourceNodeId,
          label: source.title || source.url || source.id,
          type: source.source_type || "source",
          x: 0,
          y: 0,
          kind: "source",
        });
        sourceNodeIds.add(sourceNodeId);
      }
      addEdge(note.id, sourceNodeId, "source");
    });

    // Force-directed layout on entity nodes only (sources are pinned after).
    // Filter edges to entity↔entity pairs — source edges reference nodes that
    // aren't part of the simulation and would crash the layout.
    const entityNodes = Array.from(nodeMap.values()).filter(
      (n) => n.kind === "entity",
    );
    const entityIds = new Set(entityNodes.map((n) => n.id));
    const entityEdges = edgeList.filter(
      (e) => entityIds.has(e.from) && entityIds.has(e.to),
    );
    const laidOut = layoutGraph(entityNodes, entityEdges);

    // Pin source nodes to a left rail, stacked vertically, left of the
    // leftmost entity. Sources don't participate in the simulation so they
    // can't pull entities leftward.
    const sourceNodes = Array.from(nodeMap.values()).filter(
      (n) => n.kind === "source",
    );
    const minX = laidOut.length
      ? Math.min(...laidOut.map((n) => n.x))
      : 400;
    const minY = laidOut.length
      ? Math.min(...laidOut.map((n) => n.y))
      : 300;
    const railX = minX - 80;
    sourceNodes.forEach((n, i) => {
      n.x = railX;
      n.y = minY + i * 60;
    });

    const finalNodes = [...laidOut, ...sourceNodes];

    return { nodes: finalNodes, edges: edgeList };
  }, [notes, sources, filter, entityTypeIds]);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || nodes.length === 0 || !el.clientWidth || !el.clientHeight) return;
    const pad = 60;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const w = maxX - minX;
    const h = maxY - minY;
    const s = Math.min(el.clientWidth / w, el.clientHeight / h, 1.5);
    const z = Math.max(0.25, s);
    setZoom(z);
    setPan({
      x: (el.clientWidth - w * z) / 2 - minX * z,
      y: (el.clientHeight - h * z) / 2 - minY * z,
    });
  }, [nodes]);

  // Adjacency set for edge highlighting on hover/selection.
  const adjacencySet = useMemo(() => {
    const set = new Set<string>();
    edges.forEach((e) => {
      set.add(`${e.from}|${e.to}`);
      set.add(`${e.to}|${e.from}`);
    });
    return set;
  }, [edges]);

  const isAdjacent = (id: string) =>
    hoveredId !== null
      ? adjacencySet.has(`${hoveredId}|${id}`) || adjacencySet.has(`${id}|${hoveredId}`)
      : selectedId !== null
        ? adjacencySet.has(`${selectedId}|${id}`) || adjacencySet.has(`${id}|${selectedId}`)
        : true;

  const isEdgeActive = (e: GraphEdge) =>
    hoveredId !== null
      ? e.from === hoveredId || e.to === hoveredId
      : selectedId !== null
        ? e.from === selectedId || e.to === selectedId
        : true;

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  const onWheel = (e: React.WheelEvent) => {
    if (nodes.length === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // Reciprocal factors so zooming in then out returns to exactly 100% (1.1 × 1/1.1 = 1).
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    setZoom((z) => {
      const newZoom = Math.min(3.0, Math.max(0.25, z * factor));
      const actualFactor = newZoom / z;
      // Adjust pan so the point under the cursor stays fixed (zoom-to-cursor).
      setPan((p) => ({
        x: mousePos.x - (mousePos.x - p.x) * actualFactor,
        y: mousePos.y - (mousePos.y - p.y) * actualFactor,
      }));
      return newZoom;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest("g")) return; // nodes/edges handle their own pointer events
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setIsPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setIsPanning(false);
  };

  if (nodes.length === 0) {
    // Distinguish "no notes match the active provenance filter" from
    // "no entity-typed notes exist at all". With a provenance filter active
    // and zero matching notes, the previous message wrongly told users to
    // add entity-typed notes when the real cause was the source_type gate.
    const provenanceMatches =
      filter === "all"
        ? notes.length
        : notes.filter(
            (n) =>
              String(n.frontmatter?.source_type || "").toLowerCase() ===
              filter,
          ).length;
    const filterEmpty = filter !== "all" && provenanceMatches === 0;

    return (
      <div
        className="view-container"
        data-od-id="entity-graph-view"
        style={{ padding: "40px 32px" }}
      >
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>
          Entity Graph
        </h2>
        {filterEmpty ? (
          <>
            <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
              No notes match the{" "}
              <strong style={{ color: "var(--fg)" }}>{filter}</strong>{" "}
              provenance filter. Notes only appear here once they have a{" "}
              <code>source_type</code> frontmatter value matching the filter.
            </p>
            <button
              className="btn btn-sm"
              onClick={() => setFilter("all")}
              style={{ marginTop: "12px" }}
              data-od-id="graph-filter-reset"
            >
              Show all notes
            </button>
          </>
        ) : (
          <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
            No entities found. Add notes with a frontmatter{" "}
            <code>type</code> of <code>npc</code>, <code>location</code>,{" "}
            <code>faction</code>, <code>item</code>, or <code>event</code> to
            see them here.
          </p>
        )}
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
          height: "44px",
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Network size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg)" }}>
            Entity &amp; Relationship Graph
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderBottom:
                    filter === opt.value ? "2px solid var(--accent)" : "1px solid var(--border)",
                  color:
                    filter === opt.value ? "var(--fg)" : "var(--muted)",
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
          <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 8px" }} />
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            {nodes.length} nodes · {edges.length} relationships
          </span>
          <span style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="btn btn-sm"
            onClick={fitToView}
            title="Fit Graph to View"
            data-od-id="graph-fit-btn"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        data-od-id="entity-graph-canvas"
        style={{ flex: 1, overflow: "hidden", position: "relative", cursor: isPanning ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <svg
          width="100%"
          height="100%"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            fontFamily: "var(--font-body)",
          }}
        >
          {/* Edges */}
          {edges.map((e, i) => {
            const from = nodes.find((n) => n.id === e.from);
            const to = nodes.find((n) => n.id === e.to);
            if (!from || !to) return null;
            const isSourceEdge = e.label === "source";
            const active = isEdgeActive(e);
            const dimmed = !active;
            return (
              <g key={i} opacity={dimmed ? 0.25 : 1}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isSourceEdge ? SOURCE_COLOR : "var(--border)"}
                  strokeWidth={active ? (isSourceEdge ? 1.5 : 2) : 1}
                  strokeDasharray={isSourceEdge ? "4 3" : undefined}
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 6}
                  fontSize="10"
                  fontFamily="var(--font-body)"
                  fill="var(--fg)"
                  opacity={0.65}
                  textAnchor="middle"
                  paintOrder="stroke"
                  stroke="var(--surface)"
                  strokeWidth={3}
                  strokeLinejoin="round"
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
              : typeColors[n.type] || "var(--muted)";
            const isSelected = selectedId === n.id;
            const isHovered = hoveredId === n.id;
            const dimmed = !isAdjacent(n.id);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onClick={() => {
                  setSelectedId(n.id);
                  if (!isSource) onOpenNote(n.id);
                }}
                onMouseEnter={() => setHoveredId(n.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: isSource ? "default" : "pointer" }}
                opacity={dimmed ? 0.35 : 1}
              >
                {isSource ? (
                  <rect
                    x={-22}
                    y={-22}
                    width={44}
                    height={44}
                    rx={0}
                    fill={color}
                    stroke={isHovered ? "var(--accent)" : "var(--surface)"}
                    strokeWidth={isHovered ? 2 : 1.5}
                  />
                ) : (
                  <circle
                    r={isSelected ? 28 : 24}
                    fill={color}
                    stroke={isHovered ? "var(--accent)" : "var(--surface)"}
                    strokeWidth={isHovered ? 2 : 1.5}
                  />
                )}
                <text
                  y="4"
                  fontSize="12"
                  fontFamily="var(--font-body)"
                  textAnchor="middle"
                  fill="#fff"
                  fontWeight="bold"
                >
                  {n.label.charAt(0).toUpperCase()}
                </text>
                <text
                  y={isSelected ? 44 : 40}
                  fontSize="11"
                  fontFamily="var(--font-body)"
                  textAnchor="middle"
                  fill="var(--fg)"
                  fontWeight={600}
                  paintOrder="stroke"
                  stroke="var(--surface)"
                  strokeWidth={3}
                  strokeLinejoin="round"
                >
                  {n.label}
                </text>
                <text
                  y="52"
                  fontSize="11"
                  fontFamily="var(--font-body)"
                  textAnchor="middle"
                  fill="var(--muted)"
                  paintOrder="stroke"
                  stroke="var(--surface)"
                  strokeWidth={3}
                  strokeLinejoin="round"
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
