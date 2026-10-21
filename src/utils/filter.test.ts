import { describe, it, expect } from "vitest";
import { parseFilter, matchesFilter, filterNotes, type FilterNote } from "./filter";

const npc: FilterNote = {
  title: "Vex",
  path: "Characters/Vex.md",
  content: "A captain with a grudge.",
  frontmatter: { type: "npc", faction: "Harbour Watch", tags: ["act1", "rival"] },
};

const factionlessNpc: FilterNote = {
  title: "Kade",
  path: "Characters/Kade.md",
  content: "Nobody knows who pays him.",
  frontmatter: { type: "npc" },
};

const faction: FilterNote = {
  title: "Harbour Watch",
  path: "Factions/Watch.md",
  content: "They run the docks.",
  frontmatter: { type: "faction", tags: "act1, power" },
};

const NOTES = [npc, factionlessNpc, faction];

describe("parseFilter", () => {
  it("parses field:value, negation and existence terms", () => {
    expect(parseFilter("type:npc !faction")).toEqual([
      { negated: false, field: "type", value: "npc" },
      { negated: true, field: "faction", value: null },
    ]);
  });

  it("ignores AND/OR noise words", () => {
    expect(parseFilter("type:npc AND !faction")).toHaveLength(2);
  });

  it("keeps quoted values together", () => {
    expect(parseFilter('faction:"Harbour Watch"')).toEqual([
      { negated: false, field: "faction", value: "Harbour Watch" },
    ]);
  });

  it("treats a negated bare term as an existence test", () => {
    expect(parseFilter("!status")).toEqual([
      { negated: true, field: "status", value: null },
    ]);
  });

  it("returns nothing for an empty query", () => {
    expect(parseFilter("   ")).toEqual([]);
  });
});

describe("matchesFilter", () => {
  it("matches everything for an empty query", () => {
    expect(filterNotes(NOTES, "")).toHaveLength(3);
  });

  it("filters by frontmatter equality-ish match", () => {
    expect(filterNotes(NOTES, "type:npc")).toEqual([npc, factionlessNpc]);
  });

  it("negates existence (the plan's `type:npc !faction` example)", () => {
    expect(filterNotes(NOTES, "type:npc AND !faction")).toEqual([factionlessNpc]);
  });

  it("matches any tag in the array form and the comma-string form", () => {
    expect(filterNotes(NOTES, "tag:act1")).toEqual([npc, faction]);
    expect(filterNotes(NOTES, "tag:power")).toEqual([faction]);
  });

  it("matches path and title substrings", () => {
    expect(filterNotes(NOTES, "path:Characters/")).toEqual([npc, factionlessNpc]);
    expect(filterNotes(NOTES, "title:vex")).toEqual([npc]);
  });

  it("matches bare terms against title or content", () => {
    expect(filterNotes(NOTES, "docks")).toEqual([faction]);
    expect(filterNotes(NOTES, "kade")).toEqual([factionlessNpc]);
  });

  it("negates a value match", () => {
    expect(filterNotes(NOTES, "!type:faction")).toEqual([npc, factionlessNpc]);
  });

  it("treats a term on a missing key as no match, not an error", () => {
    expect(matchesFilter(npc, "status:dead")).toBe(false);
    expect(matchesFilter(npc, "!status")).toBe(true);
    expect(matchesFilter({ title: "t", path: "t.md" }, "type:npc")).toBe(false);
  });

  it("is case-insensitive on both sides", () => {
    expect(matchesFilter(npc, "TYPE:NPC")).toBe(true);
    expect(matchesFilter(npc, "faction:harbour")).toBe(true);
  });

  it("treats an empty array as absent for existence tests", () => {
    const emptyTags: FilterNote = { title: "t", path: "t.md", frontmatter: { tags: [] } };
    expect(matchesFilter(emptyTags, "!tags")).toBe(true);
  });
});
