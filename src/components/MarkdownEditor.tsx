import { autocompletion } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView, placeholder } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import Fuse from "fuse.js";
import { useMemo } from "react";
import {
  buildLinkCandidates,
  wikiLinkCompletion,
  type EditorNote,
  type LinkCandidate,
} from "../utils/editor/wikiLinkCompletion";

export type { EditorNote, LinkCandidate };

export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  notes: EditorNote[];
  activeNotePath?: string;
  height?: string;
};

export default function MarkdownEditor({
  value,
  onChange,
  notes,
  height = "400px",
}: MarkdownEditorProps) {
  const candidates = useMemo(() => buildLinkCandidates(notes), [notes]);
  const fuse = useMemo(() => {
    return new Fuse(candidates, {
      keys: ["label", "detail"],
      threshold: 0.4,
      ignoreLocation: true,
    });
  }, [candidates]);

  const extensions = useMemo(
    () => [
      markdown(),
      EditorView.lineWrapping,
      placeholder("Start writing notes in markdown..."),
      autocompletion({
        override: [wikiLinkCompletion(fuse, candidates, notes)],
      }),
      EditorView.theme({
        "&": {
          backgroundColor: "var(--surface)",
          color: "var(--fg)",
        },
        ".cm-scroller": {
          fontFamily: "var(--font-body)",
          fontSize: "16px",
          lineHeight: "1.6",
        },
        ".cm-content": {
          caretColor: "var(--fg)",
          color: "var(--fg)",
        },
        ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
          backgroundColor:
            "color-mix(in srgb, var(--accent) 28%, transparent)",
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
        ".cm-placeholder": {
          color: "var(--muted)",
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
    [notes, fuse, candidates],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      height={height}
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
        height,
        border: "1px solid var(--border)",
        borderRadius: 0,
        overflow: "hidden",
      }}
    />
  );
}
