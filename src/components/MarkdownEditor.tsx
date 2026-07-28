import {
    autocompletion,
    type CompletionContext,
    type CompletionResult,
} from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, placeholder } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import Fuse from "fuse.js";
import { useMemo } from "react";

/**
 * MarkdownEditor Component
 * Wraps CodeMirror 6 with support for Markdown line-wrapping and wikilink autocompletion.
 * Performs fuzzy search on note titles and aliases to trigger Obsidian-style link injections.
 */


type EditorNote = {
  title: string;
  frontmatter: Record<string, unknown>;
};

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  notes: EditorNote[];
  activeNotePath?: string;
};

const buildLinkCandidates = (notes: EditorNote[]) => {
  const candidates = new Map<string, string>();

  for (const note of notes) {
    const aliasValue = note.frontmatter.aliases ?? note.frontmatter.alias;
    const aliases = Array.isArray(aliasValue)
      ? aliasValue
      : typeof aliasValue === "string"
        ? [aliasValue]
        : [];

    for (const name of [note.title, ...aliases]) {
      const normalized = String(name).trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (!candidates.has(key)) {
        candidates.set(key, note.title);
      }
    }
  }

  return Array.from(candidates.values()).map((label) => ({
    label,
    type: "text" as const,
    apply: `[[${label}]]`,
  }));
};

const wikiLinkCompletion =
  (
    fuse: Fuse<{ label: string; type: "text"; apply: string }>,
    notes: EditorNote[],
  ) =>
  (context: CompletionContext): CompletionResult | null => {
    const beforeCursor = context.matchBefore(/\[\[^\]\n]*$/);
    if (!beforeCursor && !context.explicit) return null;

    const query = beforeCursor?.text.slice(2).trim() ?? "";
    const candidates = buildLinkCandidates(notes);
    const options = query
      ? fuse.search(query, { limit: 10 }).map((result) => result.item)
      : candidates;

    return {
      from: beforeCursor ? beforeCursor.from + 2 : context.pos,
      options,
    };
  };

export default function MarkdownEditor({
  value,
  onChange,
  notes,
}: MarkdownEditorProps) {
  const fuse = useMemo(() => {
    const candidates = buildLinkCandidates(notes);
    return new Fuse(candidates, {
      keys: ["label"],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [notes]);

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      placeholder("Start writing notes in markdown..."),
      autocompletion({ override: [wikiLinkCompletion(fuse, notes)] }),
      EditorView.theme({
        ".cm-scroller": {
          fontFamily: "var(--font-body)",
          fontSize: "16px",
          lineHeight: "1.6",
        },
        ".cm-content": {
          caretColor: "var(--fg)",
        },
        ".cm-cursor, .cm-dropCursor": {
          borderLeftColor: "var(--fg)",
        },
        ".cm-gutters": {
          background: "transparent",
          color: "var(--muted)",
          border: "none",
        },
        ".cm-activeLine": {
          backgroundColor:
            "color-mix(in srgb, var(--surface) 85%, var(--accent) 15%)",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "transparent",
        },
        ".cm-tooltip": {
          border: "1px solid var(--border)",
          backgroundColor: "var(--surface)",
          color: "var(--fg)",
        },
        ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
          backgroundColor: "var(--border)",
          color: "var(--fg)",
        },
      }),
    ],
    [notes],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      height="400px"
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: false,
      }}
      placeholder="Start writing notes in markdown..."
      extensions={extensions}
      style={{
        width: "100%",
        height: "400px",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        overflow: "hidden",
      }}
    />
  );
}
