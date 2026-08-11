import React, { useState } from "react";
import { Plus, Download, Upload, Inbox, Sparkles } from "lucide-react";
import { WorldInfo } from "../types";

/**
 * WorldShelf
 *
 * The world switcher — a first-class shelf of worlds (icon, name, description,
 * last-opened) plus the Liminal entry and new-world/export/import actions.
 * Replaces the plain folder dropdown as the primary world-switching surface.
 */

export interface WorldShelfProps {
  worlds: WorldInfo[];
  activeWorldPath: string;
  onSwitchWorld: (path: string) => void;
  onOpenLiminal: () => void;
  onCreateWorld: (name: string, scaffoldFrom: string | null) => Promise<void>;
  onExportWorld: (world: WorldInfo) => Promise<void>;
  onImportWorld: () => Promise<void>;
  onMakeWorldFromLiminal: (name: string) => Promise<void>;
}

export const WorldShelf: React.FC<WorldShelfProps> = ({
  worlds,
  activeWorldPath,
  onSwitchWorld,
  onOpenLiminal,
  onCreateWorld,
  onExportWorld,
  onImportWorld,
  onMakeWorldFromLiminal,
}) => {
  const [showNewWorld, setShowNewWorld] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [scaffoldFrom, setScaffoldFrom] = useState<string>("");
  const [showLiminalBirth, setShowLiminalBirth] = useState(false);
  const [liminalName, setLiminalName] = useState("");

  const handleCreate = async () => {
    const name = newWorldName.trim();
    if (!name) return;
    await onCreateWorld(name, scaffoldFrom || null);
    setNewWorldName("");
    setScaffoldFrom("");
    setShowNewWorld(false);
  };

  const handleLiminalBirth = async () => {
    const name = liminalName.trim();
    if (!name) return;
    await onMakeWorldFromLiminal(name);
    setLiminalName("");
    setShowLiminalBirth(false);
  };

  const handleImportClick = async () => {
    await onImportWorld();
  };

  return (
    <div
      className="world-shelf"
      data-od-id="world-shelf"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        position: "relative",
      }}
    >
      <select
        value={activeWorldPath}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "NEW_WORLD_TRIGGER") {
            setShowNewWorld(true);
          } else if (val === "LIMINAL_TRIGGER") {
            onOpenLiminal();
          } else if (val) {
            onSwitchWorld(val);
          }
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--fg)",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          outline: "none",
          paddingRight: "8px",
          maxWidth: "220px",
        }}
        aria-label="World shelf"
      >
        {worlds.map((w) => (
          <option
            key={w.path}
            value={w.path}
            style={{ background: "var(--surface)", color: "var(--fg)" }}
          >
            {w.icon} {w.name}
          </option>
        ))}
        <option
          value="LIMINAL_TRIGGER"
          style={{ background: "var(--surface)", color: "var(--accent)" }}
        >
          ⬛ The Liminal
        </option>
        <option
          value="NEW_WORLD_TRIGGER"
          style={{ background: "var(--surface)", color: "var(--accent)" }}
        >
          + New World...
        </option>
      </select>

      <button
        className="btn btn-sm"
        onClick={() => setShowNewWorld(true)}
        title="New World"
        data-od-id="world-shelf-new"
        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
      >
        <Plus size={13} />
      </button>
      <button
        className="btn btn-sm"
        onClick={handleImportClick}
        title="Import World (zip)"
        data-od-id="world-shelf-import"
        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
      >
        <Upload size={13} />
      </button>
      <button
        className="btn btn-sm"
        onClick={() => {
          const active = worlds.find((w) => w.path === activeWorldPath);
          if (active) onExportWorld(active);
        }}
        title="Export active world"
        data-od-id="world-shelf-export"
        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
      >
        <Download size={13} />
      </button>
      <button
        className="btn btn-sm"
        onClick={onOpenLiminal}
        title="Open the Liminal"
        data-od-id="world-shelf-liminal"
        style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
      >
        <Inbox size={13} />
      </button>

      {showNewWorld && (
        <div
          className="world-shelf-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 20,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "12px",
            minWidth: "260px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: "8px" }}>
            New World
          </div>
          <input
            type="text"
            value={newWorldName}
            onChange={(e) => setNewWorldName(e.target.value)}
            placeholder="World name"
            style={{
              width: "100%",
              padding: "6px 8px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              color: "var(--fg)",
              fontSize: "12px",
              marginBottom: "8px",
            }}
          />
          <select
            value={scaffoldFrom}
            onChange={(e) => setScaffoldFrom(e.target.value)}
            style={{
              width: "100%",
              padding: "6px 8px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              color: "var(--fg)",
              fontSize: "12px",
              marginBottom: "8px",
            }}
            aria-label="Scaffold from"
          >
            <option value="">Blank world</option>
            {worlds.map((w) => (
              <option key={w.path} value={w.path}>
                Scaffold from {w.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
            <button
              className="btn btn-sm"
              onClick={() => setShowNewWorld(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleCreate}
              disabled={!newWorldName.trim()}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {showLiminalBirth && (
        <div
          className="world-shelf-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 20,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "12px",
            minWidth: "260px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Sparkles size={13} /> Make the Liminal a World
          </div>
          <input
            type="text"
            value={liminalName}
            onChange={(e) => setLiminalName(e.target.value)}
            placeholder="New world name"
            style={{
              width: "100%",
              padding: "6px 8px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              color: "var(--fg)",
              fontSize: "12px",
              marginBottom: "8px",
            }}
          />
          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
            <button
              className="btn btn-sm"
              onClick={() => setShowLiminalBirth(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleLiminalBirth}
              disabled={!liminalName.trim()}
            >
              Birth World
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorldShelf;
