import React, { useState } from "react";
import { CampaignNote } from "../types";

interface NotePreviewTooltipProps {
  note: CampaignNote;
  children: React.ReactNode;
}

const SNIPPET_LENGTH = 160;

/** Whitespace-collapsed first ~160 chars of a note's content. */
const snippetOf = (note: CampaignNote): string => {
  const body = note.content.replace(/\s+/g, " ").trim();
  if (body.length <= SNIPPET_LENGTH) return body;
  return `${body.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
};

/**
 * Hover preview for a backlink row.
 *
 * Wraps its children in a hover container; while hovered, renders an inline
 * preview block below the trigger with the note title and a content snippet.
 * Inline (rather than absolutely positioned) so it cannot be clipped inside
 * the 320px right-drawer scroll container.
 */
export const NotePreviewTooltip: React.FC<NotePreviewTooltipProps> = ({
  note,
  children,
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "4px" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-od-id={`backlink-preview-${note.id}`}
    >
      {children}
      {hovered && (
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            padding: "8px 10px",
            fontSize: "11px",
            color: "var(--fg)",
            lineHeight: 1.4,
          }}
          data-testid="note-preview"
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{note.title}</div>
          <div style={{ color: "var(--muted)" }}>{snippetOf(note)}</div>
        </div>
      )}
    </div>
  );
};
