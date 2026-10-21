import React from "react";
import { BookmarkPlus, Play, Trash2 } from "lucide-react";
import type { SavedSearch } from "../bindings";

/**
 * Saved searches / smart folders (F4.3).
 *
 * A saved search is a named *view*, not a folder: nothing is moved, nothing is
 * copied. Clicking one filters the tree; the count shows how many notes it
 * currently matches so an empty smart folder is visible rather than mysterious.
 */
export interface SavedSearchesSectionProps {
  searches: SavedSearch[];
  activeId?: string | null;
  /** Number of notes the active search matches (undefined = not running). */
  matchCount?: number | null;
  loading?: boolean;
  onRun: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (name: string, query: string, kind: "filter" | "fts") => void;
  onClear: () => void;
}

export const SavedSearchesSection: React.FC<SavedSearchesSectionProps> = ({
  searches,
  activeId = null,
  matchCount = null,
  loading = false,
  onRun,
  onDelete,
  onSave,
  onClear,
}) => {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<"filter" | "fts">("filter");

  const submit = () => {
    if (!name.trim() || !query.trim()) return;
    onSave(name.trim(), query.trim(), kind);
    setName("");
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      data-od-id="saved-searches"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        padding: "6px 8px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          className="section-label"
          style={{ fontSize: "10px", color: "var(--muted)", letterSpacing: "0.08em" }}
        >
          Smart folders
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Save a new smart folder"
          title="Save a new smart folder"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            padding: 0,
            display: "flex",
          }}
          data-od-id="saved-search-add"
        >
          <BookmarkPlus size={12} />
        </button>
      </div>

      {searches.length === 0 && !open && (
        <span style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic" }}>
          {loading ? "Loading…" : "No smart folders yet."}
        </span>
      )}

      {searches.map((search) => {
        const active = search.id === activeId;
        return (
          <div
            key={search.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: active ? "var(--surface-hover, rgba(255,255,255,0.05))" : "transparent",
              boxShadow: active ? "inset 2px 0 0 var(--accent)" : "none",
              padding: "2px 2px",
            }}
          >
            <button
              type="button"
              onClick={() => (active ? onClear() : onRun(search.id))}
              data-od-id={`saved-search-${search.id}`}
              title={`${search.kind === "fts" ? "Full-text" : "Filter"}: ${search.query}`}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                background: "transparent",
                border: "none",
                color: active ? "var(--fg)" : "var(--muted)",
                fontSize: "11px",
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                padding: "2px 0",
              }}
            >
              <Play size={9} style={{ marginRight: 4, opacity: 0.6 }} />
              {search.name}
              {active && matchCount != null ? ` (${matchCount})` : ""}
            </button>
            <button
              type="button"
              onClick={() => onDelete(search.id)}
              aria-label={`Delete smart folder ${search.name}`}
              title="Delete smart folder (notes are untouched)"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                padding: 0,
                display: "flex",
              }}
            >
              <Trash2 size={10} />
            </button>
          </div>
        );
      })}

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "2px" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Smart folder name"
            style={{
              padding: "3px 6px",
              fontSize: "11px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
            }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder={kind === "fts" ? "Search text" : "type:npc !faction"}
            aria-label="Smart folder query"
            style={{
              padding: "3px 6px",
              fontSize: "11px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
            }}
          />
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "filter" | "fts")}
              aria-label="Smart folder kind"
              style={{
                flex: 1,
                padding: "3px 4px",
                fontSize: "11px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 0,
                color: "var(--fg)",
              }}
            >
              <option value="filter">Filter</option>
              <option value="fts">Full-text</option>
            </select>
            <button
              type="button"
              className="btn btn-sm"
              onClick={submit}
              disabled={!name.trim() || !query.trim()}
              style={{ fontSize: "11px", cursor: "pointer" }}
              data-od-id="saved-search-save"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavedSearchesSection;
