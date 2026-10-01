import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type Fuse from "fuse.js";

export type EditorNote = {
  title: string;
  content?: string;
  frontmatter: Record<string, unknown>;
};

export interface LinkCandidate {
  label: string;
  detail?: string;
  type: "text";
  target: string;
  applyText: string;
}

export const buildLinkCandidates = (notes: EditorNote[]): LinkCandidate[] => {
  const result: LinkCandidate[] = [];
  const seen = new Set<string>();

  for (const note of notes) {
    const title = (note.title || "").trim();
    if (!title) continue;

    const titleKey = `title:${title.toLowerCase()}`;
    if (!seen.has(titleKey)) {
      seen.add(titleKey);
      result.push({
        label: title,
        detail: "Note",
        type: "text",
        target: title,
        applyText: `${title}]]`,
      });
    }

    const aliasValue = note.frontmatter?.aliases ?? note.frontmatter?.alias;
    const aliases = Array.isArray(aliasValue)
      ? aliasValue
      : typeof aliasValue === "string"
        ? [aliasValue]
        : [];

    for (const rawAlias of aliases) {
      const alias = String(rawAlias).trim();
      if (!alias) continue;
      const aliasKey = `alias:${alias.toLowerCase()}:${title.toLowerCase()}`;
      if (!seen.has(aliasKey)) {
        seen.add(aliasKey);
        result.push({
          label: alias,
          detail: `Alias of ${title}`,
          type: "text",
          target: title,
          applyText: `${title}|${alias}]]`,
        });
      }
    }
  }

  return result;
};

export const wikiLinkCompletion =
  (
    fuse: Fuse<LinkCandidate>,
    candidates: LinkCandidate[],
    notes: EditorNote[],
  ) =>
  (context: CompletionContext): CompletionResult | null => {
    // Matches [[ followed by anything that isn't a closing bracket or newline
    const beforeCursor = context.matchBefore(/\[\[([^\]\r\n]*)$/);
    if (!beforeCursor && !context.explicit) return null;

    const fullMatch = beforeCursor ? beforeCursor.text : "";
    const query = fullMatch.startsWith("[[") ? fullMatch.slice(2).trim() : "";

    // Check if the user is querying for a section / heading (e.g. [[Note Name#Heading)
    if (query.includes("#")) {
      const hashIndex = query.indexOf("#");
      const notePart = query.slice(0, hashIndex).trim().toLowerCase();
      const headingPart = query.slice(hashIndex + 1).trim().toLowerCase();

      const matchedNote = notes.find((n) => {
        if (n.title.trim().toLowerCase() === notePart) return true;
        const aliases = n.frontmatter?.aliases ?? n.frontmatter?.alias;
        if (Array.isArray(aliases)) {
          return aliases.some((a) => String(a).trim().toLowerCase() === notePart);
        }
        if (typeof aliases === "string") {
          return aliases.trim().toLowerCase() === notePart;
        }
        return false;
      });

      if (matchedNote && matchedNote.content) {
        const headingLines = matchedNote.content.split(/\r?\n/);
        const headingCandidates: LinkCandidate[] = [];
        for (const line of headingLines) {
          const match = line.match(/^(#{1,6})\s+(.+)$/);
          if (match) {
            const hText = match[2].trim();
            if (!headingPart || hText.toLowerCase().includes(headingPart)) {
              headingCandidates.push({
                label: `#${hText}`,
                detail: `Section in ${matchedNote.title}`,
                type: "text",
                target: matchedNote.title,
                applyText: `${matchedNote.title}#${hText}]]`,
              });
            }
          }
        }
        if (headingCandidates.length > 0) {
          const after = context.state.sliceDoc(context.pos, context.pos + 2);
          const hasClosing = after === "]]";
          return {
            from: beforeCursor ? beforeCursor.from + 2 : context.pos,
            to: hasClosing ? context.pos + 2 : context.pos,
            options: headingCandidates.map((c) => ({
              label: c.label,
              detail: c.detail,
              type: "text",
              apply: c.applyText,
            })),
            validFor: /^[^\]\r\n]*$/,
          };
        }
      }
    }

    const options = query
      ? fuse.search(query, { limit: 10 }).map((result) => result.item)
      : candidates;

    // Detect if closing ]] brackets are already present immediately after the cursor
    const after = context.state.sliceDoc(context.pos, context.pos + 2);
    const hasClosing = after === "]]";

    return {
      from: beforeCursor ? beforeCursor.from + 2 : context.pos,
      to: hasClosing ? context.pos + 2 : context.pos,
      options: options.map((opt) => ({
        label: opt.label,
        detail: opt.detail,
        type: "text",
        apply: opt.applyText,
      })),
      validFor: /^[^\]\r\n]*$/,
    };
  };
