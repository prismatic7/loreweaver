import React, { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Save,
  Map as MapIcon,
  EyeOff,
  Eye,
  Ruler,
} from "lucide-react";

/**
 * MapBuilderView
 *
 * A system-agnostic battle-map / world-map builder. Reuses the same `.canvas`
 * JSON file format and pan/zoom/drag interaction patterns as FolderCanvas, but
 * is map-oriented:
 *   - Tokens: draggable markers (PCs, NPCs, monsters, landmarks).
 *   - Fog-of-war regions: rectangles that can be toggled hidden/shown.
 *   - Distance ruler: click two points to measure a distance.
 *
 * State is scoped to the active vault via the existing `save_canvas_file` /
 * `load_canvas_file` commands (relPath is vault-relative).
 */

interface MapToken {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
}

interface FogRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden: boolean;
}

interface MapData {
  type: "map";
  tokens: MapToken[];
  fog: FogRegion[];
}

interface MapBuilderViewProps {
  vaultPath: string;
  mapRelPath: string;
  alert: (message: string) => void;
}

const TOKEN_COLORS = [
  "oklch(60% 0.25 20)", // red
  "oklch(60% 0.2 260)", // blue
  "oklch(60% 0.2 140)", // green
  "oklch(60% 0.2 320)", // purple
  "oklch(60% 0.15 80)", // gold
  "oklch(60% 0.15 180)", // teal
];

export const MapBuilderView: React.FC<MapBuilderViewProps> = ({
  vaultPath,
  mapRelPath,
  alert,
}) => {
  const [tokens, setTokens] = useState<MapToken[]>([]);
  const [fog, setFog] = useState<FogRegion[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [rulerMode, setRulerMode] = useState(false);
  const [rulerPoints, setRulerPoints] = useState<{ x: number; y: number }[]>([]);
  const [rulerDistance, setRulerDistance] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const loadMap = useCallback(() => {
    invoke<string>("load_canvas_file", { relPath: mapRelPath })
      .then((rawJson) => {
        let data: MapData = { type: "map", tokens: [], fog: [] };
        try {
          if (rawJson && rawJson !== "{}") {
            const parsed = JSON.parse(rawJson);
            if (parsed && parsed.type === "map") {
              data = parsed;
            }
          }
        } catch (e) {
          console.error("Failed to parse map JSON:", e);
        }
        setTokens(data.tokens || []);
        setFog(data.fog || []);
      })
      .catch((err) => console.error("Error loading map file:", err));
  }, [mapRelPath]);

  useEffect(() => {
    loadMap();
  }, [loadMap, vaultPath]);

  const saveMap = () => {
    const data: MapData = { type: "map", tokens, fog };
    invoke("save_canvas_file", {
      relPath: mapRelPath,
      content: JSON.stringify(data, null, 2),
    })
      .then(() => alert("Map saved successfully!"))
      .catch((err) => alert("Failed to save map: " + err));
  };

  const addToken = () => {
    const label = prompt("Token label:", "Token");
    if (!label) return;
    const color = TOKEN_COLORS[tokens.length % TOKEN_COLORS.length];
    setTokens((prev) => [
      ...prev,
      { id: `token-${Date.now()}`, label, x: 120, y: 120, color },
    ]);
  };

  const addFogRegion = () => {
    setFog((prev) => [
      ...prev,
      {
        id: `fog-${Date.now()}`,
        x: 80,
        y: 80,
        width: 300,
        height: 200,
        hidden: true,
      },
    ]);
  };

  const toggleFog = (id: string) => {
    setFog((prev) =>
      prev.map((f) => (f.id === id ? { ...f, hidden: !f.hidden } : f)),
    );
  };

  const removeToken = (id: string) => {
    setTokens((prev) => prev.filter((t) => t.id !== id));
  };

  const removeFog = (id: string) => {
    setFog((prev) => prev.filter((f) => f.id !== id));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === canvasRef.current ||
      (e.target as HTMLElement).tagName === "svg"
    ) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingTokenId) {
      setTokens((prev) =>
        prev.map((t) => {
          if (t.id === draggingTokenId) {
            return {
              ...t,
              x: (e.clientX - pan.x) / zoom - dragOffset.x,
              y: (e.clientY - pan.y) / zoom - dragOffset.y,
            };
          }
          return t;
        }),
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingTokenId(null);
  };

  const handleTokenMouseDown = (
    e: React.MouseEvent,
    tokenId: string,
    tx: number,
    ty: number,
  ) => {
    e.stopPropagation();
    setDraggingTokenId(tokenId);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - tx,
      y: (e.clientY - pan.y) / zoom - ty,
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!rulerMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    setRulerPoints((prev) => {
      const next = [...prev, { x, y }];
      if (next.length === 2) {
        const dx = next[1].x - next[0].x;
        const dy = next[1].y - next[0].y;
        setRulerDistance(Math.round(Math.sqrt(dx * dx + dy * dy)));
        return next;
      }
      return next;
    });
  };

  const clearRuler = () => {
    setRulerPoints([]);
    setRulerDistance(null);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "var(--bg)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Top Toolbar */}
      <div
        style={{
          height: "42px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <MapIcon size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg)" }}>
            Map Builder ({tokens.length} tokens, {fog.length} fog regions)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.min(z + 0.15, 2))}
            title="Zoom In"
            data-od-id="map-zoom-in-btn"
          >
            <ZoomIn size={13} />
          </button>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
            title="Zoom Out"
            data-od-id="map-zoom-out-btn"
          >
            <ZoomOut size={13} />
          </button>
          <button
            className="btn btn-sm"
            onClick={addToken}
            title="Add Token"
            data-od-id="map-add-token-btn"
          >
            <Plus size={13} /> Token
          </button>
          <button
            className="btn btn-sm"
            onClick={addFogRegion}
            title="Add Fog-of-War Region"
            data-od-id="map-add-fog-btn"
          >
            <EyeOff size={13} /> Fog
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setRulerMode((r) => !r);
              clearRuler();
            }}
            title="Toggle Distance Ruler"
            data-od-id="map-ruler-btn"
            style={{
              background: rulerMode ? "var(--accent)" : "var(--surface)",
              color: rulerMode ? "#fff" : "var(--fg)",
            }}
          >
            <Ruler size={13} /> Ruler
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={saveMap}
            title="Save Map"
            data-od-id="map-save-btn"
          >
            <Save size={13} /> Save Map
          </button>
        </div>
      </div>

      {/* Main Canvas Space */}
      <div
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          cursor: isPanning ? "grabbing" : rulerMode ? "crosshair" : "default",
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Grid */}
            <defs>
              <pattern
                id="map-grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="0.5"
                />
              </pattern>
            </defs>
            <rect
              x="-2000"
              y="-2000"
              width="4000"
              height="4000"
              fill="url(#map-grid)"
            />

            {/* Fog regions (drawn first, under tokens) */}
            {fog.map((f) => (
              <g key={f.id}>
                <rect
                  x={f.x}
                  y={f.y}
                  width={f.width}
                  height={f.height}
                  fill={f.hidden ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.05)"}
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={f.x + 6}
                  y={f.y + 14}
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {f.hidden ? "Fog (hidden)" : "Revealed"}
                </text>
                <g
                  transform={`translate(${f.x + f.width - 20}, ${f.y + 4})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFog(f.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect width="16" height="16" rx="0" fill="var(--surface)" stroke="var(--border)" />
                  <text x="8" y="12" fontSize="10" textAnchor="middle" fill="var(--fg)">
                    {f.hidden ? <EyeOff size={10} /> : <Eye size={10} />}
                  </text>
                </g>
                <g
                  transform={`translate(${f.x + f.width - 40}, ${f.y + 4})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFog(f.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect width="16" height="16" rx="0" fill="var(--surface)" stroke="var(--border)" />
                  <text x="8" y="12" fontSize="10" textAnchor="middle" fill="var(--danger)">
                    ✕
                  </text>
                </g>
              </g>
            ))}

            {/* Ruler line */}
            {rulerPoints.length === 2 && (
              <line
                x1={rulerPoints[0].x}
                y1={rulerPoints[0].y}
                x2={rulerPoints[1].x}
                y2={rulerPoints[1].y}
                stroke="var(--accent)"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
            )}
            {rulerPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="4"
                fill="var(--accent)"
              />
            ))}
            {rulerDistance !== null && (
              <text
                x={(rulerPoints[0].x + rulerPoints[1].x) / 2}
                y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 8}
                fontSize="12"
                fontWeight="bold"
                fill="var(--accent)"
                textAnchor="middle"
              >
                {rulerDistance} units
              </text>
            )}

            {/* Tokens */}
            {tokens.map((t) => (
              <g
                key={t.id}
                transform={`translate(${t.x}, ${t.y})`}
                onMouseDown={(e) => handleTokenMouseDown(e, t.id, t.x, t.y)}
                style={{ cursor: "grab" }}
              >
                <circle r="18" fill={t.color} stroke="var(--surface)" strokeWidth="2" />
                <text
                  y="4"
                  fontSize="12"
                  textAnchor="middle"
                  fill="#fff"
                  fontWeight="bold"
                >
                  {t.label.charAt(0).toUpperCase()}
                </text>
                <text
                  y="34"
                  fontSize="10"
                  textAnchor="middle"
                  fill="var(--fg)"
                >
                  {t.label}
                </text>
                <g
                  transform="translate(14, -14)"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeToken(t.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <circle r="8" fill="var(--surface)" stroke="var(--border)" />
                  <text x="0" y="3" fontSize="9" textAnchor="middle" fill="var(--danger)">
                    ✕
                  </text>
                </g>
              </g>
            ))}
          </g>
        </svg>

        {/* Ruler hint */}
        {rulerMode && (
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: "12px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              padding: "6px 10px",
              fontSize: "11px",
              color: "var(--fg)",
              zIndex: 5,
            }}
          >
            {rulerPoints.length === 0
              ? "Click first point..."
              : rulerPoints.length === 1
                ? "Click second point..."
                : `Distance: ${rulerDistance} units`}
            <button
              onClick={clearRuler}
              style={{
                marginLeft: "8px",
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapBuilderView;
