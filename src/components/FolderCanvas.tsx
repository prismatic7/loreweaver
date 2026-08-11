import React, { useState, useEffect, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, ZoomIn, ZoomOut, Save, Layers, Link as LinkIcon, Eye, Zap, Maximize2 } from "lucide-react";

/**
 * FolderCanvas Component
 * Implements an interactive board canvas rendering connections, locations, and notes using vector SVGs.
 * Performs coordinate tracking, pan/zoom transformations, and binds nodes directly to campaign notes.
 * 
 * Educational Notes:
 * - Viewport Zoom/Pan Transforms: Uses SVG coordinate space mapping. `transform: translate(pan.x, pan.y) scale(zoom)` 
 *   is applied to the main container, allowing infinite panning and semantic zooming.
 * - Node Dragging Offset Translations: Dragging calculates the mouse delta scaled inversely by the current zoom level 
 *   to ensure the node stays exactly under the cursor regardless of zoom state.
 * - Folder-to-Node Layout Algorithms: Dynamically generates bounding container boxes for nodes grouped by 
 *   frontmatter tags or folder relationships, computing the bounding box (minX, minY, maxX, maxY) of all child nodes.
 * - Cross-Vault Scoping Constraint: Workspace state access (such as loading folders and nodes) must be 
 *   explicitly scoped by the active campaign vault path to prevent cross-vault data leaks.
 */


const extractWikiLinks = (text: string): string[] => {
  const links: string[] = [];
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(text || "")) !== null) {
    links.push(match[1].trim());
  }
  return links;
};

const getRelationColor = (key: string): string => {
  const k = key.toLowerCase().trim();
  const colors: Record<string, string> = {
    location: "oklch(60% 0.10 28)",  // accent ramp L60
    owner: "oklch(45% 0.12 28)",     // accent ramp L45 (--accent-hover)
    room: "oklch(52% 0.10 28)",      // accent ramp L52 (--accent)
    type: "oklch(70% 0.08 28)",      // accent ramp L70
    parent: "oklch(48% 0.012 70)",   // neutral ramp L48 (--muted)
    npc: "oklch(25% 0.012 70)",      // neutral ramp L25
  };
  return colors[k] || "oklch(60% 0.10 28)"; // Fallback: accent L60
};

interface FrontmatterRelationship {
  key: string;
  target: string;
}

const extractFrontmatterRelationships = (frontmatter: Record<string, any>): FrontmatterRelationship[] => {
  const relationships: FrontmatterRelationship[] = [];
  if (!frontmatter) return relationships;

  for (const [key, value] of Object.entries(frontmatter)) {
    if (["canvaspath", "aliases", "layout"].includes(key.toLowerCase())) {
      continue;
    }
    
    if (key.toLowerCase() === "tags" && Array.isArray(value)) {
      value.forEach((tag) => {
        if (typeof tag === "string" && tag.includes(":")) {
          const parts = tag.split(":");
          const relKey = parts[0].trim();
          const targetVal = parts.slice(1).join(":").trim();
          if (relKey && targetVal) {
            relationships.push({ key: relKey, target: targetVal });
          }
        }
      });
      continue;
    }

    if (["tags", "type"].includes(key.toLowerCase())) {
      continue;
    }

    if (typeof value === "string" && value.trim()) {
      relationships.push({ key, target: value.trim() });
    } else if (Array.isArray(value)) {
      value.forEach((val) => {
        if (typeof val === "string" && val.trim()) {
          relationships.push({ key, target: val.trim() });
        }
      });
    }
  }

  return relationships;
};

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

interface Note {
  id: string;
  title: string;
  path: string;
  frontmatter: Record<string, any>;
  content: string;
}

interface NodePosition {
  id: string; // note id or note path
  x: number;
  y: number;
}

interface EdgeConnection {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  color?: string;
}

interface ContainerBox {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface CanvasData {
  nodes: NodePosition[];
  edges: EdgeConnection[];
  containers: ContainerBox[];
}

interface FolderCanvasProps {
  currentFolder: string;
  activeCanvasPath: string;
  notes: Note[];
  onSelectNote: (noteId: string) => void;
  onSelectCanvas: (canvasPath: string) => void;
}

export const FolderCanvas: React.FC<FolderCanvasProps> = ({
  currentFolder,
  activeCanvasPath,
  notes,
  onSelectNote,
  onSelectCanvas,
}) => {
  const canvasRelPath = activeCanvasPath || `${currentFolder ? currentFolder + "/" : ""}${currentFolder || "root"}.canvas`;
  const [nodes, setNodes] = useState<NodePosition[]>([]);
  const [edges, setEdges] = useState<EdgeConnection[]>([]);
  const [containers, setContainers] = useState<ContainerBox[]>([]);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingEdgeLabel, setEditingEdgeLabel] = useState<string>("");

  const canvasRef = useRef<HTMLDivElement>(null);

  const [dynamicEdges, setDynamicEdges] = useState<EdgeConnection[]>([]);
  const [dynamicContainers, setDynamicContainers] = useState<ContainerBox[]>([]);

  const [templates, setTemplates] = useState<TemplateEntry[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 8000);
  };

  const handleActionClick = (action: TemplateAction, note: Note) => {
    invoke<{ verdict?: string }>("execute_plugin_hook", {
      pluginId: action.plugin,
      hook: action.hook,
      payload: JSON.stringify(note),
    })
      .then((res) => {
        showToast(res.verdict || "Action executed successfully!");
      })
      .catch((err) => {
        showToast(`Error: ${err.toString()}`);
      });
  };

  useEffect(() => {
    invoke<TemplateEntry[]>("list_templates")
      .then((res) => setTemplates(res || []))
      .catch((err) => console.error("Failed to list templates:", err));
  }, [notes.length]);

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener("click", handleClickOutside);
    }
    return () => {
      window.removeEventListener("click", handleClickOutside);
    };
  }, [contextMenu]);

  // Filter notes belonging to current folder or subfolders.
  // Memoized so the derived-edges/containers effects below don't re-run on every
  // render (which previously caused an infinite render loop when setDynamicContainers
  // produced a fresh array each time).
  const folderNotes = useMemo(() => {
    return notes.filter((n) => {
      if (!currentFolder) return true;
      return n.path.startsWith(currentFolder);
    });
  }, [notes, currentFolder]);

  const findTargetNote = (target: string) => {
    const cleanTarget = target.replace(/[\[\]]/g, "").trim().toLowerCase();
    if (!cleanTarget) return null;

    const normalize = (str: string) => str.replace(/[\s\-_]/g, "").toLowerCase();
    const normalizedTarget = normalize(cleanTarget);

    return notes.find((n) => {
      if (normalize(n.title) === normalizedTarget) return true;
      const filename = n.path.split("/").pop()?.replace(/\.md$/, "") || "";
      if (normalize(filename) === normalizedTarget) return true;
      const aliases = n.frontmatter?.aliases || [];
      if (Array.isArray(aliases)) {
        return aliases.some(alias => normalize(String(alias)) === normalizedTarget);
      }
      return false;
    });
  };

  useEffect(() => {
    const derivedEdges: EdgeConnection[] = [];

    folderNotes.forEach((note) => {
      // 1. Content wiki links
      const contentWikiLinks = extractWikiLinks(note.content);
      contentWikiLinks.forEach((target) => {
        const targetNote = findTargetNote(target);
        if (targetNote && targetNote.id !== note.id) {
          const edgeId = `dynamic-${note.id}-${targetNote.id}`;
          if (!derivedEdges.some((e) => e.fromId === note.id && e.toId === targetNote.id)) {
            derivedEdges.push({
              id: edgeId,
              fromId: note.id,
              toId: targetNote.id,
              label: "References",
              color: "oklch(60% 0.12 220)",
            });
          }
        }
      });

      // 2. Frontmatter relationships
      const relationships = extractFrontmatterRelationships(note.frontmatter || {});
      relationships.forEach((rel) => {
        const targetNote = findTargetNote(rel.target);
        if (targetNote && targetNote.id !== note.id) {
          const edgeId = `dynamic-${note.id}-${targetNote.id}-${rel.key}`;
          if (!derivedEdges.some((e) => e.fromId === note.id && e.toId === targetNote.id && e.label === rel.key)) {
            derivedEdges.push({
              id: edgeId,
              fromId: note.id,
              toId: targetNote.id,
              label: rel.key,
              color: getRelationColor(rel.key),
            });
          }
        }
      });
    });

    setDynamicEdges(derivedEdges);
  }, [notes, currentFolder]);

  useEffect(() => {
    const derivedContainers: ContainerBox[] = [];
    const groups: Record<string, { title: string; noteIds: string[]; key: string }> = {};

    folderNotes.forEach((note) => {
      const tags = Array.isArray(note.frontmatter?.tags)
        ? note.frontmatter.tags
        : typeof note.frontmatter?.tags === "string"
        ? [note.frontmatter.tags]
        : [];

      tags.forEach((tag: string) => {
        if (typeof tag === "string" && tag.includes(":")) {
          const [key, val] = tag.split(":").map(s => s.trim());
          if (key && val) {
            const groupKey = `${key.toLowerCase()}:${val.toLowerCase()}`;
            if (!groups[groupKey]) {
              groups[groupKey] = { title: `${key}: ${val}`, noteIds: [], key };
            }
            groups[groupKey].noteIds.push(note.id);
          }
        }
      });

      if (note.frontmatter) {
        for (const [key, val] of Object.entries(note.frontmatter)) {
          if (["tags", "type", "canvaspath", "aliases", "layout"].includes(key.toLowerCase())) {
            continue;
          }
          if (typeof val === "string" && val.trim()) {
            const groupKey = `${key.toLowerCase()}:${val.toLowerCase().trim()}`;
            if (!groups[groupKey]) {
              groups[groupKey] = { title: `${key}: ${val}`, noteIds: [], key };
            }
            groups[groupKey].noteIds.push(note.id);
          }
        }
      }
    });

    Object.entries(groups).forEach(([groupKey, group]) => {
      if (group.noteIds.length <= 1) return;

      const groupNodes = nodes.filter((n) => group.noteIds.includes(n.id));
      if (groupNodes.length === 0) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      groupNodes.forEach((node) => {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + 220);
        maxY = Math.max(maxY, node.y + 160);
      });

      minX -= 16;
      minY -= 24; // Extra top space for the floating label
      maxX += 16;
      maxY += 16;

      const baseColor = getRelationColor(group.key);
      const rgbaColor = baseColor.replace("oklch", "oklch").replace(")", " / 0.03)");

      derivedContainers.push({
        id: `dynamic-box-${groupKey}`,
        title: group.title,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        color: rgbaColor,
      });
    });

    setDynamicContainers(derivedContainers);
  }, [nodes, folderNotes]);

  // Load existing canvas file
  useEffect(() => {
    invoke<string>("load_canvas_file", { relPath: canvasRelPath })
      .then((rawJson) => {
        let data: CanvasData = { nodes: [], edges: [], containers: [] };
        try {
          if (rawJson && rawJson !== "{}") {
            data = JSON.parse(rawJson);
          }
        } catch (e) {
          console.error("Failed to parse canvas JSON:", e);
        }

        // Synchronize notes in folder
        const existingNodeIds = new Set(data.nodes.map((n) => n.id));
        const updatedNodes = [...data.nodes];

        folderNotes.forEach((note, index) => {
          if (!existingNodeIds.has(note.id)) {
            updatedNodes.push({
              id: note.id,
              x: 100 + (index % 4) * 260,
              y: 100 + Math.floor(index / 4) * 180,
            });
          }
        });

        setNodes(updatedNodes);
        setEdges(data.edges || []);
        setContainers(data.containers || []);
      })
      .catch((err) => console.error("Error loading canvas file:", err));
  }, [currentFolder, canvasRelPath, notes.length]);

  const saveCanvas = () => {
    const data: CanvasData = { nodes, edges, containers };
    invoke("save_canvas_file", { relPath: canvasRelPath, content: JSON.stringify(data, null, 2) })
      .then(() => alert("Canvas saved successfully!"))
      .catch((err) => alert("Failed to save canvas: " + err));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg") {
      setIsPanning(true);
      setSelectedNodeId(null);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingNodeId) {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === draggingNodeId) {
            return {
              ...n,
              x: (e.clientX - pan.x) / zoom - dragOffset.x,
              y: (e.clientY - pan.y) / zoom - dragOffset.y,
            };
          }
          return n;
        })
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // Wheel zoom with zoom-to-cursor. Reciprocal factors (1.1 / 1/1.1) so
  // zooming in then out returns to exactly 100%.
  const handleWheel = (e: React.WheelEvent) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    setZoom((z) => {
      const newZoom = Math.min(3.0, Math.max(0.25, z * factor));
      const actualFactor = newZoom / z;
      setPan((p) => ({
        x: mousePos.x - (mousePos.x - p.x) * actualFactor,
        y: mousePos.y - (mousePos.y - p.y) * actualFactor,
      }));
      return newZoom;
    });
  };

  // Fit all nodes + containers into the viewport.
  const fitToView = () => {
    const el = canvasRef.current;
    if (!el || !el.clientWidth || !el.clientHeight) return;
    const pad = 60;
    const allX = [
      ...nodes.map((n) => n.x),
      ...containers.map((c) => c.x),
      ...dynamicContainers.map((c) => c.x),
    ];
    const allY = [
      ...nodes.map((n) => n.y),
      ...containers.map((c) => c.y),
      ...dynamicContainers.map((c) => c.y),
    ];
    if (allX.length === 0) {
      setZoom(1);
      setPan({ x: 40, y: 40 });
      return;
    }
    const minX = Math.min(...allX) - pad;
    const maxX = Math.max(...allX) + 220 + pad;
    const minY = Math.min(...allY) - pad;
    const maxY = Math.max(...allY) + 160 + pad;
    const w = maxX - minX;
    const h = maxY - minY;
    const s = Math.min(el.clientWidth / w, el.clientHeight / h, 1.5);
    const z = Math.max(0.25, s);
    setZoom(z);
    setPan({
      x: (el.clientWidth - w * z) / 2 - minX * z,
      y: (el.clientHeight - h * z) / 2 - minY * z,
    });
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string, nodeX: number, nodeY: number) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    if (connectingFromId) {
      if (connectingFromId !== nodeId) {
        const newEdge: EdgeConnection = {
          id: `edge-${Date.now()}`,
          fromId: connectingFromId,
          toId: nodeId,
          label: "Contains",
          color: "var(--muted)",
        };
        setEdges((prev) => [...prev, newEdge]);
      }
      setConnectingFromId(null);
    } else {
      setDraggingNodeId(nodeId);
      setDragOffset({
        x: (e.clientX - pan.x) / zoom - nodeX,
        y: (e.clientY - pan.y) / zoom - nodeY,
      });
    }
  };

  const addContainerBox = () => {
    const newBox: ContainerBox = {
      id: `box-${Date.now()}`,
      title: "New Sub-Location / Boundary",
      x: 80,
      y: 80,
      width: 400,
      height: 300,
      color: "oklch(52% 0.10 28 / 0.15)",
    };
    setContainers((prev) => [...prev, newBox]);
  };

  const getNodePos = (id: string) => {
    const n = nodes.find((item) => item.id === id);
    return n ? { x: n.x + 110, y: n.y + 60 } : { x: 0, y: 0 };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "var(--bg)", overflow: "hidden", position: "relative" }}>
      {/* Top Toolbar */}
      <div style={{ height: "44px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Layers size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg)" }}>
            Canvas: {currentFolder ? currentFolder : "Vault Root"} ({folderNotes.length} Notes)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(z + 0.1, 3.0))} title="Zoom In" data-od-id="canvas-zoom-in-btn">
            <ZoomIn size={12} />
          </button>
          <span style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{Math.round(zoom * 100)}%</span>
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(z - 0.1, 0.25))} title="Zoom Out" data-od-id="canvas-zoom-out-btn">
            <ZoomOut size={12} />
          </button>
          <button className="btn btn-sm" onClick={fitToView} title="Fit Canvas to View" data-od-id="canvas-fit-btn">
            <Maximize2 size={12} />
          </button>
          <span style={{ width: 1, height: 24, background: "var(--border)", margin: "0 8px" }} />
          <button className="btn btn-sm" onClick={addContainerBox} title="Add Container / Boundary Box" data-od-id="canvas-add-container-btn">
            <Plus size={12} /> Add Container
          </button>
          <span style={{ width: 1, height: 24, background: "var(--border)", margin: "0 8px" }} />
          <button className="btn btn-sm btn-primary" onClick={saveCanvas} title="Save Canvas Layout" data-od-id="canvas-save-btn">
            <Save size={12} /> Save Canvas
          </button>
        </div>
      </div>

      {/* Empty state */}
      {folderNotes.length === 0 && (
        <div
          style={{
            position: "absolute",
            inset: "44px 0 0 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            background: "var(--bg)",
            zIndex: 5,
          }}
        >
          <Layers size={32} style={{ color: "var(--muted)" }} />
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg)" }}>
            No notes in this folder
          </div>
          <div style={{ fontSize: "12px", color: "var(--muted)", maxWidth: 360, textAlign: "center" }}>
            Add notes to {currentFolder ? `"${currentFolder}"` : "the vault root"} to see them
            arranged on this canvas. Notes with wiki-links or frontmatter
            relationships will be connected automatically.
          </div>
        </div>
      )}

      {/* Main Canvas Space */}
      <div
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          position: "relative",
          cursor: isPanning ? "grabbing" : "grab",
          overflow: "hidden",
          backgroundImage: "radial-gradient(var(--grid-dot) 1.5px, transparent 1.5px)",
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            width: "100%",
            height: "100%",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          {/* SVG Connections */}
          <svg style={{ width: "5000px", height: "5000px", position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
              </marker>
            </defs>
            {[...edges, ...dynamicEdges].map((edge) => {
              const p1 = getNodePos(edge.fromId);
              const p2 = getNodePos(edge.toId);
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;

              return (
                <g key={edge.id}>
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={selectedEdgeId === edge.id ? "var(--accent)" : edge.color || "var(--border)"}
                    strokeWidth={selectedEdgeId === edge.id ? "3" : "2"}
                    strokeDasharray={edge.id.startsWith("dynamic-") ? "5 5" : undefined}
                    markerEnd="url(#arrow)"
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                    onClick={() => {
                      setSelectedEdgeId(edge.id);
                      setEditingEdgeLabel(edge.label);
                    }}
                  />
                  {/* Connection Label */}
                  <rect
                    x={midX - (edge.label.length * 4 + 10)}
                    y={midY - 12}
                    width={edge.label.length * 8 + 20}
                    height={22}
                    rx={0}
                    fill="var(--surface)"
                    stroke="var(--border)"
                    strokeWidth="1"
                  />
                  <text
                    x={midX}
                    y={midY + 3}
                    fill="var(--fg)"
                    fontSize="10"
                    fontFamily="var(--font-body)"
                    fontWeight="600"
                    textAnchor="middle"
                    style={{ cursor: "pointer", pointerEvents: "all" }}
                    onClick={() => {
                      setSelectedEdgeId(edge.id);
                      setEditingEdgeLabel(edge.label);
                    }}
                  >
                    {edge.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Container Boxes */}
          {[...containers, ...dynamicContainers].map((box) => {
            const isDynamic = box.id.startsWith("dynamic-");
            const relationKey = isDynamic ? box.title.split(":")[0] : "";
            const borderColor = isDynamic ? getRelationColor(relationKey) : "var(--accent)";
            return (
              <div
                key={box.id}
                style={{
                  position: "absolute",
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  background: box.color,
                  border: isDynamic ? `1px dashed ${borderColor}` : "1px dashed var(--accent)",
                  borderRadius: 0,
                  padding: "8px",
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: isDynamic ? borderColor : "var(--accent)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    background: "var(--surface)",
                    padding: "2px 6px",
                    borderRadius: 0,
                    border: "1px solid var(--border)",
                    position: "absolute",
                    top: "-10px",
                    left: "12px",
                  }}
                >
                  {box.title}
                </span>
              </div>
            );
          })}

          {/* Note Nodes */}
          {nodes.map((nodePos) => {
            const note = folderNotes.find((n) => n.id === nodePos.id);
            if (!note) return null;

            const tags = Array.isArray(note.frontmatter?.tags)
              ? note.frontmatter.tags
              : typeof note.frontmatter?.tags === "string"
              ? [note.frontmatter.tags]
              : [];

            const isCanvas = note.frontmatter?.type === "Canvas" || note.path.endsWith(".canvas");
            return (
              <div
                key={note.id}
                onMouseDown={(e) => handleNodeMouseDown(e, note.id, nodePos.x, nodePos.y)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, noteId: note.id });
                }}
                onDoubleClick={(e) => {
                  if (isCanvas) {
                    e.stopPropagation();
                    onSelectCanvas(note.path);
                  }
                }}
                onKeyDown={(e) => {
                  if (isCanvas && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectCanvas(note.path);
                  }
                }}
                role={isCanvas ? "button" : undefined}
                tabIndex={isCanvas ? 0 : undefined}
                aria-label={isCanvas ? `Open canvas ${note.title}` : undefined}
                style={{
                  position: "absolute",
                  left: nodePos.x,
                  top: nodePos.y,
                  width: 220,
                  background: isCanvas ? "var(--surface)" : "var(--surface)",
                  border: connectingFromId === note.id 
                    ? "2px solid var(--accent)" 
                    : isCanvas 
                      ? "1px solid var(--accent)" 
                      : selectedNodeId === note.id
                        ? "2px solid var(--accent)"
                        : draggingNodeId === note.id
                          ? "1px solid var(--accent)"
                          : "1px solid var(--border)",
                  borderRadius: 0,
                  padding: "12px",
                  cursor: isCanvas ? "pointer" : "grab",
                  opacity: draggingNodeId === note.id ? 0.85 : 1,
                  userSelect: "none",
                }}
                className={connectingFromId === note.id ? "connecting-pulse" : undefined}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: isCanvas ? "var(--accent)" : "var(--muted)", fontWeight: 700 }}>
                    {isCanvas ? "Canvas" : String(note.frontmatter?.type || "Note")}
                  </span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {!isCanvas && (
                      <button
                        className="btn btn-sm"
                        style={{ minWidth: 24, minHeight: 24, padding: "4px 8px", fontSize: "10px" }}
                        title="Connect Edge"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConnectingFromId(note.id);
                        }}
                      >
                        <LinkIcon size={12} />
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      style={{ minWidth: 24, minHeight: 24, padding: "4px 8px", fontSize: "10px" }}
                      title={isCanvas ? "Drill Down Canvas" : "View Note"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCanvas) {
                          onSelectCanvas(note.path);
                        } else {
                          onSelectNote(note.id);
                        }
                      }}
                    >
                      <Eye size={12} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)", marginBottom: "4px" }}>{note.title}</div>
                <div style={{ fontSize: "12px", color: "var(--fg)", opacity: 0.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: "8px" }}>
                  {note.content.replace(/#+/g, "").trim()}
                </div>

                {/* Surfaced Tags & Frontmatter Relationships */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {tags.map((tag: any) => {
                    const strTag = String(tag);
                    if (strTag.includes(":")) {
                      const [k, v] = strTag.split(":");
                      return (
                        <span
                          key={strTag}
                          style={{
                            fontSize: "11px",
                            padding: "2px 8px",
                            borderRadius: 0,
                            background: getRelationColor(k).replace("oklch", "oklch").replace(")", " / 0.15)"),
                            color: getRelationColor(k),
                            fontWeight: 600,
                          }}
                        >
                          {k}: {v}
                        </span>
                      );
                    }
                    return (
                      <span
                        key={strTag}
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: 0,
                          background: strTag === "villain" ? "oklch(50% 0.14 25 / 0.15)" : "oklch(48% 0.012 70 / 0.15)",
                          color: strTag === "villain" ? "var(--danger)" : "var(--muted)",
                          fontWeight: 600,
                        }}
                      >
                        #{strTag}
                      </span>
                    );
                  })}

                  {Object.entries(note.frontmatter || {}).map(([k, val]) => {
                    if (["tags", "type", "canvaspath", "aliases", "layout"].includes(k.toLowerCase())) {
                      return null;
                    }
                    const strVal = Array.isArray(val) ? val.join(", ") : String(val);
                    if (!strVal || strVal === "undefined" || strVal === "null" || strVal.trim() === "") return null;
                    return (
                      <span
                        key={k}
                        style={{
                          fontSize: "11px",
                          padding: "2px 6px",
                          borderRadius: 0,
                          background: getRelationColor(k).replace("oklch", "oklch").replace(")", " / 0.15)"),
                          color: getRelationColor(k),
                          fontWeight: 600,
                        }}
                      >
                        {k}: {strVal}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Connection Label Dialog */}
      {selectedEdgeId && (
        <div style={{ position: "absolute", bottom: 20, right: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 0, padding: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 100, width: 260 }}>
          {selectedEdgeId.startsWith("dynamic-") ? (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--fg)", marginBottom: "4px" }}>Dynamic Relationship</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>This link was automatically generated from wiki-links in the note contents or frontmatter.</div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setSelectedEdgeId(null)}
                style={{ width: "100%", padding: "6px 12px", fontSize: "12px", background: "transparent", border: "1px solid var(--border)", borderRadius: 0, color: "var(--fg)", cursor: "pointer" }}
              >
                Dismiss
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--fg)", marginBottom: "8px" }}>Custom Relationship Label</div>
              <input
                type="text"
                value={editingEdgeLabel}
                onChange={(e) => setEditingEdgeLabel(e.target.value)}
                placeholder="e.g. Contains, Member Of, Rival"
                style={{ width: "100%", padding: "6px 8px", fontSize: "12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 0, color: "var(--fg)", marginBottom: "8px" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                <button
                  className="btn btn-sm"
                  style={{ color: "var(--danger)", padding: "6px 12px", fontSize: "12px", cursor: "pointer", background: "transparent", border: "none" }}
                  onClick={() => {
                    setEdges((prev) => prev.filter((e) => e.id !== selectedEdgeId));
                    setSelectedEdgeId(null);
                  }}
                >
                  Delete Edge
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  style={{ padding: "6px 12px", fontSize: "12px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 0, cursor: "pointer" }}
                  onClick={() => {
                    setEdges((prev) => prev.map((e) => (e.id === selectedEdgeId ? { ...e, label: editingEdgeLabel } : e)));
                    setSelectedEdgeId(null);
                  }}
                >
                  Apply
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Custom Context Menu */}
      {contextMenu && (() => {
        const targetNote = notes.find((n) => n.id === contextMenu.noteId);
        const noteType = targetNote?.frontmatter?.type;
        const matchingTemplate = (templates || []).find(
          (t) => t.name.toLowerCase() === (noteType ? String(noteType).toLowerCase() : "")
        );

        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 1000,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "6px",
              minWidth: "180px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "4px 8px",
                borderBottom: "1px solid var(--border)",
                marginBottom: "2px",
              }}
            >
              {matchingTemplate ? `${matchingTemplate.name} Actions` : noteType ? String(noteType) : "Actions"}
            </div>
            {matchingTemplate && matchingTemplate.actions && matchingTemplate.actions.length > 0 ? (
              matchingTemplate.actions.map((action, idx) => (
                <button
                  key={idx}
                  className="btn btn-sm"
                  style={{
                    justifyContent: "flex-start",
                    width: "100%",
                    padding: "6px 10px",
                    fontSize: "12px",
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    borderRadius: 0,
                    cursor: "pointer",
                    color: "var(--fg)",
                  }}
                  onClick={() => {
                    if (targetNote) {
                      handleActionClick(action, targetNote);
                    }
                    setContextMenu(null);
                  }}
                >
                  <Zap size={12} /> {action.label}
                </button>
              ))
            ) : (
              <div style={{ fontSize: "11px", color: "var(--muted)", padding: "6px 8px" }}>
                No actions defined for this type
              </div>
            )}
          </div>
        );
      })()}

      {/* Canvas Rolling Results Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1000,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            padding: "12px 16px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            maxWidth: "360px",
            color: "var(--fg)",
            fontSize: "13px",
            lineHeight: "1.4",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span>{toast}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "14px",
              lineHeight: 1,
              padding: "2px",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
export default FolderCanvas;
