import { visit } from "unist-util-visit";
import type { Root, Blockquote } from "mdast";
import type { Plugin } from "unified";

const CALLOUT_REGEX = /^\[!([a-zA-Z0-9_-]+)\]([+-])?(?:\s+(.*))?$/;

export interface CalloutNode extends Omit<Blockquote, "type"> {
  type: "callout" | string;
  data: {
    calloutType: string;
    isFoldable: boolean;
    defaultFolded: boolean;
    title: string;
    hName?: string;
    hProperties?: Record<string, unknown>;
  };
}

export const remarkCallouts: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote, index, parent) => {
      if (!node.children || node.children.length === 0) return;
      const firstChild = node.children[0];
      if (firstChild.type !== "paragraph" || !firstChild.children || firstChild.children.length === 0) {
        return;
      }

      const firstInline = firstChild.children[0];
      if (firstInline.type !== "text") return;

      const lines = firstInline.value.split("\n");
      const firstLine = lines[0].trim();
      const match = CALLOUT_REGEX.exec(firstLine);
      if (!match) return;

      const rawType = match[1].toLowerCase();
      const foldModifier = match[2];
      const customTitle = match[3]?.trim();

      const isFoldable = foldModifier === "+" || foldModifier === "-";
      const defaultFolded = foldModifier === "-";
      const title = customTitle || (rawType.charAt(0).toUpperCase() + rawType.slice(1));

      // Remove the header line from the first paragraph
      if (lines.length > 1) {
        firstInline.value = lines.slice(1).join("\n").replace(/^\s+/, "");
      } else {
        firstChild.children.shift();
        if (firstChild.children.length === 0) {
          node.children.shift();
        }
      }

      const calloutNode: CalloutNode = {
        ...node,
        type: "callout" as any,
        data: {
          calloutType: rawType,
          isFoldable,
          defaultFolded,
          title,
          hName: "div",
          hProperties: {
            className: `callout-block callout-${rawType}`,
            "data-callout": rawType,
            "data-foldable": isFoldable ? "true" : "false",
            "data-folded": defaultFolded ? "true" : "false",
            "data-title": title,
          },
        },
      };

      if (parent && typeof index === "number") {
        parent.children[index] = calloutNode as any;
      }
    });
  };
};
