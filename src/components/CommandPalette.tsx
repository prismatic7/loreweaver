import React, { useEffect, useMemo, useRef, useState } from "react";

/* eslint-disable react-refresh/only-export-components -- fuzzyScore is exported alongside the palette it belongs to */

/**
 * CommandPalette — keyboard-first navigation (Increment D1).
 *
 * Ctrl/Cmd+K opens a fuzzy jump palette over:
 *   - views (Dashboard, Vault, Rules, AI, ...)
 *   - notes (fuzzy title match, reused style from Increment B's search)
 *   - recent notes (pinned to the top when the query is empty)
 *
 * Pure presentation + local scoring: the parent supplies notes, view labels,
 * and the two callbacks. Keyboard: ↑/↓ move, Enter select, Esc close.
 */

export interface PaletteView {
  id: string;
  label: string;
}

export interface PaletteNote {
  id: string;
  title: string;
  path: string;
}

export interface PaletteSelection {
  kind: "view" | "note";
  id: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  views: PaletteView[];
  notes: PaletteNote[];
  /** Note ids opened most recently, newest first (for the empty-query list). */
  recentNoteIds: string[];
  onSelect: (selection: PaletteSelection) => void;
}

/** Score a query against a target string. Infinity = no match; lower = better. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 0; // empty query matches everything, ranked by recency/order
  const idx = t.indexOf(q);
  if (idx === 0) return 0; // prefix match
  if (idx > 0) return idx; // substring match, penalised by distance
  // Subsequence fallback: every query char must appear in order.
  let ti = 0;
  for (const qc of q) {
    ti = t.indexOf(qc, ti);
    if (ti === -1) return Infinity;
    ti += 1;
  }
  return 100 + (ti - q.length); // weak match, keeps stable ordering
}

interface Row {
  key: string;
  kind: "view" | "note";
  id: string;
  label: string;
  detail: string;
  score: number;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  views,
  notes,
  recentNoteIds,
  onSelect,
}) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus after mount so the input exists.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const v of views) {
      const score = fuzzyScore(query, v.label);
      if (score === Infinity) continue;
      out.push({
        key: `view:${v.id}`,
        kind: "view",
        id: v.id,
        label: v.label,
        detail: "view",
        score,
      });
    }
    const byId = new Map(notes.map((n) => [n.id, n]));
    const recent = recentNoteIds
      .map((id) => byId.get(id))
      .filter((n): n is PaletteNote => Boolean(n));
    const orderedNotes = query.trim()
      ? notes
      : [...recent, ...notes.filter((n) => !recent.some((r) => r.id === n.id))];
    for (const n of orderedNotes) {
      const score = fuzzyScore(query, n.title);
      if (score === Infinity) continue;
      const recencyBoost =
        !query.trim() && recent.some((r) => r.id === n.id) ? -0.25 : 0;
      out.push({
        key: `note:${n.id}`,
        kind: "note",
        id: n.id,
        label: n.title,
        detail: n.path,
        score: score + recencyBoost,
      });
    }
    out.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label));
    return out.slice(0, 12);
  }, [query, views, notes, recentNoteIds]);

  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(rows.length - 1, 0)));
  }, [rows.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    // jsdom (and some embedded webviews) lack scrollIntoView — guard it.
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (!open) return null;

  const choose = (row: Row | undefined) => {
    if (!row) return;
    onSelect({ kind: row.kind, id: row.id });
    onClose();
  };

  return (
    <div
      data-od-id="command-palette"
      role="dialog"
      aria-label="Command palette"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 2000,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "12vh",
      }}
    >
      <div
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "520px",
          maxWidth: "90vw",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(rows[activeIndex]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Jump to a view or note..."
          aria-label="Palette query"
          autoFocus
          style={{
            width: "100%",
            padding: "12px 16px",
            fontSize: 14,
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--border)",
            color: "var(--fg)",
            outline: "none",
          }}
        />
        <div ref={listRef} style={{ maxHeight: "320px", overflowY: "auto" }}>
          {rows.length === 0 && (
            <div style={{ padding: "16px", color: "var(--muted)", fontSize: 13 }}>
              No matches.
            </div>
          )}
          {rows.map((row, i) => (
            <button
              key={row.key}
              data-index={i}
              onClick={() => choose(row)}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                display: "flex",
                width: "100%",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "12px",
                padding: "10px 16px",
                fontSize: 13,
                textAlign: "left",
                background:
                  i === activeIndex ? "var(--surface-hover, var(--bg-hover, rgba(128,128,128,0.15)))" : "transparent",
                border: "none",
                borderBottom: "1px solid var(--border)",
                color: "var(--fg)",
                cursor: "pointer",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.kind === "view" ? "⌘ " : "📄 "}
                {row.label}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>
                {row.detail}
              </span>
            </button>
          ))}
        </div>
        <div
          style={{
            padding: "8px 16px",
            color: "var(--muted)",
            fontSize: 11,
            borderTop: "1px solid var(--border)",
            display: "flex",
            gap: "12px",
          }}
        >
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;