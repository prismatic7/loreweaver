import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Save,
  Map as MapIcon,
  EyeOff,
  Ruler,
  Maximize2,
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
  "oklch(45% 0.12 28)", // accent ramp L45 (--accent-hover)
  "oklch(52% 0.10 28)", // accent ramp L52 (--accent)
  "oklch(60% 0.10 28)", // accent ramp L60
  "oklch(70% 0.08 28)", // accent ramp L70
  "oklch(50% 0.14 25)", // --danger (hostile tokens)
  "oklch(65% 0.12 85)", // --warn (neutral tokens)
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
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [namingToken, setNamingToken] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const tokenNameRef = useRef<HTMLInputElement>(null);
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
    setTokenName("");
    setNamingToken(true);
  };

  const commitTokenName = () => {
    const label = tokenName.trim() || "Token";
    setNamingToken(false);
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
    setSelectedTokenId(tokenId);
    setDragOffset({
      x: (e.clientX - pan.x) / zoom - tx,
      y: (e.clientY - pan.y) / zoom - ty,
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    setSelectedTokenId(null);
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

  // Wheel zoom with zoom-to-cursor. Reciprocal factors (1.1 / 1/1.1) so
  // zooming in then out returns to exactly 100%.
  const handleWheel = (e: React.WheelEvent) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
    setZoom((z) => {
      const newZoom = Math.min(4.0, Math.max(0.25, z * factor));
      const actualFactor = newZoom / z;
      setPan((p) => ({
        x: mousePos.x - (mousePos.x - p.x) * actualFactor,
        y: mousePos.y - (mousePos.y - p.y) * actualFactor,
      }));
      return newZoom;
    });
  };

  // Fit all tokens + fog regions into the viewport.
  const fitToView = () => {
    const el = canvasRef.current;
    if (!el || !el.clientWidth || !el.clientHeight) return;
    const pad = 60;
    const allX = [
      ...tokens.map((t) => t.x),
      ...fog.map((f) => f.x),
    ];
    const allY = [
      ...tokens.map((t) => t.y),
      ...fog.map((f) => f.y),
    ];
    if (allX.length === 0) {
      setZoom(1);
      setPan({ x: 40, y: 40 });
      return;
    }
    const minX = Math.min(...allX) - pad;
    const maxX = Math.max(...allX) + pad;
    const minY = Math.min(...allY) - pad;
    const maxY = Math.max(...allY) + pad;
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

  // Token label collision: ids of tokens within 50px of another token.
  // Their labels fade unless selected (the selected label lifts above the
  // circle with a background rect instead).
  const collidedIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const a = tokens[i];
        const b = tokens[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < 50) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [tokens]);

  const truncateLabel = (label: string) =>
    label.length > 12 ? `${label.slice(0, 12)}…` : label;

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
          height: "44px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <MapIcon size={16} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--fg)" }}>
            Map Builder ({tokens.length} tokens, {fog.length} fog regions)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.min(z + 0.1, 4.0))}
            title="Zoom In"
            data-od-id="map-zoom-in-btn"
          >
            <ZoomIn size={12} />
          </button>
          <span style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.max(z - 0.1, 0.25))}
            title="Zoom Out"
            data-od-id="map-zoom-out-btn"
          >
            <ZoomOut size={12} />
          </button>
          <button
            className="btn btn-sm"
            onClick={fitToView}
            title="Fit Map to View"
            data-od-id="map-fit-btn"
          >
            <Maximize2 size={12} />
          </button>
          <span style={{ width: 1, height: 24, background: "var(--border)", margin: "0 8px" }} />
          <button
            className="btn btn-sm"
            onClick={addToken}
            title="Add Token"
            data-od-id="map-add-token-btn"
          >
            <Plus size={12} /> Token
          </button>
          <button
            className="btn btn-sm"
            onClick={addFogRegion}
            title="Add Fog-of-War Region"
            data-od-id="map-add-fog-btn"
          >
            <EyeOff size={12} /> Fog
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
            <Ruler size={12} /> Ruler
          </button>
          <span style={{ width: 1, height: 24, background: "var(--border)", margin: "0 8px" }} />
          <button
            className="btn btn-sm btn-primary"
            onClick={saveMap}
            title="Save Map"
            data-od-id="map-save-btn"
          >
            <Save size={12} /> Save Map
          </button>
        </div>
      </div>

      {/* Empty state */}
      {tokens.length === 0 && fog.length === 0 && (
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
            pointerEvents: "none",
          }}
        >
          <MapIcon size={32} style={{ color: "var(--muted)" }} />
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg)" }}>
            Empty map
          </div>
          <div style={{ fontSize: "12px", color: "var(--muted)", maxWidth: 360, textAlign: "center" }}>
            Add tokens to mark characters and landmarks, or fog-of-war regions
            to hide areas from players. Use the ruler to measure distances.
          </div>
        </div>
      )}

      {/* Main Canvas Space */}
      <div
        ref={canvasRef}
        data-od-id="map-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
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
                  stroke="var(--grid-line)"
                  strokeWidth="1"
                />
              </pattern>
              {/* Hatching for hidden fog — distinguishes "intentionally hidden"
                  from "just dark". */}
              <pattern
                id="fog-hatch"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="var(--surface)"
                  strokeWidth="1"
                  opacity="0.35"
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
                  fill={f.hidden ? "oklch(14% 0.012 70 / 0.75)" : "oklch(48% 0.012 70 / 0.08)"}
                  stroke="var(--border)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                {f.hidden && (
                  <rect
                    x={f.x}
                    y={f.y}
                    width={f.width}
                    height={f.height}
                    fill="url(#fog-hatch)"
                    pointerEvents="none"
                  />
                )}
                <text
                  x={f.x + 6}
                  y={f.y + 14}
                  fontSize="10"
                  fill={f.hidden ? "var(--surface)" : "var(--muted)"}
                >
                  {f.hidden ? "Fog (hidden)" : "Revealed"}
                </text>
                <g
                  transform={`translate(${f.x + f.width - 20}, ${f.y + 4})`}
                  role="button"
                  aria-label="Toggle fog region"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFog(f.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect width="24" height="24" rx="0" fill="var(--surface)" stroke="var(--border)" />
                  <g transform="translate(12, 12)">
                    <g transform="scale(0.5)">
                      {f.hidden ? (
                        <g fill="none" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                          <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                          <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                          <path d="m2 2 20 20" />
                        </g>
                      ) : (
                        <g fill="none" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </g>
                      )}
                    </g>
                  </g>
                </g>
                <g
                  transform={`translate(${f.x + f.width - 40}, ${f.y + 4})`}
                  role="button"
                  aria-label="Delete fog region"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFog(f.id);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect width="24" height="24" rx="0" fill="var(--surface)" stroke="var(--danger)" strokeWidth="1" />
                  <g transform="translate(12, 12)">
                    <g transform="scale(0.5)">
                      <g fill="none" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </g>
                    </g>
                  </g>
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
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
            )}
            {rulerPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="3"
                fill="var(--surface)"
                stroke="var(--accent)"
                strokeWidth="1.5"
              />
            ))}
            {rulerDistance !== null && (
              <g>
                <rect
                  x={(rulerPoints[0].x + rulerPoints[1].x) / 2 - 34}
                  y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 20}
                  width="68"
                  height="18"
                  rx="0"
                  fill="var(--surface)"
                  stroke="var(--border)"
                  strokeWidth="0.5"
                />
                <text
                  x={(rulerPoints[0].x + rulerPoints[1].x) / 2}
                  y={(rulerPoints[0].y + rulerPoints[1].y) / 2 - 7}
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                  fontWeight="600"
                  fill="var(--accent)"
                  textAnchor="middle"
                >
                  {rulerDistance} units
                </text>
              </g>
            )}

            {/* Tokens */}
            {tokens.map((t) => {
              const isSelected = selectedTokenId === t.id;
              const collided = collidedIds.has(t.id);
              const label = truncateLabel(t.label);
              return (
                <g
                  key={t.id}
                  transform={`translate(${t.x}, ${t.y})`}
                  onMouseDown={(e) => handleTokenMouseDown(e, t.id, t.x, t.y)}
                  style={{ cursor: "grab" }}
                >
                  {/* Selection halo ring */}
                  {isSelected && (
                    <circle
                      r="22"
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth="1"
                      opacity="0.4"
                    />
                  )}
                  <circle r="16" fill={t.color} stroke={isSelected ? "var(--accent)" : "var(--surface)"} strokeWidth="2" />
                  <text
                    y="4"
                    fontSize="12"
                    textAnchor="middle"
                    fill="#fff"
                    fontWeight="bold"
                  >
                    {t.label.charAt(0).toUpperCase()}
                  </text>
                  {isSelected ? (
                    <g>
                      <rect
                        x={-34}
                        y={-34}
                        width="68"
                        height="18"
                        rx="0"
                        fill="var(--surface)"
                        stroke="var(--border)"
                        strokeWidth="0.5"
                      />
                      <text
                        y="-21"
                        fontSize="10"
                        textAnchor="middle"
                        fill="var(--fg)"
                        fontWeight="600"
                      >
                        {label}
                      </text>
                    </g>
                  ) : (
                    <text
                      y="32"
                      fontSize="10"
                      textAnchor="middle"
                      fill="var(--fg)"
                      opacity={collided ? 0.25 : 1}
                    >
                      {label}
                    </text>
                  )}
                  <g
                    transform="translate(12, -12)"
                    role="button"
                    aria-label="Delete token"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeToken(t.id);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <rect width="24" height="24" x="-12" y="-12" rx="0" fill="var(--surface)" stroke="var(--danger)" strokeWidth="1" />
                    <g transform="translate(0, 0)">
                      <g transform="scale(0.5)">
                        <g fill="none" stroke="var(--danger)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </g>
                      </g>
                    </g>
                  </g>
                </g>
              );
            })}
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

        {/* Token naming overlay */}
        {namingToken && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 20,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "16px",
              width: 280,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--fg)", marginBottom: "8px" }}>
              New Token
            </div>
            <input
              ref={tokenNameRef}
              autoFocus
              value={tokenName}
              onChange={(e) => setTokenName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTokenName();
                if (e.key === "Escape") setNamingToken(false);
              }}
              placeholder="Token label"
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid var(--border)",
                borderRadius: 0,
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: "13px",
                outline: "none",
                marginBottom: "8px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button
                className="btn btn-sm"
                onClick={() => setNamingToken(false)}
              >
                Cancel
              </button>
              <button className="btn btn-sm btn-primary" onClick={commitTokenName}>
                Add Token
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapBuilderView;
