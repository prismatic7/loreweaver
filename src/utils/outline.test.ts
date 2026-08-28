import { describe, it, expect } from "vitest";
import { parseOutline } from "./outline";

describe("parseOutline", () => {
  it("builds a nested tree from h2/h3 headings", () => {
    const md = [
      "## The City",
      "intro text",
      "### Districts",
      "more text",
      "### Underdark",
      "## The Guilds",
    ].join("\n");

    const tree = parseOutline(md);
    expect(tree).toHaveLength(2);
    expect(tree[0].text).toBe("The City");
    expect(tree[0].level).toBe(2);
    expect(tree[0].children.map((n) => n.text)).toEqual(["Districts", "Underdark"]);
    expect(tree[0].children[0].level).toBe(3);
    expect(tree[1].text).toBe("The Guilds");
    expect(tree[1].children).toEqual([]);
  });

  it("nests a skipped level (h1 then h3) under the shallower heading", () => {
    const md = ["# Campaign", "### Act 3"].join("\n");
    const tree = parseOutline(md);
    expect(tree).toHaveLength(1);
    expect(tree[0].text).toBe("Campaign");
    expect(tree[0].children.map((n) => n.text)).toEqual(["Act 3"]);
  });

  it("closes a branch when a same-level heading appears", () => {
    const md = ["## A", "### A1", "## B", "### B1"].join("\n");
    const tree = parseOutline(md);
    expect(tree.map((n) => n.text)).toEqual(["A", "B"]);
    expect(tree[0].children.map((n) => n.text)).toEqual(["A1"]);
    expect(tree[1].children.map((n) => n.text)).toEqual(["B1"]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const md = [
      "## Real heading",
      "```",
      "# Not a heading",
      "## Still code",
      "```",
      "## Real heading 2",
    ].join("\n");
    const tree = parseOutline(md);
    expect(tree.map((n) => n.text)).toEqual(["Real heading", "Real heading 2"]);
  });

  it("ignores inline code fences inside a paragraph", () => {
    const md = "text with ```` ``` ```` markers\n## After".replace("````", "```");
    // The replaced text is: `text with ``` ``` ``` markers` — a fence opens
    // and closes on the same line, so the following heading is still real.
    const tree = parseOutline(md);
    expect(tree.map((n) => n.text)).toEqual(["After"]);
  });

  it("returns [] for content with no headings", () => {
    expect(parseOutline("plain text\nmore text")).toEqual([]);
    expect(parseOutline("")).toEqual([]);
  });

  it("strips inline markers from heading text", () => {
    const tree = parseOutline("## `The` **Shadow** *Market*");
    expect(tree[0].text).toBe("The Shadow Market");
  });
});
