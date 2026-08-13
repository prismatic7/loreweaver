import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  Plus,
  ZoomIn,
  ZoomOut,
  Save,
  Map as MapIcon,
  EyeOff,
  Ruler,
  Maximize2,
  Image as ImageIcon,
  X as XIcon,
  Grid3x3,
  PenLine,
  Type,
  Eraser,
  Circle as CircleIcon,
  Square as SquareIcon,
  Star as StarIcon,
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
 *   - Image background: any map image imported from the vault.
 *   - Drawings: freehand polylines + text annotations (spell effects,
 *     temporary boundaries), cleared with one click for the end-of-encounter
 *     wipe.
 *   - Token palette: re-drop the same marker type without re-adding.
 *
 * State is scoped to the active vault via the existing `save_canvas_file` /
 * `load_canvas_file` commands (relPath is vault-relative). Background images
 * are stored in the `_assets/` directory co-located with the map file via
 * `save_note_asset`.
 */

type TokenShape = "circle" | "square" | "star";

interface MapToken {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  shape?: TokenShape;
}

interface FogRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden: boolean;
}

interface MapBackground {
  relPath: string;
  width: number;
  height: number;
}

interface MapLine {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

interface MapAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

interface MapDrawings {
  lines: MapLine[];
  annotations: MapAnnotation[];
}

interface MapData {
  type: "map";
  tokens: MapToken[];
  fog: FogRegion[];
  background?: MapBackground | null;
  drawings?: MapDrawings;
}

interface MapBuilderViewProps {
  vaultPath: string;
  mapRelPath: string;
  alert: (message: string) => void;
  /** Called whenever the map's dirty state changes (true = unsaved edits). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Registers a save function so the parent can persist before navigating away. */
  registerSave?: (fn: () => Promise<boolean>) => void;
}

type CanvasMode = "none" | "ruler" | "draw" | "annotate";

const TOKEN_COLORS = [
  "oklch(45% 0.12 28)", // accent ramp L45 (--accent-hover)
  "oklch(52% 0.10 28)", // accent ramp L52 (--accent)
  "oklch(60% 0.10 28)", // accent ramp L60
  "oklch(70% 0.08 28)", // accent ramp L70
  "oklch(50% 0.14 25)", // --danger (hostile tokens)
  "oklch(65% 0.12 85)", // --warn (neutral tokens)
];

const TOKEN_SHAPES: TokenShape[] = ["circle", "square", "star"];

const STAR_OUTER = 16;
const STAR_INNER = 7;

// 5-point star polygon points centred on (0,0), point up.
const starPoints = (outer: number, inner: number): string => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
};

const resolveAssetUrl = (vaultPath: string, mapRelPath: string, relPath: string): string => {
  const dir = mapRelPath.includes("/") ? mapRelPath.slice(0, mapRelPath.lastIndexOf("/")) : "";
  const separator = dir ? "/" : "";
  try {
    return convertFileSrc(`${vaultPath}${separator}${dir}/${relPath.replace(/^\.\//, "")}`);
  } catch {
    return `${vaultPath}${separator}${dir}/${relPath.replace(/^\.\//, "")}`;
  }
};

export const MapBuilderView: React.FC<MapBuilderViewProps> = ({
  vaultPath,
  mapRelPath,
  alert,
  onDirtyChange,
  registerSave,
}) => {
  const [isDirty, setIsDirty] = useState(false);
  const [tokens, setTokens] = useState<MapToken[]>([]);
  const [fog, setFog] = useState<FogRegion[]>([]);
  const [background, setBackground] = useState<MapBackground | null>(null);
  const [drawings, setDrawings] = useState<MapDrawings>({ lines: [], annotations: [] });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 40, y: 40 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<CanvasMode>("none");
  const [rulerPoints, setRulerPoints] = useState<{ x: number; y: number }[]>([]);
  const [rulerDistance, setRulerDistance] = useState<number | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [namingToken, setNamingToken] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenShape, setTokenShape] = useState<TokenShape>("circle");
  const [currentLine, setCurrentLine] = useState<{ x: number; y: number }[]>([]);
  const [placingAnnotation, setPlacingAnnotation] = useState<{ x: number; y: number } | null>(null);
  const [annotationText, setAnnotationText] = useState("");
  const [showGrid, setShowGrid] = useState(true);
  const tokenNameRef = useRef<HTMLInputElement>(null);
  const annotationRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const rulerMode = mode === "ruler";

  // Set to true once the initial map load has populated state, so the dirty
  // tracker below does not treat the initial load as a user edit. The flag is
  // flipped in an effect that runs AFTER the dirty-tracking effect on the load
  // commit, so the load render itself is never counted as a user edit.
  const loadCompletedRef = useRef(false);
  const hasLoadedRef = useRef(false);

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
        setBackground(data.background || null);
        setDrawings(
          data.drawings || { lines: [], annotations: [] },
        );
        loadCompletedRef.current = true;
      })
      .catch((err) => console.error("Error loading map file:", err));
  }, [mapRelPath]);

  useEffect(() => {
    loadMap();
  }, [loadMap, vaultPath]);

  // Track dirty state: any change to tokens / fog / background / drawings
  // after the initial load marks the map dirty. The initial load itself is
  // not a user edit, so it is excluded via hasLoadedRef.
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    setIsDirty(true);
  }, [tokens, fog, background, drawings]);

  // Flip the loaded flag AFTER the dirty-tracking effect has run on the load
  // commit, so the load render is never counted as a user edit.
  useEffect(() => {
    if (loadCompletedRef.current) {
      hasLoadedRef.current = true;
    }
  }, [tokens, fog, background, drawings]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const saveMap = () => {
    const data: MapData = { type: "map", tokens, fog, background, drawings };
    invoke("save_canvas_file", {
      relPath: mapRelPath,
      content: JSON.stringify(data, null, 2),
    })
      .then(() => {
        setIsDirty(false);
        alert("Map saved successfully!");
      })
      .catch((err) => alert("Failed to save map: " + err));
  };

  // Expose a save that resolves to success/failure so the parent can persist
  // before navigating away (used by the unsaved-changes guard).
  useEffect(() => {
    registerSave?.(() =>
      new Promise<boolean>((resolve) => {
        const data: MapData = { type: "map", tokens, fog, background, drawings };
        invoke("save_canvas_file", {
          relPath: mapRelPath,
          content: JSON.stringify(data, null, 2),
        })
          .then(() => {
            setIsDirty(false);
            resolve(true);
          })
          .catch((err) => {
            alert("Failed to save map: " + err);
            resolve(false);
          });
      }),
    );
  }, [registerSave, tokens, fog, background, drawings, mapRelPath, alert]);

  const addToken = () => {
    setTokenName("");
    setTokenShape("circle");
    setNamingToken(true);
  };

  const commitTokenName = () => {
    const label = tokenName.trim() || "Token";
    setNamingToken(false);
    const color = TOKEN_COLORS[tokens.length % TOKEN_COLORS.length];
    setTokens((prev) => [
      ...prev,
      { id: `token-${Date.now()}`, label, x: 120, y: 120, color, shape: tokenShape },
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

  const canvasToWorld = (e: React.MouseEvent): { x: number; y: number } | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (e.clientX - rect.left - pan.x) / zoom,
      y: (e.clientY - rect.top - pan.y) / zoom,
    };
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    setSelectedTokenId(null);
    const pt = canvasToWorld(e);
    if (!pt) return;

    if (mode === "ruler") {
      setRulerPoints((prev) => {
        const next = [...prev, pt];
        if (next.length === 2) {
          const dx = next[1].x - next[0].x;
          const dy = next[1].y - next[0].y;
          setRulerDistance(Math.round(Math.sqrt(dx * dx + dy * dy)));
          return next;
        }
        return next;
      });
    } else if (mode === "draw") {
      setCurrentLine((prev) => [...prev, pt]);
    } else if (mode === "annotate") {
      setPlacingAnnotation(pt);
      setAnnotationText("");
      setTimeout(() => annotationRef.current?.focus(), 0);
    }
  };

  const clearRuler = () => {
    setRulerPoints([]);
    setRulerDistance(null);
  };

  const finishLine = () => {
    if (currentLine.length < 2) {
      setCurrentLine([]);
      return;
    }
    setDrawings((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          id: `line-${Date.now()}`,
          points: currentLine,
          color: "var(--accent)",
          strokeWidth: 2,
        },
      ],
    }));
    setCurrentLine([]);
  };

  const cancelLine = () => {
    setCurrentLine([]);
  };

  const commitAnnotation = () => {
    if (placingAnnotation && annotationText.trim()) {
      setDrawings((prev) => ({
        ...prev,
        annotations: [
          ...prev.annotations,
          {
            id: `annotation-${Date.now()}`,
            x: placingAnnotation.x,
            y: placingAnnotation.y,
            text: annotationText.trim(),
            color: "var(--accent)",
          },
        ],
      }));
    }
    setPlacingAnnotation(null);
    setAnnotationText("");
  };

  const clearDrawings = () => {
    setDrawings({ lines: [], annotations: [] });
    setCurrentLine([]);
    setPlacingAnnotation(null);
  };

  const handleBackgroundSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;
      const base64Data = dataUrl.split(",")[1] || "";

      try {
        const assetRelPath = await invoke<string>("save_note_asset", {
          notePath: mapRelPath,
          filename: file.name,
          base64Data,
        });

        // Measure natural dimensions for the SVG coordinate space.
        const img = new Image();
        img.onload = () => {
          setBackground({
            relPath: assetRelPath,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 600,
          });
          alert("Background image added.");
        };
        img.onerror = () => {
          setBackground({ relPath: assetRelPath, width: 800, height: 600 });
          alert("Background image added (dimensions unknown).");
        };
        img.src = dataUrl;
      } catch (err) {
        alert("Failed to import background image: " + err);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeBackground = () => {
    setBackground(null);
  };

  const toggleMode = (next: CanvasMode) => {
    setMode((prev) => {
      const newMode = prev === next ? "none" : next;
      if (newMode !== "ruler") clearRuler();
      if (newMode !== "draw") cancelLine();
      if (newMode !== "annotate") setPlacingAnnotation(null);
      return newMode;
    });
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

  // Fit all tokens + fog regions + background into the viewport.
  const fitToView = () => {
    const el = canvasRef.current;
    if (!el || !el.clientWidth || !el.clientHeight) return;
    const pad = 60;
    const allX = [
      ...tokens.map((t) => t.x),
      ...fog.map((f) => f.x),
      ...(background ? [0, background.width] : []),
    ];
    const allY = [
      ...tokens.map((t) => t.y),
      ...fog.map((f) => f.y),
      ...(background ? [0, background.height] : []),
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

  // Token palette: distinct (label, shape, color) combos, most recent first,
  // capped at 8. Clicking a palette item drops another copy of that marker.
  const paletteItems = useMemo(() => {
    const seen = new Map<string, MapToken>();
    for (const t of tokens) {
      const key = `${t.label}|${t.shape || "circle"}|${t.color}`;
      if (!seen.has(key)) seen.set(key, t);
    }
    return Array.from(seen.values()).slice(0, 8);
  }, [tokens]);

  const addFromPalette = (item: MapToken) => {
    const offset = (paletteItems.length % 8) * 16;
    setTokens((prev) => [
      ...prev,
      {
        id: `token-${Date.now()}`,
        label: item.label,
        x: 120 + offset,
        y: 120 + offset,
        color: item.color,
        shape: item.shape || "circle",
      },
    ]);
  };

  const renderTokenShape = (t: MapToken, isSelected: boolean) => {
    const common = {
      fill: t.color,
      stroke: isSelected ? "var(--accent)" : "var(--surface)",
      strokeWidth: 2,
    };
    switch (t.shape || "circle") {
      case "square":
        return <rect x={-16} y={-16} width={32} height={32} rx={0} {...common} />;
      case "star":
        return <polygon points={starPoints(STAR_OUTER, STAR_INNER)} {...common} />;
      case "circle":
      default:
        return <circle r={16} {...common} />;
    }
  };

  const bgUrl = background
    ? resolveAssetUrl(vaultPath, mapRelPath, background.relPath)
    : null;

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
          <button
            className="btn btn-sm"
            onClick={() => setShowGrid((g) => !g)}
            title={showGrid ? "Hide Grid" : "Show Grid"}
            data-od-id="map-grid-toggle-btn"
            style={{
              background: showGrid ? "var(--accent)" : "var(--surface)",
              color: showGrid ? "#fff" : "var(--fg)",
            }}
          >
            <Grid3x3 size={12} />
          </button>
          <span style={{ width: 1, height: 24, background: "var(--border)", margin: "0 8px" }} />
          <button
            className="btn btn-sm"
            onClick={() => backgroundInputRef.current?.click()}
            title="Import Background Image"
            data-od-id="map-bg-btn"
          >
            <ImageIcon size={12} /> BG
          </button>
          {background && (
            <button
              className="btn btn-sm"
              onClick={removeBackground}
              title="Remove Background"
              data-od-id="map-bg-remove-btn"
            >
              <XIcon size={12} />
            </button>
          )}
          <button
            className="btn btn-sm"
            onClick={() => toggleMode("draw")}
            title="Draw Lines"
            data-od-id="map-draw-btn"
            style={{
              background: mode === "draw" ? "var(--accent)" : "var(--surface)",
              color: mode === "draw" ? "#fff" : "var(--fg)",
            }}
          >
            <PenLine size={12} />
          </button>
          <button
            className="btn btn-sm"
            onClick={() => toggleMode("annotate")}
            title="Add Text Annotation"
            data-od-id="map-annotate-btn"
            style={{
              background: mode === "annotate" ? "var(--accent)" : "var(--surface)",
              color: mode === "annotate" ? "#fff" : "var(--fg)",
            }}
          >
            <Type size={12} />
          </button>
          <button
            className="btn btn-sm"
            onClick={clearDrawings}
            title="Clear Drawings"
            data-od-id="map-clear-drawings-btn"
          >
            <Eraser size={12} />
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
            onClick={() => toggleMode("ruler")}
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
      {tokens.length === 0 && fog.length === 0 && !background && drawings.lines.length === 0 && drawings.annotations.length === 0 && (
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
            Import a background image, add tokens to mark characters and
            landmarks, or fog-of-war regions to hide areas from players.
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
          cursor: isPanning ? "grabbing" : rulerMode ? "crosshair" : mode === "draw" ? "crosshair" : mode === "annotate" ? "crosshair" : "default",
        }}
      >
        <svg
          width="100%"
          height="100%"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Background image (under grid + fog + tokens) */}
            {bgUrl && background && (
              <image
                href={bgUrl}
                x={0}
                y={0}
                width={background.width}
                height={background.height}
                preserveAspectRatio="xMidYMid meet"
                data-od-id="map-background"
              />
            )}

            {/* Grid */}
            {showGrid && (
              <>
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
                </defs>
                <rect
                  x="-2000"
                  y="-2000"
                  width="4000"
                  height="4000"
                  fill="url(#map-grid)"
                />
              </>
            )}

            {/* Hatching for hidden fog — distinguishes "intentionally hidden"
                from "just dark". */}
            <defs>
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

            {/* Saved drawing lines */}
            {drawings.lines.map((line) => (
              <polyline
                key={line.id}
                points={line.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
            ))}

            {/* In-progress draw line */}
            {currentLine.length > 0 && (
              <polyline
                points={currentLine.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 4"
              />
            )}

            {/* Saved annotations */}
            {drawings.annotations.map((a) => (
              <g key={a.id}>
                <circle cx={a.x} cy={a.y} r={3} fill={a.color} />
                <text
                  x={a.x + 8}
                  y={a.y + 4}
                  fontSize="12"
                  fill={a.color}
                  fontWeight={600}
                  paintOrder="stroke"
                  stroke="var(--surface)"
                  strokeWidth={3}
                  strokeLinejoin="round"
                >
                  {a.text}
                </text>
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
                  <g data-od-id={`map-token-shape-${t.shape || "circle"}`}>
                    {renderTokenShape(t, isSelected)}
                  </g>
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

        {/* Token palette */}
        {paletteItems.length > 0 && (
          <div
            data-od-id="map-palette"
            style={{
              position: "absolute",
              bottom: "12px",
              left: "12px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              padding: "6px",
              display: "flex",
              gap: "6px",
              alignItems: "center",
              zIndex: 5,
            }}
          >
            <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Palette
            </span>
            {paletteItems.map((item, idx) => (
              <button
                key={`${item.label}-${idx}`}
                className="btn btn-sm"
                title={`Add ${item.label}`}
                data-od-id={`map-palette-${item.label}`}
                onClick={() => addFromPalette(item)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 6px",
                }}
              >
                <svg width="12" height="12" viewBox="-16 -16 32 32">
                  {item.shape === "square" ? (
                    <rect x={-16} y={-16} width={32} height={32} rx={0} fill={item.color} />
                  ) : item.shape === "star" ? (
                    <polygon points={starPoints(16, 7)} fill={item.color} />
                  ) : (
                    <circle r={16} fill={item.color} />
                  )}
                </svg>
                {truncateLabel(item.label)}
              </button>
            ))}
          </div>
        )}

        {/* Ruler hint */}
        {rulerMode && (
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              right: "12px",
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

        {/* Draw hint */}
        {mode === "draw" && (
          <div
            data-od-id="map-draw-hint"
            style={{
              position: "absolute",
              bottom: "12px",
              right: "12px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              padding: "6px 10px",
              fontSize: "11px",
              color: "var(--fg)",
              zIndex: 5,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {currentLine.length === 0
              ? "Click to place points..."
              : `${currentLine.length} points`}
            <button
              onClick={finishLine}
              disabled={currentLine.length < 2}
              style={{
                background: currentLine.length < 2 ? "transparent" : "var(--accent)",
                border: "none",
                color: currentLine.length < 2 ? "var(--muted)" : "#fff",
                cursor: currentLine.length < 2 ? "default" : "pointer",
                fontSize: "11px",
                padding: "2px 6px",
              }}
            >
              Finish
            </button>
            <button
              onClick={cancelLine}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: "11px",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Annotate hint */}
        {mode === "annotate" && (
          <div
            data-od-id="map-annotate-hint"
            style={{
              position: "absolute",
              bottom: "12px",
              right: "12px",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              padding: "6px 10px",
              fontSize: "11px",
              color: "var(--fg)",
              zIndex: 5,
            }}
          >
            Click the map to place an annotation.
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "12px",
              }}
            >
              <span style={{ fontSize: "10px", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Shape
              </span>
              {TOKEN_SHAPES.map((shape) => (
                <button
                  key={shape}
                  className="btn btn-sm"
                  title={`${shape.charAt(0).toUpperCase() + shape.slice(1)} token`}
                  data-od-id={`map-token-shape-picker-${shape}`}
                  onClick={() => setTokenShape(shape)}
                  style={{
                    background: tokenShape === shape ? "var(--accent)" : "var(--surface)",
                    color: tokenShape === shape ? "#fff" : "var(--fg)",
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "2px 6px",
                  }}
                >
                  {shape === "square" ? (
                    <SquareIcon size={12} />
                  ) : shape === "star" ? (
                    <StarIcon size={12} />
                  ) : (
                    <CircleIcon size={12} />
                  )}
                </button>
              ))}
            </div>
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

        {/* Annotation input overlay (positioned at the click point) */}
        {placingAnnotation && (
          <div
            style={{
              position: "absolute",
              left: placingAnnotation.x * zoom + pan.x,
              top: placingAnnotation.y * zoom + pan.y,
              zIndex: 20,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              padding: "8px",
              width: 220,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={annotationRef}
              autoFocus
              value={annotationText}
              onChange={(e) => setAnnotationText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitAnnotation();
                if (e.key === "Escape") {
                  setPlacingAnnotation(null);
                  setAnnotationText("");
                }
              }}
              placeholder="Annotation text"
              style={{
                width: "100%",
                padding: "4px 6px",
                border: "1px solid var(--border)",
                borderRadius: 0,
                background: "var(--bg)",
                color: "var(--fg)",
                fontSize: "12px",
                outline: "none",
                marginBottom: "6px",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setPlacingAnnotation(null);
                  setAnnotationText("");
                }}
              >
                Cancel
              </button>
              <button className="btn btn-sm btn-primary" onClick={commitAnnotation}>
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden background file input */}
      <input
        type="file"
        ref={backgroundInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={handleBackgroundSelected}
      />
    </div>
  );
};

export default MapBuilderView;
