/**
 * Markdown heading outline utilities — READ-ONLY parsing of note content.
 *
 * `parseOutline` scans markdown text for ATX headings (`#`…`######`), skips
 * lines inside fenced code blocks, and builds a nested tree keyed by heading
 * level. It is a pure function consumed by {@link NoteOutline}.
 */

export interface OutlineNode {
  /** Heading level 1–6. */
  level: number;
  /** Heading text with markdown markers stripped (leading # and inline code ticks). */
  text: string;
  children: OutlineNode[];
}

const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/** Strips common inline markdown markers from a heading's raw text. */
const cleanHeadingText = (raw: string): string =>
  raw
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .trim();

/**
 * Parses markdown content into a nested heading tree.
 *
 * Nesting rule: a heading's children are the deeper headings that follow it
 * before another heading at the same or shallower level appears. Skipped
 * levels (h1 → h3) still nest under the shallower heading.
 */
export const parseOutline = (markdown: string): OutlineNode[] => {
  const roots: OutlineNode[] = [];

  // Stack of open nodes, indexed by heading level (1-6). A node is a child
  // of the deepest open node at a shallower level.
  const openByLevel = new Map<number, OutlineNode>();

  const lines = markdown.split("\n");
  let inFence = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = HEADING_RE.exec(trimmed);
    if (!match) continue;

    const level = match[1].length;
    const text = cleanHeadingText(match[2]);
    if (!text) continue;

    const node: OutlineNode = { level, text, children: [] };

    // Find the deepest open node at a level strictly shallower than `level`.
    let parent: OutlineNode | undefined;
    for (let l = level - 1; l >= 1; l--) {
      const candidate = openByLevel.get(l);
      if (candidate) {
        parent = candidate;
        break;
      }
    }

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    // This node becomes the deepest open node at its own level.
    openByLevel.set(level, node);
    // Any previously open nodes at deeper levels are now closed.
    for (let l = level + 1; l <= 6; l++) {
      openByLevel.delete(l);
    }
  }

  return roots;
};
