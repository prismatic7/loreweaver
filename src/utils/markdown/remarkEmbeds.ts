import { visit } from "unist-util-visit";
import type { Root, Text, Parent } from "mdast";
import type { Plugin } from "unified";

const EMBED_REGEX = /!\[\[([^\]\n]+)\]\]/g;
const MEDIA_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp",
  "mp3", "ogg", "wav", "m4a",
  "mp4", "webm", "ogv", "mov",
  "pdf",
]);

export interface NoteEmbedNode {
  type: "noteEmbed";
  data: {
    target: string;
    heading?: string;
    hName: string;
    hProperties: Record<string, string>;
  };
}

export interface MediaEmbedNode {
  type: "mediaEmbed";
  data: {
    target: string;
    width?: number;
    height?: number;
    hName: string;
    hProperties: Record<string, string>;
  };
}

export const remarkEmbeds: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || typeof index !== "number") return;
      if ((parent as any).type === "code" || (parent as any).type === "inlineCode") return;

      const value = node.value;
      if (!value.includes("![[")) return;

      const newChildren: Array<any> = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      EMBED_REGEX.lastIndex = 0;

      while ((match = EMBED_REGEX.exec(value)) !== null) {
        const start = match.index;
        if (start > lastIndex) {
          newChildren.push({
            type: "text",
            value: value.slice(lastIndex, start),
          });
        }

        const rawContent = match[1].trim();
        const [targetAndHeading, dimensionPart] = rawContent.split("|");
        const [targetPart, headingPart] = targetAndHeading.split("#");

        const target = targetPart?.trim() || "";
        const heading = headingPart?.trim();
        const ext = target.split(".").pop()?.toLowerCase() || "";
        const isMedia = MEDIA_EXTS.has(ext);

        let width: number | undefined;
        let height: number | undefined;
        if (dimensionPart) {
          const dims = dimensionPart.trim().split("x");
          if (dims.length === 2) {
            width = parseInt(dims[0], 10) || undefined;
            height = parseInt(dims[1], 10) || undefined;
          } else if (dims.length === 1) {
            width = parseInt(dims[0], 10) || undefined;
          }
        }

        if (isMedia) {
          newChildren.push({
            type: "mediaEmbed",
            data: {
              target,
              ...(width ? { width } : {}),
              ...(height ? { height } : {}),
              hName: "span",
              hProperties: {
                className: "markdown-media-embed",
                "data-media-target": target,
                ...(width ? { "data-width": String(width) } : {}),
                ...(height ? { "data-height": String(height) } : {}),
              },
            },
          });
        } else {
          newChildren.push({
            type: "noteEmbed",
            data: {
              target,
              ...(heading ? { heading } : {}),
              hName: "div",
              hProperties: {
                className: "markdown-note-embed",
                "data-note-target": target,
                ...(heading ? { "data-heading": heading } : {}),
              },
            },
          });
        }

        lastIndex = EMBED_REGEX.lastIndex;
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
