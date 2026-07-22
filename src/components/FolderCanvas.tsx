import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, ZoomIn, ZoomOut, Save, Layers, Link as LinkIcon, Eye } from "lucide-react";

const extractWikiLinks = (text: string): string[] => {
  const links: string[] = [];
  const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = regex.exec(text || "")) !== null) {
    links.push(match[1].trim());
  }
  return links;
};

const extractFrontmatterLinks = (frontmatter: Record<string, any>): string[] => {
  const links: string[] = [];
  for (const value of Object.values(frontmatter || {})) {
    if (typeof value === "string") {
      links.push(...extractWikiLinks(value));
    } else if (Array.isArray(value)) {
      for (const val of value) {
        if (typeof val === "string") {
          links.push(...extractWikiLinks(val));
        }
      }
    }
  }
  return links;
};

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
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingEdgeLabel, setEditingEdgeLabel] = useState<string>("");

  const canvasRef = useRef<HTMLDivElement>(null);

  const [dynamicEdges, setDynamicEdges] = useState<EdgeConnection[]>([]);

  // Filter notes belonging to current folder or subfolders
  const folderNotes = notes.filter((n) => {
    if (!currentFolder) return true;
    return n.path.startsWith(currentFolder);
  });

  useEffect(() => {
    const derived: EdgeConnection[] = [];
    folderNotes.forEach((note) => {
      const targets = [
        ...extractWikiLinks(note.content),
        ...extractFrontmatterLinks(note.frontmatter || {}),
      ];

      targets.forEach((target) => {
        const targetNote = notes.find(
          (n) => n.title.toLowerCase() === target.toLowerCase()
        );
        if (targetNote && targetNote.id !== note.id) {
          const edgeId = `dynamic-${note.id}-${targetNote.id}`;
          if (!derived.some((e) => e.fromId === note.id && e.toId === targetNote.id)) {
            derived.push({
              id: edgeId,
              fromId: note.id,
              toId: targetNote.id,
              label: "References",
              color: "#3182ce",
            });
          }
        }
      });
    });
    setDynamicEdges(derived);
  }, [notes, currentFolder]);

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

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string, nodeX: number, nodeY: number) => {
    e.stopPropagation();
    if (connectingFromId) {
      if (connectingFromId !== nodeId) {
        const newEdge: EdgeConnection = {
          id: `edge-${Date.now()}`,
          fromId: connectingFromId,
          toId: nodeId,
          label: "Contains",
          color: "#4a5568",
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
      color: "rgba(66, 153, 225, 0.15)",
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
      <div style={{ height: "42px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Layers size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg)" }}>
            Canvas: {currentFolder ? currentFolder : "Vault Root"} ({folderNotes.length} Notes)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(z + 0.15, 2))} title="Zoom In">
            <ZoomIn size={13} />
          </button>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>{Math.round(zoom * 100)}%</span>
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))} title="Zoom Out">
            <ZoomOut size={13} />
          </button>
          <button className="btn btn-sm" onClick={addContainerBox} title="Add Container / Boundary Box">
            <Plus size={13} /> Add Container
          </button>
          <button className="btn btn-sm btn-primary" onClick={saveCanvas} title="Save Canvas Layout">
            <Save size={13} /> Save Canvas
          </button>
        </div>
      </div>

      {/* Main Canvas Space */}
      <div
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          flex: 1,
          width: "100%",
          height: "100%",
          position: "relative",
          cursor: isPanning ? "grabbing" : "grab",
          overflow: "hidden",
          backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
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
                    rx={4}
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
          {containers.map((box) => (
            <div
              key={box.id}
              style={{
                position: "absolute",
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                background: box.color,
                border: "2px dashed var(--accent)",
                borderRadius: "8px",
                padding: "8px",
                pointerEvents: "none",
              }}
            >
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase" }}>{box.title}</span>
            </div>
          ))}

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
                onDoubleClick={(e) => {
                  if (isCanvas) {
                    e.stopPropagation();
                    onSelectCanvas(note.path);
                  }
                }}
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
                      : "1px solid var(--border)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                  padding: "12px",
                  cursor: isCanvas ? "pointer" : "grab",
                  userSelect: "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em", color: isCanvas ? "var(--accent)" : "var(--accent)", fontWeight: 700 }}>
                    {isCanvas ? "🎨 Canvas" : String(note.frontmatter?.type || "Note")}
                  </span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {!isCanvas && (
                      <button
                        className="btn btn-sm"
                        style={{ padding: "2px 5px", fontSize: "10px" }}
                        title="Connect Edge"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConnectingFromId(note.id);
                        }}
                      >
                        <LinkIcon size={10} />
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      style={{ padding: "2px 5px", fontSize: "10px" }}
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
                      <Eye size={10} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg)", marginBottom: "4px" }}>{note.title}</div>
                <div style={{ fontSize: "11px", color: "var(--muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: "8px" }}>
                  {note.content.replace(/#+/g, "").trim()}
                </div>

                {/* Surfaced Tags */}
                {tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {tags.map((tag: any) => (
                      <span
                        key={String(tag)}
                        style={{
                          fontSize: "9px",
                          padding: "2px 6px",
                          borderRadius: "10px",
                          background: String(tag) === "villain" ? "rgba(229, 62, 62, 0.2)" : "rgba(49, 130, 206, 0.2)",
                          color: String(tag) === "villain" ? "#fc8181" : "#63b3ed",
                          fontWeight: 600,
                        }}
                      >
                        #{String(tag)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit Connection Label Dialog */}
      {selectedEdgeId && (
        <div style={{ position: "absolute", bottom: 20, right: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)", zIndex: 100, width: 260 }}>
          {selectedEdgeId.startsWith("dynamic-") ? (
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--fg)", marginBottom: "4px" }}>Dynamic Relationship</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>This link was automatically generated from wiki-links in the note contents or frontmatter.</div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => setSelectedEdgeId(null)}
                style={{ width: "100%", padding: "6px 12px", fontSize: "12px", background: "transparent", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--fg)", cursor: "pointer" }}
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
                style={{ width: "100%", padding: "6px 8px", fontSize: "12px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "4px", color: "var(--fg)", marginBottom: "8px" }}
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
                  style={{ padding: "6px 12px", fontSize: "12px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
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
    </div>
  );
};
export default FolderCanvas;
