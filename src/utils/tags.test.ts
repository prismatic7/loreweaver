import { describe, it, expect } from "vitest";
import { parseNoteTags, buildTagTree, TagNode } from "./tags";
import { CampaignNote } from "../types";

const makeNote = (
  id: string,
  tags: unknown,
  overrides: Partial<CampaignNote> = {},
): CampaignNote => ({
  id,
  title: `Note ${id}`,
  path: `Worldbuilding/${id}.md`,
  content: `# ${id}\n\nbody`,
  frontmatter: { tags },
  ...overrides,
});

describe("parseNoteTags", () => {
  it("parses an array of tags", () => {
    const note = makeNote("n1", ["campaign/arc1/act3", "npc"]);
    expect(parseNoteTags(note)).toEqual(["campaign/arc1/act3", "npc"]);
  });

  it("parses a comma-separated string", () => {
    const note = makeNote("n1", "campaign/arc1/act3, npc");
    expect(parseNoteTags(note)).toEqual(["campaign/arc1/act3", "npc"]);
  });

  it("parses a semicolon-separated string", () => {
    const note = makeNote("n1", "campaign/arc1;npc");
    expect(parseNoteTags(note)).toEqual(["campaign/arc1", "npc"]);
  });

  it("strips a leading # and trims whitespace", () => {
    const note = makeNote("n1", ["#campaign/arc1", " #npc "]);
    expect(parseNoteTags(note)).toEqual(["campaign/arc1", "npc"]);
  });

  it("drops empty candidates and dedupes", () => {
    const note = makeNote("n1", ["", "campaign", " campaign ", "campaign"]);
    expect(parseNoteTags(note)).toEqual(["campaign"]);
  });

  it("returns [] when frontmatter has no tags", () => {
    const note = makeNote("n1", undefined, { frontmatter: { type: "Location" } });
    expect(parseNoteTags(note)).toEqual([]);
  });

  it("returns [] for a null tags value", () => {
    const note = makeNote("n1", null);
    expect(parseNoteTags(note)).toEqual([]);
  });
});

describe("buildTagTree", () => {
  it("nests campaign/arc1/act3 three levels deep", () => {
    const notes = [makeNote("n1", ["campaign/arc1/act3"])];
    const tree = buildTagTree(notes);

    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("campaign");
    expect(tree[0].noteIds).toEqual([]);

    const arc1 = tree[0].children[0];
    expect(arc1.name).toBe("arc1");
    expect(arc1.path).toBe("campaign/arc1");
    expect(arc1.noteIds).toEqual([]);

    const act3 = arc1.children[0];
    expect(act3.name).toBe("act3");
    expect(act3.path).toBe("campaign/arc1/act3");
    expect(act3.noteIds).toEqual(["n1"]);
  });

  it("attaches note ids at the exact tag path only", () => {
    const notes = [
      makeNote("n1", ["campaign/arc1"]),
      makeNote("n2", ["campaign/arc1/act3"]),
    ];
    const tree = buildTagTree(notes);
    const arc1 = tree[0].children[0];
    const act3 = arc1.children[0];

    expect(arc1.noteIds).toEqual(["n1"]);
    expect(act3.noteIds).toEqual(["n2"]);
  });

  it("merges notes sharing a tag into the same node", () => {
    const notes = [makeNote("n1", ["npc"]), makeNote("n2", ["npc"])];
    const tree = buildTagTree(notes);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("npc");
    expect(tree[0].noteIds).toEqual(["n1", "n2"]);
  });

  it("dedupes segments across notes", () => {
    const notes = [makeNote("n1", ["campaign/arc1"]), makeNote("n2", ["campaign/arc1/act3"])];
    const tree = buildTagTree(notes);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("arc1");
    expect(tree[0].children[0].children).toHaveLength(1);
  });

  it("returns [] when no notes have tags", () => {
    const notes = [makeNote("n1", undefined, { frontmatter: {} })];
    expect(buildTagTree(notes)).toEqual([]);
  });

  it("splits a string-typed tags value", () => {
    const note = makeNote("n1", "campaign/arc1, npc");
    const tree = buildTagTree([note]);
    expect(tree.map((n: TagNode) => n.name)).toEqual(["campaign", "npc"]);
  });
});
