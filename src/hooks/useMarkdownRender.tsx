import React, { useMemo, useCallback } from "react";
import { CampaignNote } from "../types";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer";

interface UseMarkdownRenderDeps {
  notes: CampaignNote[];
  selectedNoteId: string;
  vaultPath: string;
  setSelectedNoteId: (id: string) => void;
  setIsEditingNote: (editing: boolean) => void;
  saveNote: (note: CampaignNote) => Promise<void>;
}

export const useMarkdownRender = (deps: UseMarkdownRenderDeps) => {
  const { notes, selectedNoteId, vaultPath, setSelectedNoteId, setIsEditingNote, saveNote } = deps;

  const resolveCampaignNote = useCallback(
    (targetName: string) => {
      const normalizedTarget = targetName.trim().toLowerCase();
      if (!normalizedTarget) return null;

      const getNoteLinkNames = (note: CampaignNote) => {
        const aliasValue = note.frontmatter.aliases ?? note.frontmatter.alias;
        const aliases = Array.isArray(aliasValue)
          ? aliasValue
          : typeof aliasValue === "string"
            ? [aliasValue]
            : [];

        return [note.title, ...aliases]
          .map((value) => String(value).trim())
          .filter(Boolean);
      };

      const matches = notes.filter((note) =>
        getNoteLinkNames(note).some((name) => name.toLowerCase() === normalizedTarget),
      );

      if (matches.length === 1) {
        return matches[0];
      }

      const exactTitleMatches = matches.filter(
        (note) => note.title.trim().toLowerCase() === normalizedTarget,
      );

      if (exactTitleMatches.length === 1) {
        return exactTitleMatches[0];
      }

      return null;
    },
    [notes],
  );

  const handleCreateNoteFromLink = useCallback(
    (title: string) => {
      const newId = `note-${Date.now()}`;
      const newNote: CampaignNote = {
        id: newId,
        title,
        path: `Worldbuilding/${title.replace(/\s+/g, "_")}.md`,
        frontmatter: { type: "Note", tags: ["stub"] },
        content: `# ${title}\n\nThis note was created automatically from a wiki link.`,
      };

      saveNote(newNote)
        .then(() => {
          setSelectedNoteId(newId);
          setIsEditingNote(true);
        })
        .catch((err) => console.error("Failed to create wiki note:", err));
    },
    [saveNote, setSelectedNoteId, setIsEditingNote],
  );

  const handleToggleTask = useCallback(
    (taskIndex: number, newChecked: boolean) => {
      const activeNote = notes.find((n) => n.id === selectedNoteId);
      if (!activeNote) return;

      const lines = activeNote.content.split("\n");
      let currentTaskIdx = 0;
      let inCodeFence = false;
      let modified = false;

      const updatedLines = lines.map((line) => {
        if (/^```/.test(line.trim())) {
          inCodeFence = !inCodeFence;
          return line;
        }
        if (inCodeFence) return line;

        const taskMatch = /^(\s*[-*+]\s+)\[([ xX])\](\s+.*)$/.exec(line);
        if (taskMatch) {
          if (currentTaskIdx === taskIndex) {
            modified = true;
            const marker = newChecked ? "x" : " ";
            currentTaskIdx++;
            return `${taskMatch[1]}[${marker}]${taskMatch[3]}`;
          }
          currentTaskIdx++;
        }
        return line;
      });

      if (modified) {
        const updatedNote: CampaignNote = {
          ...activeNote,
          content: updatedLines.join("\n"),
        };
        saveNote(updatedNote).catch((err) =>
          console.error("Failed to persist toggled task checkbox:", err),
        );
      }
    },
    [notes, selectedNoteId, saveNote],
  );

  const renderMarkdown = useMemo(() => {
    return (markdown: string): React.ReactNode => {
      if (!markdown) return null;
      return (
        <MarkdownRenderer
          content={markdown}
          notes={notes}
          selectedNoteId={selectedNoteId}
          vaultPath={vaultPath}
          onSelectNote={setSelectedNoteId}
          onCreateNote={handleCreateNoteFromLink}
          onToggleTask={handleToggleTask}
        />
      );
    };
  }, [
    notes,
    selectedNoteId,
    vaultPath,
    setSelectedNoteId,
    handleCreateNoteFromLink,
    handleToggleTask,
  ]);

  const renderInlineMarkdown = useCallback(
    (text: string): React.ReactNode => {
      if (!text) return "";
      const regex =
        /\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_|`([^`]+)`|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          parts.push(text.substring(lastIndex, matchIndex));
        }

        if (match[1]) {
          parts.push(<strong key={matchIndex}>{renderInlineMarkdown(match[1])}</strong>);
        } else if (match[2]) {
          parts.push(<em key={matchIndex}>{renderInlineMarkdown(match[2])}</em>);
        } else if (match[3]) {
          parts.push(<em key={matchIndex}>{renderInlineMarkdown(match[3])}</em>);
        } else if (match[4]) {
          parts.push(
            <code
              key={matchIndex}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                padding: "2px 6px",
                borderRadius: 0,
                fontFamily: "var(--font-mono)",
                fontSize: "0.85em",
              }}
            >
              {match[4]}
            </code>,
          );
        } else if (match[5]) {
          const targetName = match[5].trim();
          const displayLabel = match[6] ? match[6].trim() : targetName;
          const matchedNote = resolveCampaignNote(targetName);

          if (matchedNote) {
            parts.push(
              <span
                key={matchIndex}
                onClick={() => setSelectedNoteId(matchedNote.id)}
                style={{
                  color: "var(--accent)",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontWeight: 600,
                }}
              >
                {displayLabel}
              </span>,
            );
          } else {
            parts.push(
              <span
                key={matchIndex}
                onClick={() => handleCreateNoteFromLink(targetName)}
                style={{
                  color: "var(--muted)",
                  cursor: "pointer",
                  borderBottom: "1px dashed var(--muted)",
                  fontStyle: "italic",
                }}
                title="Note does not exist. Click to create."
              >
                {displayLabel}?
              </span>,
            );
          }
        }

        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
      }

      return parts.length > 0 ? <>{parts}</> : text;
    },
    [resolveCampaignNote, handleCreateNoteFromLink, setSelectedNoteId],
  );

  return {
    renderMarkdown,
    renderInlineMarkdown,
    resolveCampaignNote,
    handleCreateNoteFromLink,
  };
};
