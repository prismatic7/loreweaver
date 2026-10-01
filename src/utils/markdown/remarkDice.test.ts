import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkDice } from "./remarkDice";

const parseWithDice = (md: string) => {
  const processor = unified().use(remarkParse).use(remarkDice);
  return processor.runSync(processor.parse(md));
};

describe("remarkDice Plugin", () => {
  it("detects standard dice notation like 1d20+5", () => {
    const tree: any = parseWithDice("Roll 1d20+5 to hit the goblin.");
    const p = tree.children[0];
    const diceNode = p.children.find((c: any) => c.type === "diceRoll");

    expect(diceNode).toBeDefined();
    expect(diceNode.diceFormula).toBe("1d20+5");
    expect(diceNode.data.hProperties["data-dice"]).toBe("1d20+5");
  });

  it("detects multi-die rolls like 2d6 and 4df", () => {
    const tree: any = parseWithDice("Deals 2d6 damage and Fate roll 4df.");
    const p = tree.children[0];
    const diceNodes = p.children.filter((c: any) => c.type === "diceRoll");

    expect(diceNodes.length).toBe(2);
    expect(diceNodes[0].diceFormula).toBe("2d6");
    expect(diceNodes[1].diceFormula).toBe("4df");
  });

  it("does not match inside inline code or fenced code blocks", () => {
    const tree: any = parseWithDice("Use `1d20+5` in function\n```\n2d6\n```");
    const diceNodes = tree.children.flatMap((c: any) =>
      c.children ? c.children.filter((child: any) => child.type === "diceRoll") : []
    );

    expect(diceNodes.length).toBe(0);
  });
});
