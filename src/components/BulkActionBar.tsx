import React from "react";
import { Tag, Trash2, X } from "lucide-react";

/**
 * Selection action bar for the vault tree.
 *
 * Appears only while notes are selected. Move and tag are explicit two-step
 * actions (pick a destination / type a tag, then confirm) so a stray click
 * cannot silently retag or move forty notes.
 */
export interface BulkActionBarProps {
  /** Number of notes currently selected. */
  count: number;
  /** Folders offered as move destinations. */
  folders: string[];
  /** Disables the actions while a batch is in flight. */
  busy?: boolean;
  onTrash: () => void;
  onMove: (targetFolder: string) => void;
  onTag: (tag: string) => void;
  onClear: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  count,
  folders,
  busy = false,
  onTrash,
  onMove,
  onTag,
  onClear,
}) => {
  const [tag, setTag] = React.useState("");

  if (count === 0) return null;

  const disabled = busy;
  const buttonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 6px",
    fontSize: "11px",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 0,
    color: "var(--fg)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div
      data-od-id="bulk-action-bar"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "6px 8px",
        borderBottom: "1px solid var(--accent)",
        background: "var(--surface)",
        fontSize: "11px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
        <span style={{ fontWeight: 700 }} data-od-id="bulk-count">
          {count} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            padding: 0,
            display: "flex",
          }}
        >
          <X size={12} />
        </button>
      </div>

      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onTrash}
          disabled={disabled}
          style={buttonStyle}
          data-od-id="bulk-trash"
        >
          <Trash2 size={11} /> Trash
        </button>

        <select
          value=""
          disabled={disabled}
          aria-label="Move selected notes to folder"
          data-od-id="bulk-move"
          onChange={(e) => {
            if (e.target.value) onMove(e.target.value);
            e.target.value = "";
          }}
          style={{ ...buttonStyle, cursor: disabled ? "not-allowed" : "pointer" }}
        >
          <option value="">Move to…</option>
          {/* Root is always a destination — `move_notes` maps "Root" to the
              vault top level, same as the single-note move. */}
          <option value="Root">Root</option>
          {folders
            .filter((folder) => folder && folder !== "Root")
            .map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: "4px" }}>
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && tag.trim()) {
              onTag(tag.trim());
              setTag("");
            }
          }}
          placeholder="Add tag…"
          aria-label="Tag to add"
          disabled={disabled}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "3px 6px",
            fontSize: "11px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 0,
            color: "var(--fg)",
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (tag.trim()) {
              onTag(tag.trim());
              setTag("");
            }
          }}
          disabled={disabled || !tag.trim()}
          style={buttonStyle}
          data-od-id="bulk-tag"
        >
          <Tag size={11} /> Tag
        </button>
      </div>

      {busy && (
        <span style={{ color: "var(--muted)", fontStyle: "italic" }}>Working…</span>
      )}
    </div>
  );
};

export default BulkActionBar;
