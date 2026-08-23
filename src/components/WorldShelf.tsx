import React, { useRef, useState } from "react";
import { Plus, Download, Upload, Inbox, Sparkles, Check, ChevronDown } from "lucide-react";
import { WorldInfo } from "../types";

/**
 * WorldShelf
 *
 * The world switcher — a first-class shelf of worlds (icon, name, description,
 * last-opened) plus the Liminal entry and new-world/export/import actions.
 * Replaces the plain folder dropdown as the primary world-switching surface.
 *
 * The trigger is a compact chip showing the active world's identity (icon +
 * name). It opens a popover menu in which each world row carries its full
 * identity — icon, name, description, last-opened — so switching is a
 * deliberate act of choosing a world, not picking a value off a folder list.
 * Actions (new / import / export / liminal) live beside the chip as buttons,
 * never inside the switcher itself.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNewWorld, setShowNewWorld] = useState(false);
  const [newWorldName, setNewWorldName] = useState("");
  const [scaffoldFrom, setScaffoldFrom] = useState<string>("");
  const [showLiminalBirth, setShowLiminalBirth] = useState(false);
  const [liminalName, setLiminalName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const active = worlds.find((w) => w.path === activeWorldPath);

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

  const formatLastOpened = (iso: string | null): string => {
    if (!iso) return "Never opened";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Never opened";
    return `Opened ${d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })}`;
  };

  return (
    <div
      className="world-shelf"
      data-od-id="world-shelf"
      ref={containerRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        position: "relative",
      }}
    >
      {/* Switcher chip — shows the active world's identity and opens the shelf */}
      <button
        className="world-shelf-trigger"
        data-od-id="world-shelf-trigger"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="World shelf"
        title={active ? `${active.name} — switch world` : "Select a world"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          maxWidth: "240px",
          background: "transparent",
          border: "none",
          color: "var(--fg)",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          outline: "none",
          padding: "2px 4px",
        }}
      >
        <span style={{ fontSize: "13px", lineHeight: 1 }}>{active?.icon ?? "◌"}</span>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {active?.name ?? "No world"}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: "var(--muted)",
            transform: menuOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
            flexShrink: 0,
          }}
        />
      </button>

      {/* Action buttons — creating/importing/exporting are actions, not switches */}
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

      {/* Shelf popover — every world carries its full identity */}
      {menuOpen && (
        <div
          className="world-shelf-popover"
          data-od-id="world-shelf-menu"
          role="menu"
          aria-label="Worlds"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 20,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            padding: "6px",
            minWidth: "300px",
            maxWidth: "360px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {worlds.map((w) => {
            const isActive = w.path === activeWorldPath;
            return (
              <button
                key={w.path}
                role="menuitem"
                className="world-shelf-row"
                data-od-id={`world-shelf-item-${w.id}`}
                onClick={() => {
                  onSwitchWorld(w.path);
                  setMenuOpen(false);
                }}
                aria-current={isActive}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderRadius: 0,
                  padding: "8px 8px",
                  cursor: "pointer",
                  color: "var(--fg)",
                }}
              >
                <span
                  style={{
                    fontSize: "16px",
                    lineHeight: 1,
                    width: "18px",
                    flexShrink: 0,
                    marginTop: "1px",
                  }}
                >
                  {w.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--fg)",
                      lineHeight: 1.2,
                    }}
                  >
                    {w.name}
                  </span>
                  {w.description && (
                    <span
                      style={{
                        display: "block",
                        fontSize: "11px",
                        color: "var(--muted)",
                        marginTop: "2px",
                        lineHeight: 1.4,
                      }}
                    >
                      {w.description}
                    </span>
                  )}
                  <span
                    style={{
                      display: "block",
                      fontSize: "10px",
                      color: "var(--muted)",
                      letterSpacing: "0.02em",
                      marginTop: "4px",
                      opacity: 0.8,
                    }}
                  >
                    {formatLastOpened(w.last_opened)}
                  </span>
                </span>
                {isActive && (
                  <Check
                    size={14}
                    style={{ color: "var(--accent)", flexShrink: 0, marginTop: "2px" }}
                  />
                )}
              </button>
            );
          })}

          <div
            role="separator"
            style={{
              height: "1px",
              background: "var(--border)",
              margin: "6px 0",
            }}
          />

          <button
            role="menuitem"
            className="world-shelf-row world-shelf-row-liminal"
            data-od-id="world-shelf-item-liminal"
            onClick={() => {
              onOpenLiminal();
              setMenuOpen(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              textAlign: "left",
              border: "none",
              borderRadius: 0,
              padding: "8px 8px",
              cursor: "pointer",
              color: "var(--accent)",
            }}
          >
            <span style={{ fontSize: "16px", lineHeight: 1, width: "18px", flexShrink: 0 }}>
              ⬛
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", fontSize: "12px", fontWeight: 600 }}>
                The Liminal
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "11px",
                  color: "var(--muted)",
                  marginTop: "2px",
                  lineHeight: 1.4,
                }}
              >
                The in-between — where scraps gather before they become notes
              </span>
            </span>
          </button>
        </div>
      )}

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
            borderRadius: 0,
            padding: "12px",
            minWidth: "260px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
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
              borderRadius: 0,
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
              borderRadius: 0,
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
            <button className="btn btn-sm" onClick={() => setShowNewWorld(false)}>
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
            borderRadius: 0,
            padding: "12px",
            minWidth: "260px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
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
              borderRadius: 0,
              color: "var(--fg)",
              fontSize: "12px",
              marginBottom: "8px",
            }}
          />
          <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
            <button className="btn btn-sm" onClick={() => setShowLiminalBirth(false)}>
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
