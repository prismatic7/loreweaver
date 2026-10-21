import React from "react";
import { Activity, X } from "lucide-react";
import type { ActivityEntry } from "../hooks/useActivityLog";

/**
 * Activity centre (F4.5).
 *
 * A badge in the title bar and a panel that lists what the app has just done —
 * saves, generated images, manifest changes, dice, session events, vault syncs.
 * It exists so routine activity has somewhere to go that is *not* a blocking
 * toast: nothing here steals focus, and the panel only opens when asked.
 */
export interface ActivityCentreProps {
  entries: ActivityEntry[];
  unread: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onClear: () => void;
}

function formatTime(at: number): string {
  if (!at) return "";
  const date = new Date(at);
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const ActivityCentre: React.FC<ActivityCentreProps> = ({
  entries,
  unread,
  open,
  onToggle,
  onClose,
  onClear,
}) => {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={onToggle}
        data-od-id="activity-badge"
        aria-label={unread > 0 ? `Activity (${unread} new)` : "Activity"}
        title={unread > 0 ? `${unread} new activity` : "Activity"}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: "4px",
          background: "transparent",
          border: "none",
          color: unread > 0 ? "var(--accent)" : "var(--muted)",
          cursor: "pointer",
          padding: "2px 4px",
          fontSize: "11px",
        }}
      >
        <Activity size={14} />
        {unread > 0 && (
          <span
            data-od-id="activity-unread"
            style={{
              minWidth: "14px",
              height: "14px",
              padding: "0 3px",
              borderRadius: "7px",
              background: "var(--accent)",
              color: "var(--bg)",
              fontSize: "9px",
              fontWeight: 700,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-od-id="activity-panel"
          role="dialog"
          aria-label="Activity log"
          style={{
            position: "absolute",
            top: "22px",
            right: 0,
            width: "320px",
            maxHeight: "60vh",
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            zIndex: 1500,
            fontSize: "11px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 8px",
              borderBottom: "1px solid var(--border)",
              position: "sticky",
              top: 0,
              background: "var(--surface)",
            }}
          >
            <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>Activity</span>
            <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                onClick={onClear}
                disabled={entries.length === 0}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted)",
                  cursor: entries.length === 0 ? "default" : "pointer",
                  fontSize: "10px",
                  padding: 0,
                }}
                data-od-id="activity-clear"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close activity"
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
            </span>
          </div>

          {entries.length === 0 ? (
            <div style={{ padding: "12px", color: "var(--muted)", fontStyle: "italic" }}>
              Nothing yet this session.
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.key}
                data-od-id={`activity-entry-${entry.key}`}
                style={{
                  display: "flex",
                  gap: "8px",
                  padding: "6px 8px",
                  borderBottom: "1px solid var(--border)",
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "var(--muted)", fontSize: "10px", flexShrink: 0 }}>
                  {formatTime(entry.at)}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ color: "var(--fg)" }}>{entry.label}</span>
                  {entry.count > 1 && (
                    <span style={{ color: "var(--muted)" }}> ×{entry.count}</span>
                  )}
                  {entry.detail && (
                    <span
                      style={{
                        display: "block",
                        color: "var(--muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.detail}
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityCentre;
