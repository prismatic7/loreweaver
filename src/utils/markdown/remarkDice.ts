import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * Regex matching standard RPG dice notations:
 * e.g. 1d20, 2d6+3, 1d100, 1d%, 4df, 3d8-1, 1d20+1d4.
 * Uses lookbehind/lookahead to match word bounds without capturing surrounding punctuation.
 */
export const DICE_NOTATION_REGEX =
  /(?:^|(?<=\s|[([{"']))(\d*d(?:\d+|%|f)(?:[+-]\d+(?:d(?:\d+|%|f))?)*)(?=$|[\s)\]}",.!?;:])/gi;

/**
 * Remark plugin to detect inline dice notation and transform into `diceRoll` mdast nodes.
 */
export function remarkDice() {
  return (tree: Root) => {
    visit(tree, "text", (node: any, index, parent: any) => {
      if (
        !parent ||
        index === undefined ||
        parent.type === "code" ||
        parent.type === "inlineCode" ||
        parent.type === "link"
      ) {
        return;
      }

      const text = node.value as string;
      if (!text || !text.includes("d")) return;

      DICE_NOTATION_REGEX.lastIndex = 0;
      if (!DICE_NOTATION_REGEX.test(text)) return;

      DICE_NOTATION_REGEX.lastIndex = 0;
      const children: any[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = DICE_NOTATION_REGEX.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        const diceFormula = match[1];

        if (matchStart > lastIndex) {
          children.push({
            type: "text",
            value: text.slice(lastIndex, matchStart),
          });
        }

        children.push({
          type: "diceRoll",
          data: {
            hName: "span",
            hProperties: {
              className: "inline-dice-roll",
              "data-dice": diceFormula,
            },
            hChildren: [{ type: "text", value: diceFormula }],
          },
          diceFormula,
        });

        lastIndex = matchEnd;
      }

      if (lastIndex < text.length) {
        children.push({
          type: "text",
          value: text.slice(lastIndex),
        });
      }

      parent.children.splice(index, 1, ...children);
      return index + children.length;
    });
  };
}
