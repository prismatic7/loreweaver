import React from "react";
import { FileText, ArrowUpRight, AlertTriangle } from "lucide-react";
import { CampaignNote } from "../../types";

export interface TranscludedNoteCardProps {
  target: string;
  heading?: string;
  notes: CampaignNote[];
  embedStack: Set<string>;
  onSelectNote: (noteId: string) => void;
  renderChildMarkdown: (content: string, embedStack: Set<string>) => React.ReactNode;
}

export const TranscludedNoteCard: React.FC<TranscludedNoteCardProps> = ({
  target,
  heading,
  notes,
  embedStack,
  onSelectNote,
  renderChildMarkdown,
}) => {
  const normalizedTarget = target.trim().toLowerCase();

  const matchedNote = notes.find((note) => {
    if (note.title.trim().toLowerCase() === normalizedTarget) return true;
    const stem = (note.path.split("/").pop() || "").replace(/\.md$/i, "").toLowerCase();
    if (stem === normalizedTarget) return true;
    const aliases = note.frontmatter.aliases ?? note.frontmatter.alias;
    if (Array.isArray(aliases)) {
      return aliases.some((a) => String(a).trim().toLowerCase() === normalizedTarget);
    }
    if (typeof aliases === "string") {
      return aliases.trim().toLowerCase() === normalizedTarget;
    }
    return false;
  });

  if (!matchedNote) {
    return (
      <div className="markdown-note-embed-card">
        <div className="markdown-note-embed-header">
          <div className="markdown-note-embed-title-group">
            <FileText size={14} />
            <span>Embedded Note: {target} (Not Found)</span>
          </div>
        </div>
      </div>
    );
  }

  // Cycle guard
  if (embedStack.has(matchedNote.id)) {
    return (
      <div className="markdown-note-embed-card">
        <div className="markdown-embed-cycle-warning">
          <AlertTriangle size={14} />
          <span>Circular embed detected: [[{matchedNote.title}]]</span>
        </div>
      </div>
    );
  }

  // Depth guard
  if (embedStack.size >= 3) {
    return (
      <div className="markdown-note-embed-card">
        <div className="markdown-embed-cycle-warning">
          <AlertTriangle size={14} />
          <span>Transclusion depth exceeded (max 3): [[{matchedNote.title}]]</span>
        </div>
      </div>
    );
  }

  // Heading section extraction if heading is specified
  let contentToRender = matchedNote.content;
  if (heading) {
    const lines = matchedNote.content.split("\n");
    let capturing = false;
    let captureLevel = 0;
    const capturedLines: string[] = [];

    for (const line of lines) {
      const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const headingText = headingMatch[2].trim().toLowerCase();
        if (capturing) {
          if (level <= captureLevel) {
            break; // next heading of same or higher level ends section
          }
        } else if (headingText === heading.trim().toLowerCase()) {
          capturing = true;
          captureLevel = level;
        }
      }
      if (capturing) {
        capturedLines.push(line);
      }
    }

    if (capturedLines.length > 0) {
      contentToRender = capturedLines.join("\n");
    }
  }

  const nextEmbedStack = new Set(embedStack);
  nextEmbedStack.add(matchedNote.id);

  return (
    <div className="markdown-note-embed-card">
      <div className="markdown-note-embed-header">
        <div className="markdown-note-embed-title-group">
          <FileText size={14} />
          <span>
            {matchedNote.title}
            {heading ? ` > ${heading}` : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSelectNote(matchedNote.id)}
          className="markdown-note-embed-open-btn"
          title="Open note"
        >
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="markdown-note-embed-body">
        {renderChildMarkdown(contentToRender, nextEmbedStack)}
      </div>
    </div>
  );
};
