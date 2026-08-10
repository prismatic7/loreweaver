import React, { useMemo } from "react";
import { CampaignNote } from "../types";

/**
 * TimelineView
 *
 * Renders a scrollable campaign timeline from notes that carry a `date`
 * frontmatter field (e.g. `date: 1245-03-17` or `date: Year 3, Spring`).
 * Events are sorted chronologically and shown as a vertical timeline.
 */

interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  type: string;
  content: string;
}

interface TimelineViewProps {
  notes: CampaignNote[];
  onOpenNote: (noteId: string) => void;
}

const parseDateKey = (dateStr: string): number => {
  // Try to extract a sortable numeric key from common date formats.
  const s = dateStr.trim();
  // ISO-like: 1245-03-17
  const iso = s.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return parseInt(iso[1], 10) * 10000 + parseInt(iso[2], 10) * 100 + parseInt(iso[3], 10);
  }
  // Year first: "1245" or "Year 3"
  const year = s.match(/(\d{1,4})/);
  if (year) {
    return parseInt(year[1], 10) * 10000;
  }
  return 0;
};

export const TimelineView: React.FC<TimelineViewProps> = ({
  notes,
  onOpenNote,
}) => {
  const events = useMemo<TimelineEvent[]>(() => {
    const list: TimelineEvent[] = [];
    notes.forEach((note) => {
      const date = note.frontmatter?.date;
      if (typeof date === "string" && date.trim()) {
        list.push({
          id: note.id,
          title: note.title,
          date: date.trim(),
          type: String(note.frontmatter?.type || "Event"),
          content: note.content.slice(0, 160),
        });
      }
    });
    return list.sort((a, b) => parseDateKey(a.date) - parseDateKey(b.date));
  }, [notes]);

  if (events.length === 0) {
    return (
      <div
        className="view-container"
        data-od-id="timeline-view"
        style={{ padding: "40px 32px" }}
      >
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>
          Campaign Timeline
        </h2>
        <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "8px" }}>
          No dated events found. Add a <code>date</code> field to a note's
          frontmatter (e.g. <code>date: 1245-03-17</code>) to place it on the
          timeline.
        </p>
      </div>
    );
  }

  return (
    <div
      className="view-container"
      data-od-id="timeline-view"
      style={{ padding: "40px 32px", overflowY: "auto" }}
    >
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600 }}>
        Campaign Timeline
      </h2>
      <p style={{ fontSize: "12px", color: "var(--muted)", margin: "4px 0 24px 0" }}>
        {events.length} dated events, sorted chronologically.
      </p>

      <div style={{ position: "relative", paddingLeft: "24px", maxWidth: "720px" }}>
        {/* Vertical line */}
        <div
          style={{
            position: "absolute",
            left: "6px",
            top: "0",
            bottom: "0",
            width: "2px",
            background: "var(--border)",
          }}
        />
        {events.map((ev) => (
          <div
            key={ev.id}
            style={{
              position: "relative",
              marginBottom: "20px",
              paddingLeft: "20px",
            }}
          >
            {/* Dot */}
            <div
              style={{
                position: "absolute",
                left: "-21px",
                top: "4px",
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "var(--accent)",
                border: "2px solid var(--surface)",
              }}
            />
            <button
              onClick={() => onOpenNote(ev.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "12px 16px",
                cursor: "pointer",
                color: "var(--fg)",
              }}
              data-od-id={`timeline-event-${ev.id}`}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "var(--accent)",
                  }}
                >
                  {ev.date}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {ev.type}
                </span>
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600, marginTop: "4px" }}>
                {ev.title}
              </div>
              {ev.content && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--muted)",
                    marginTop: "4px",
                    lineHeight: "1.4",
                  }}
                >
                  {ev.content}
                </div>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TimelineView;
