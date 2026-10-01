import { visit } from "unist-util-visit";
import type { Root, Text, Parent } from "mdast";
import type { Plugin } from "unified";

const HIGHLIGHT_REGEX = /==([^=\n]+)==/g;
const TAG_REGEX = /(?<=\s|^)#([a-zA-Z0-9_\-\/]+)(?=$|[.,!?;:\s])/g;

export const remarkInline: Plugin<[], Root> = () => {
  return (tree: Root) => {
    // Pass 1: Highlights (==text==)
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== "number") return;
      if ((parent as any).type === "code" || (parent as any).type === "inlineCode") return;

      const value = node.value;
      if (!value.includes("==")) return;

      const newChildren: Array<any> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      HIGHLIGHT_REGEX.lastIndex = 0;

      while ((match = HIGHLIGHT_REGEX.exec(value)) !== null) {
        const start = match.index;
        if (start > lastIndex) {
          newChildren.push({ type: "text", value: value.slice(lastIndex, start) });
        }
        newChildren.push({
          type: "highlight",
          data: {
            hName: "mark",
            hProperties: { className: "markdown-highlight" },
          },
          children: [{ type: "text", value: match[1] }],
        });
        lastIndex = HIGHLIGHT_REGEX.lastIndex;
      }

      if (lastIndex === 0 && newChildren.length === 0) {
        return;
      }

      if (lastIndex < value.length) {
        newChildren.push({ type: "text", value: value.slice(lastIndex) });
      }

      if (newChildren.length > 0) {
        parent.children.splice(index, 1, ...newChildren);
        return index + newChildren.length;
      }
    });

    // Pass 2: Tag Pills (#tag)
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== "number") return;
      if ((parent as any).type === "code" || (parent as any).type === "inlineCode") return;

      const value = node.value;
      if (!value.includes("#")) return;

      const newChildren: Array<any> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      TAG_REGEX.lastIndex = 0;

      while ((match = TAG_REGEX.exec(value)) !== null) {
        const tag = match[1];
        const start = match.index;

        if (start > lastIndex) {
          newChildren.push({ type: "text", value: value.slice(lastIndex, start) });
        }

        newChildren.push({
          type: "tagPill",
          data: {
            tag,
            hName: "span",
            hProperties: {
              className: "markdown-tag-pill",
              "data-tag": tag,
            },
          },
          children: [{ type: "text", value: `#${tag}` }],
        });

        lastIndex = TAG_REGEX.lastIndex;
      }

      if (lastIndex === 0 && newChildren.length === 0) {
        return;
      }

      if (lastIndex < value.length) {
        newChildren.push({ type: "text", value: value.slice(lastIndex) });
      }

      if (newChildren.length > 0) {
        parent.children.splice(index, 1, ...newChildren);
        return index + newChildren.length;
      }
    });
  };
};
