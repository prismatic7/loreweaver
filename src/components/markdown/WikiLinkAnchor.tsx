import React from "react";

export interface WikiLinkAnchorProps {
  target: string;
  alias: string;
  heading?: string;
  targetNoteId: string | null;
  onSelectNote: (noteId: string) => void;
  onCreateNote: (targetTitle: string) => void;
}

export const WikiLinkAnchor: React.FC<WikiLinkAnchorProps> = ({
  target,
  alias,
  heading,
  targetNoteId,
  onSelectNote,
  onCreateNote,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (targetNoteId) {
      onSelectNote(targetNoteId);
      if (heading) {
        setTimeout(() => {
          const el = document.getElementById(heading.toLowerCase().replace(/\s+/g, "-"));
          el?.scrollIntoView({ behavior: "smooth" });
        }, 150);
      }
    } else {
      onCreateNote(target);
    }
  };

  if (!targetNoteId) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="markdown-note-link markdown-note-link-missing"
        title="Note does not exist. Click to create."
      >
        {alias}?
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="markdown-note-link"
    >
      {alias}
    </button>
  );
};
