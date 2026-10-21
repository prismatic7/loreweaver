import React, { useEffect, useMemo, useState } from "react";
import { diffLines, applyHunks } from "../utils/diff";

export interface CoWriterDiffProps {
  open: boolean;
  leftText: string;
  rightText: string;
  onAccept: (result: string) => void;
  onClose: () => void;
  title?: string;
}

/**
 * A hunk-by-hunk review of a co-writer revision. Each hunk is a checkbox —
 * unchecked hunks keep the original lines. "Apply" rebuilds the text from the
 * left side with only the accepted hunks, then hands it back to the editor's
 * normal save path (nothing is written here).
 */
export const CoWriterDiff: React.FC<CoWriterDiffProps> = ({
  open,
  leftText,
  rightText,
  onAccept,
  onClose,
  title = "Revise",
}) => {
  const diff = useMemo(() => diffLines(leftText, rightText), [leftText, rightText]);
  const [accepted, setAccepted] = useState<Set<number>>(
    () => new Set(diff.hunks.map((_, i) => i)),
  );

  // Reset acceptance when the underlying revision changes.
  useEffect(() => {
    setAccepted(new Set(diff.hunks.map((_, i) => i)));
  }, [leftText, rightText, diff.hunks]);

  if (!open) return null;

  const toggle = (index: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div
      data-od-id="co-writer-diff"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "82vh",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          padding: "16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "12px",
          }}
        >
          <h3 style={{ fontSize: "1.05rem" }}>{title}</h3>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>
            {diff.hunks.length} hunk{diff.hunks.length === 1 ? "" : "s"}
          </span>
        </div>

        {diff.hunks.length === 0 && (
          <div style={{ fontSize: "13px", color: "var(--muted)" }}>
            No changes — the revision is identical to the original.
          </div>
        )}

        {diff.hunks.map((hunk, index) => (
          <div
            key={index}
            style={{
              border: "1px solid var(--border)",
              marginBottom: "10px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 8px",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              <input
                type="checkbox"
                checked={accepted.has(index)}
                onChange={() => toggle(index)}
                aria-label={`Accept hunk ${index + 1}`}
              />
              Hunk {index + 1}
            </label>
            {hunk.leftLines.map((line, k) => (
              <div
                key={`l${k}`}
                style={{
                  padding: "2px 8px",
                  background: "color-mix(in srgb, var(--danger) 12%, transparent)",
                  color: "var(--danger)",
                  whiteSpace: "pre-wrap",
                }}
              >
                − {line}
              </div>
            ))}
            {hunk.rightLines.map((line, k) => (
              <div
                key={`r${k}`}
                style={{
                  padding: "2px 8px",
                  background: "color-mix(in srgb, var(--success) 12%, transparent)",
                  color: "var(--success)",
                  whiteSpace: "pre-wrap",
                }}
              >
                + {line}
              </div>
            ))}
          </div>
        ))}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
            marginTop: "12px",
          }}
        >
          <button
            className="btn btn-sm"
            type="button"
            onClick={onClose}
            style={{ fontSize: "12px", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm"
            type="button"
            onClick={() => {
              onAccept(applyHunks(leftText, diff.hunks, accepted));
              onClose();
            }}
            style={{ fontSize: "12px", cursor: "pointer" }}
            data-od-id="co-writer-apply"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoWriterDiff;
