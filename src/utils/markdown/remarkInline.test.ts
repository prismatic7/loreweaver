import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkInline } from "./remarkInline";

const process = async (md: string) => {
  const tree = unified().use(remarkParse).use(remarkInline).parse(md);
  return await unified().use(remarkParse).use(remarkInline).run(tree);
};

describe("remarkInline", () => {
  it("transforms ==highlights== into mark nodes", async () => {
    const md = "This is ==critical lore== to remember.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const mark = p.children[1];
    expect(mark.type).toBe("highlight");
    expect(mark.data.hName).toBe("mark");
    expect(mark.children[0].value).toBe("critical lore");
  });

  it("transforms #tags into tag nodes", async () => {
    const md = "Tagged with #faction/harpers and #npc.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const tag1 = p.children[1];
    expect(tag1.type).toBe("tagPill");
    expect(tag1.data.tag).toBe("faction/harpers");

    const tag2 = p.children[3];
    expect(tag2.type).toBe("tagPill");
    expect(tag2.data.tag).toBe("npc");
  });

  it("does not transform tags or highlights inside inline code", async () => {
    const md = "Code with `==not marked==` and `#not-a-tag`.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    expect(p.children[1].type).toBe("inlineCode");
    expect(p.children[1].value).toBe("==not marked==");
    expect(p.children[3].type).toBe("inlineCode");
    expect(p.children[3].value).toBe("#not-a-tag");
  });
});
