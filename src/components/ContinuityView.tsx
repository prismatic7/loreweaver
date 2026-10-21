import React from "react";
import type { ContinuityReport, Finding } from "../bindings";

export interface ContinuityViewProps {
  report: ContinuityReport | null;
  loading: boolean;
  onRunAudit: () => void;
  /** Opens the note behind a finding in the vault editor (a *suggestion*, never a write). */
  onOpenNote: (noteId: string) => void;
  /** Merges two entities (destructive) — called only after confirmation. */
  onMerge?: (keepId: string, dropId: string) => void;
}

const SEVERITY_ORDER = ["high", "medium", "low"] as const;

const SEVERITY_COLOR: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warn)",
  low: "var(--muted)",
};

export const ContinuityView: React.FC<ContinuityViewProps> = ({
  report,
  loading,
  onRunAudit,
  onOpenNote,
  onMerge,
}) => {
  const findings = report?.findings ?? [];
  const groups = SEVERITY_ORDER.map((severity) => ({
    severity,
    items: findings.filter((f) => f.severity === severity),
  }));

  return (
    <div
      data-od-id="continuity-view"
      style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ fontSize: "1.4rem" }}>Continuity</h2>
        <button
          className="btn btn-sm"
          type="button"
          onClick={onRunAudit}
          disabled={loading}
          style={{ fontSize: "12px", cursor: "pointer" }}
          data-od-id="continuity-run"
        >
          {loading ? "Auditing…" : "Run audit"}
        </button>
      </div>

      {findings.length === 0 && !loading && (
        <div style={{ color: "var(--muted)", fontSize: "13px" }}>
          No continuity issues found. The vault is consistent.
        </div>
      )}

      {groups.map(({ severity, items }) =>
        items.length === 0 ? null : (
          <section key={severity} style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "12px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: SEVERITY_COLOR[severity],
                marginBottom: "8px",
              }}
            >
              {severity} ({items.length})
            </h3>
            {items.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                onOpenNote={onOpenNote}
                onMerge={onMerge}
              />
            ))}
          </section>
        ),
      )}
    </div>
  );
};

const FindingCard: React.FC<{
  finding: Finding;
  onOpenNote: (noteId: string) => void;
  onMerge?: (keepId: string, dropId: string) => void;
}> = ({ finding, onOpenNote, onMerge }) => (
  <div
    style={{
      border: "1px solid var(--border)",
      borderLeft: `3px solid ${SEVERITY_COLOR[finding.severity] ?? "var(--border)"}`,
      borderRadius: 0,
      padding: "10px 12px",
      marginBottom: "8px",
      fontSize: "13px",
      background: "var(--surface)",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "12px",
      }}
    >
      <span style={{ fontWeight: 700 }}>{finding.kind}</span>
      <span style={{ color: "var(--muted)", fontSize: "11px", flexShrink: 0 }}>
        {finding.citation}
      </span>
    </div>
    <div style={{ color: "var(--fg)", margin: "6px 0" }}>{finding.evidence}</div>
    <div style={{ display: "flex", gap: "8px" }}>
      {finding.note_ids.map((noteId) => (
        <button
          key={noteId}
          className="btn btn-sm"
          type="button"
          onClick={() => onOpenNote(noteId)}
          style={{ fontSize: "11px", cursor: "pointer" }}
        >
          Open note
        </button>
      ))}
      {finding.kind === "duplicate_entity" &&
        onMerge &&
        finding.note_ids.length >= 2 && (
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => onMerge(finding.note_ids[0], finding.note_ids[1])}
            style={{ fontSize: "11px", cursor: "pointer" }}
            data-od-id="continuity-merge"
          >
            Merge
          </button>
        )}
    </div>
  </div>
);

export default ContinuityView;
