import { useMemo, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CampaignNote } from "../types";

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

  const renderMarkdown = useMemo(() => {
    return (markdown: string): React.ReactNode => {
      if (!markdown) return null;
      const markdownComponents: Components = {
        a: ({ href, children }) => {
          const linkHref = href || "";

          if (linkHref.startsWith("loreweaver-note:")) {
            const targetTitle = decodeURIComponent(linkHref.slice("loreweaver-note:".length));
            const matchedNote = resolveCampaignNote(targetTitle);

            if (matchedNote) {
              return (
                <button
                  type="button"
                  onClick={() => setSelectedNoteId(matchedNote.id)}
                  className="markdown-note-link"
                >
                  {children}
                </button>
              );
            }

            return (
              <button
                type="button"
                onClick={() => handleCreateNoteFromLink(targetTitle)}
                className="markdown-note-link markdown-note-link-missing"
                title="Note does not exist. Click to create."
              >
                {children}?
              </button>
            );
          }

          if (/^https?:\/\//i.test(linkHref)) {
            return (
              <a
                href={linkHref}
                target="_blank"
                rel="noreferrer noopener"
                className="markdown-external-link"
              >
                {children}
              </a>
            );
          }

          return (
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="markdown-external-link"
            >
              {children}
            </a>
          );
        },
        table: ({ children }) => <table className="markdown-table">{children}</table>,
        thead: ({ children }) => <thead>{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => <th>{children}</th>,
        td: ({ children }) => <td>{children}</td>,
        blockquote: ({ children }) => (
          <blockquote className="markdown-quote">{children}</blockquote>
        ),
        pre: ({ children }) => <pre className="markdown-pre">{children}</pre>,
        code: ({ className, children }) => (
          <code className={className ? `markdown-code ${className}` : "markdown-code"}>
            {children}
          </code>
        ),
        img: ({ src, alt, title }) => {
          let finalSrc = src || "";
          if (finalSrc.startsWith("_assets/") || finalSrc.includes("/_assets/")) {
            const activeNoteObj = notes.find((n) => n.id === selectedNoteId);
            if (activeNoteObj && vaultPath) {
              const parts = activeNoteObj.path.split("/");
              parts.pop();
              const parentRelative = parts.join("/");
              const separator = parentRelative ? "/" : "";
              const absolutePath = `${vaultPath}${separator}${parentRelative}/${finalSrc.replace(
                /^[./]+/,
                "",
              )}`;
              try {
                finalSrc = convertFileSrc(absolutePath);
              } catch (e) {
                console.error("Failed to convert file src:", e);
              }
            }
          }
          return (
            <img
              src={finalSrc}
              alt={alt}
              title={title}
              className="markdown-image"
              style={{ maxWidth: "100%", borderRadius: 0 }}
            />
          );
        },
        audio: ({ src }) => {
          let finalSrc = src || "";
          if (finalSrc.startsWith("_assets/") || finalSrc.includes("/_assets/")) {
            const activeNoteObj = notes.find((n) => n.id === selectedNoteId);
            if (activeNoteObj && vaultPath) {
              const parts = activeNoteObj.path.split("/");
              parts.pop();
              const parentRelative = parts.join("/");
              const separator = parentRelative ? "/" : "";
              const absolutePath = `${vaultPath}${separator}${parentRelative}/${finalSrc.replace(
                /^[./]+/,
                "",
              )}`;
              try {
                finalSrc = convertFileSrc(absolutePath);
              } catch (e) {
                console.error("Failed to convert file src:", e);
              }
            }
          }
          return (
            <audio
              src={finalSrc}
              controls
              className="markdown-audio"
              style={{ width: "100%" }}
            />
          );
        },
      };

      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {markdown}
        </ReactMarkdown>
      );
    };
  }, [notes, selectedNoteId, vaultPath, handleCreateNoteFromLink, resolveCampaignNote, setSelectedNoteId]);

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
