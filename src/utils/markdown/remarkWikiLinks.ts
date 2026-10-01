import { visit } from "unist-util-visit";
import type { Root, Text, Parent } from "mdast";
import type { Plugin } from "unified";

const WIKILINK_REGEX = /\[\[([^\]\n]+)\]\]/g;

export interface WikiLinkNode {
  type: "wikiLink";
  data: {
    target: string;
    alias: string;
    heading?: string;
    hName: string;
    hProperties: Record<string, string>;
  };
  children: Array<{ type: "text"; value: string }>;
}

export const remarkWikiLinks: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== "number") return;
      if ((parent as any).type === "code" || (parent as any).type === "inlineCode") return;

      const value = node.value;
      if (!value.includes("[[")) return;

      const newChildren: Array<any> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      WIKILINK_REGEX.lastIndex = 0;

      while ((match = WIKILINK_REGEX.exec(value)) !== null) {
        const start = match.index;

        // If preceded by '!', it's an embed (![[...]]), not a regular wikilink
        if (start > 0 && value[start - 1] === "!") {
          continue;
        }

        if (start > lastIndex) {
          newChildren.push({
            type: "text",
            value: value.slice(lastIndex, start),
          });
        }

        const rawContent = match[1].trim();
        const [targetAndHeading, aliasPart] = rawContent.split("|");
        const [targetPart, headingPart] = targetAndHeading.split("#");

        const target = targetPart?.trim() ?? "";
        const heading = headingPart?.trim();
        const alias = aliasPart?.trim() || (heading && !target ? `#${heading}` : target || rawContent);

        newChildren.push({
          type: "wikiLink",
          data: {
            target,
            alias,
            ...(heading ? { heading } : {}),
            hName: "a",
            hProperties: {
              className: "markdown-wikilink",
              "data-target": target,
              "data-alias": alias,
              ...(heading ? { "data-heading": heading } : {}),
            },
          },
          children: [{ type: "text", value: alias }],
        });

        lastIndex = WIKILINK_REGEX.lastIndex;
      }

      if (lastIndex === 0 && newChildren.length === 0) {
        return;
      }

      if (lastIndex < value.length) {
        newChildren.push({
          type: "text",
          value: value.slice(lastIndex),
        });
      }

      if (newChildren.length > 0) {
        parent.children.splice(index, 1, ...newChildren);
        return index + newChildren.length;
      }
    });
  };
};
