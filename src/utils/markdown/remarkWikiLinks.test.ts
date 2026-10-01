import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkWikiLinks } from "./remarkWikiLinks";

const process = async (md: string) => {
  const tree = unified().use(remarkParse).use(remarkWikiLinks).parse(md);
  return await unified().use(remarkParse).use(remarkWikiLinks).run(tree);
};

describe("remarkWikiLinks", () => {
  it("transforms standard wikilinks", async () => {
    const md = "Visit [[Waterdeep]] today.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const link = p.children[1];
    expect(link.type).toBe("wikiLink");
    expect(link.data.target).toBe("Waterdeep");
    expect(link.data.alias).toBe("Waterdeep");
  });

  it("transforms aliased wikilinks and heading anchors", async () => {
    const md = "See [[Waterdeep#Taverns|The Yawning Portal]].";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const link = p.children[1];
    expect(link.type).toBe("wikiLink");
    expect(link.data.target).toBe("Waterdeep");
    expect(link.data.heading).toBe("Taverns");
    expect(link.data.alias).toBe("The Yawning Portal");
  });

  it("transforms intra-note heading anchors [[#History]]", async () => {
    const md = "Read [[#History]].";
    const tree = await process(md) as any;
    const p = tree.children[0];
    const link = p.children[1];
    expect(link.type).toBe("wikiLink");
    expect(link.data.target).toBe("");
    expect(link.data.heading).toBe("History");
    expect(link.data.alias).toBe("#History");
  });

  it("does not transform wikilinks inside inline code", async () => {
    const md = "Code with `[[Waterdeep]]` is literal.";
    const tree = await process(md) as any;
    const p = tree.children[0];
    expect(p.children[1].type).toBe("inlineCode");
    expect(p.children[1].value).toBe("[[Waterdeep]]");
  });

  it("does not transform embeds ![[Waterdeep]] as normal wikilinks", async () => {
    const md = "Here is ![[Waterdeep]].";
    const tree = await process(md) as any;
    const p = tree.children[0];
    // Since ![[ is embed syntax, remarkWikiLinks should not match ![[ as a plain wikiLink
    // If it only matches [[ without a preceding !, the text before remains "Here is !" or similar
    const wikiLinks = p.children.filter((c: any) => c.type === "wikiLink");
    expect(wikiLinks.length).toBe(0);
  });
});
