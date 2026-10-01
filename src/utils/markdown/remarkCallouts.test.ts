import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkCallouts } from "./remarkCallouts";

const process = async (md: string) => {
  const tree = unified().use(remarkParse).use(remarkCallouts).parse(md);
  const transformed = await unified().use(remarkParse).use(remarkCallouts).run(tree);
  return transformed;
};

describe("remarkCallouts", () => {
  it("transforms a basic note callout", async () => {
    const md = "> [!NOTE]\n> This is a note.";
    const tree = await process(md) as any;
    const callout = tree.children[0];
    expect(callout.type).toBe("callout");
    expect(callout.data.calloutType).toBe("note");
    expect(callout.data.isFoldable).toBe(false);
    expect(callout.data.title).toBe("Note");
  });

  it("transforms a collapsible callout with custom title", async () => {
    const md = "> [!TIP]- Hidden Secret\n> The secret entrance is behind the waterfall.";
    const tree = await process(md) as any;
    const callout = tree.children[0];
    expect(callout.type).toBe("callout");
    expect(callout.data.calloutType).toBe("tip");
    expect(callout.data.isFoldable).toBe(true);
    expect(callout.data.defaultFolded).toBe(true);
    expect(callout.data.title).toBe("Hidden Secret");
  });

  it("transforms an expanded collapsible callout with +", async () => {
    const md = "> [!WARNING]+ Visible Warning\n> Take heed.";
    const tree = await process(md) as any;
    const callout = tree.children[0];
    expect(callout.type).toBe("callout");
    expect(callout.data.calloutType).toBe("warning");
    expect(callout.data.isFoldable).toBe(true);
    expect(callout.data.defaultFolded).toBe(false);
    expect(callout.data.title).toBe("Visible Warning");
  });

  it("leaves standard blockquotes unchanged", async () => {
    const md = "> Just a normal quote.";
    const tree = await process(md) as any;
    expect(tree.children[0].type).toBe("blockquote");
  });

  it("preserves callout body children cleanly", async () => {
    const md = "> [!INFO] Important\n> First line.\n>\n> Second line.";
    const tree = await process(md) as any;
    const callout = tree.children[0];
    expect(callout.type).toBe("callout");
    expect(callout.children.length).toBeGreaterThan(0);
  });
});
