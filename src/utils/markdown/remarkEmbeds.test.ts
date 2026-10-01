import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { remarkEmbeds } from "./remarkEmbeds";

const process = async (md: string) => {
  const tree = unified().use(remarkParse).use(remarkEmbeds).parse(md);
  return await unified().use(remarkParse).use(remarkEmbeds).run(tree);
};

describe("remarkEmbeds", () => {
  it("transforms note embeds", async () => {
    const md = "Check this:\n\n![[Chapter 1]]";
    const tree = await process(md) as any;
    const p = tree.children[1];
    const embed = p.children[0];
    expect(embed.type).toBe("noteEmbed");
    expect(embed.data.target).toBe("Chapter 1");
  });

  it("transforms note embeds with section headers", async () => {
    const md = "![[Chapter 1#Tavern Scene]]";
    const tree = await process(md) as any;
    const embed = tree.children[0].children[0];
    expect(embed.type).toBe("noteEmbed");
    expect(embed.data.target).toBe("Chapter 1");
    expect(embed.data.heading).toBe("Tavern Scene");
  });

  it("transforms media embeds with dimensions", async () => {
    const md = "![[map.png|400x300]]";
    const tree = await process(md) as any;
    const embed = tree.children[0].children[0];
    expect(embed.type).toBe("mediaEmbed");
    expect(embed.data.target).toBe("map.png");
    expect(embed.data.width).toBe(400);
    expect(embed.data.height).toBe(300);
  });

  it("transforms media embeds with single width dimension", async () => {
    const md = "![[character.jpg|350]]";
    const tree = await process(md) as any;
    const embed = tree.children[0].children[0];
    expect(embed.type).toBe("mediaEmbed");
    expect(embed.data.target).toBe("character.jpg");
    expect(embed.data.width).toBe(350);
    expect(embed.data.height).toBeUndefined();
  });

  it("transforms audio media embeds", async () => {
    const md = "![[ambience.mp3]]";
    const tree = await process(md) as any;
    const embed = tree.children[0].children[0];
    expect(embed.type).toBe("mediaEmbed");
    expect(embed.data.target).toBe("ambience.mp3");
  });
});
