import React from "react";
import type { FileChange, SnapshotInfo } from "../bindings";
import { formatBytes, formatDate } from "../utils/snapshots";

/**
 * Vault Time Machine — snapshot list, snapshot ↔ live-vault diff, single-note
 * restore.
 *
 * Restore is per file and always through the host's `validate_safe_path`, so the
 * view can only ever ask for one note at a time; a whole-vault rollback is
 * deliberately not offered.
 */
export interface TimeMachineViewProps {
  snapshots: SnapshotInfo[];
  loading?: boolean;
  error?: string | null;
  selectedId?: string | null;
  changes?: FileChange[];
  diffLoading?: boolean;
  onRefresh?: () => void;
  onCreate: (label?: string) => void;
  onSelect: (id: string) => void;
  /** Restores a single file; the parent confirms before calling. */
  onRestore: (id: string, path: string) => void;
}

const CHANGE_COLOR: Record<string, string> = {
  added: "var(--ok, var(--accent))",
  modified: "var(--warn)",
  removed: "var(--danger)",
};

export const TimeMachineView: React.FC<TimeMachineViewProps> = ({
  snapshots,
  loading = false,
  error = null,
  selectedId = null,
  changes = [],
  diffLoading = false,
  onRefresh,
  onCreate,
  onSelect,
  onRestore,
}) => {
  const [label, setLabel] = React.useState("");

  const takeSnapshot = () => {
    onCreate(label.trim() || undefined);
    setLabel("");
  };

  const counts = {
    added: changes.filter((c) => c.kind === "added").length,
    modified: changes.filter((c) => c.kind === "modified").length,
    removed: changes.filter((c) => c.kind === "removed").length,
  };

  return (
    <div
      data-od-id="time-machine-view"
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Snapshot list */}
      <section
        data-od-id="snapshot-list"
        style={{
          borderRight: "1px solid var(--border)",
          padding: "24px 16px",
          overflowY: "auto",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <h2 style={{ fontSize: "1.2rem" }}>Time Machine</h2>
          {onRefresh && (
            <button
              className="btn btn-sm"
              type="button"
              onClick={onRefresh}
              disabled={loading}
              style={{ fontSize: "11px", cursor: "pointer" }}
              data-od-id="snapshot-refresh"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") takeSnapshot();
            }}
            placeholder="Label (optional)"
            aria-label="Snapshot label"
            style={{
              flex: 1,
              padding: "5px 8px",
              fontSize: "12px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
            }}
          />
          <button
            className="btn btn-sm"
            type="button"
            onClick={takeSnapshot}
            style={{ fontSize: "12px", cursor: "pointer", whiteSpace: "nowrap" }}
            data-od-id="snapshot-create"
          >
            Snapshot now
          </button>
        </div>

        {error && (
          <div
            data-od-id="snapshot-error"
            style={{ fontSize: "12px", color: "var(--danger)", marginBottom: "12px" }}
          >
            {error}
          </div>
        )}

        {snapshots.length === 0 && !loading && (
          <div style={{ fontSize: "12px", color: "var(--muted)", fontStyle: "italic" }}>
            No snapshots yet. Take one before a session, or before a big edit.
          </div>
        )}

        {snapshots.map((snapshot) => (
          <button
            key={snapshot.id}
            type="button"
            onClick={() => onSelect(snapshot.id)}
            data-od-id={`snapshot-row-${snapshot.id}`}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 10px",
              marginBottom: "6px",
              background: selectedId === snapshot.id ? "var(--bg)" : "transparent",
              border: "1px solid var(--border)",
              borderLeft:
                selectedId === snapshot.id
                  ? "3px solid var(--accent)"
                  : "1px solid var(--border)",
              borderRadius: 0,
              color: "var(--fg)",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {snapshot.label || formatDate(snapshot.created_at)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>
              {formatDate(snapshot.created_at)} · {snapshot.file_count} files ·{" "}
              {formatBytes(snapshot.size_bytes)}
            </div>
          </button>
        ))}
      </section>

      {/* Diff */}
      <section
        data-od-id="snapshot-diff"
        style={{ padding: "24px 32px", overflowY: "auto" }}
      >
        {!selectedId ? (
          <div style={{ fontSize: "13px", color: "var(--muted)" }}>
            Select a snapshot to compare it with the vault as it is now.
          </div>
        ) : diffLoading ? (
          <div style={{ fontSize: "13px", color: "var(--muted)" }}>Comparing…</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: "16px",
                fontSize: "12px",
                marginBottom: "16px",
                color: "var(--muted)",
              }}
            >
              <span data-od-id="diff-added" style={{ color: CHANGE_COLOR.added }}>
                {counts.added} added
              </span>
              <span data-od-id="diff-modified" style={{ color: CHANGE_COLOR.modified }}>
                {counts.modified} modified
              </span>
              <span data-od-id="diff-removed" style={{ color: CHANGE_COLOR.removed }}>
                {counts.removed} removed
              </span>
            </div>

            {changes.length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                The vault matches this snapshot exactly.
              </div>
            ) : (
              changes.map((change) => (
                <div
                  key={`${change.kind}:${change.path}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    borderBottom: "1px solid var(--border)",
                    padding: "6px 0",
                    fontSize: "13px",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                    {change.path}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: CHANGE_COLOR[change.kind] ?? "var(--muted)",
                      }}
                    >
                      {change.kind}
                    </span>
                    {change.kind !== "added" && (
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => onRestore(selectedId, change.path)}
                        style={{ fontSize: "11px", cursor: "pointer" }}
                        data-od-id={`restore-${change.path}`}
                      >
                        Restore
                      </button>
                    )}
                  </span>
                </div>
              ))
            )}

            <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "16px" }}>
              Restoring writes one file from the snapshot over the live copy. Files
              added since the snapshot are left alone.
            </p>
          </>
        )}
      </section>
    </div>
  );
};

export default TimeMachineView;
