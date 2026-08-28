import { describe, expect, it } from "vitest";
import { CampaignNote } from "../types";
import {
  extractLinkTargets,
  findBacklinks,
  noteFileStem,
  resolveLinkTarget,
} from "./links";

const makeNote = (
  id: string,
  title: string,
  content: string,
  frontmatter: Record<string, unknown> = {},
  path?: string,
): CampaignNote =>
  ({
    id,
    title,
    path: path ?? `${title}.md`,
    frontmatter,
    content,
  }) as CampaignNote;

describe("noteFileStem", () => {
  it("strips folder path and .md extension", () => {
    expect(noteFileStem("Characters/High Astromancer Valerius.md")).toBe(
      "High Astromancer Valerius",
    );
  });

  it("handles paths without extension", () => {
    expect(noteFileStem("Rules/Combat")).toBe("Combat");
  });
});

describe("extractLinkTargets", () => {
  it("extracts simple wiki links", () => {
    expect(extractLinkTargets("See [[Combat Rules]] for details")).toEqual([
      "combat rules",
    ]);
  });

  it("resolves the target (not the alias) from alias wiki links", () => {
    expect(extractLinkTargets("He is [[Valerius|the Astromancer]]")).toEqual([
      "valerius",
    ]);
  });

  it("extracts the leaf from folder-prefixed wiki links", () => {
    expect(extractLinkTargets("Located in [[Locations/Eldoria]]")).toEqual([
      "eldoria",
    ]);
  });

  it("extracts single-bracket links", () => {
    expect(extractLinkTargets("Refer to [Session Zero] notes")).toEqual([
      "session zero",
    ]);
  });

  it("ignores markdown hyperlinks", () => {
    expect(extractLinkTargets("[label](https://example.com)")).toEqual([]);
  });

  it("dedupes case and whitespace variants", () => {
    expect(
      extractLinkTargets("[[Eldoria]] [[eldoria  ]] [[  Eldoria ]]"),
    ).toEqual(["eldoria"]);
  });

  it("returns empty for content with no links", () => {
    expect(extractLinkTargets("Plain prose, nothing linked.")).toEqual([]);
  });
});

describe("resolveLinkTarget", () => {
  const notes = [
    makeNote("n1", "Eldoria", "content"),
    makeNote("n2", "Combat Rules", "content", {}, "Rules/Combat.md"),
    makeNote("n3", "Valerius", "content", { aliases: ["the Astromancer"] }),
  ];

  it("resolves exact title case-insensitively", () => {
    expect(resolveLinkTarget("eldoria", notes)?.id).toBe("n1");
  });

  it("resolves file stem when title differs", () => {
    expect(resolveLinkTarget("combat", notes)?.id).toBe("n2");
  });

  it("resolves frontmatter aliases", () => {
    expect(resolveLinkTarget("the astromancer", notes)?.id).toBe("n3");
  });

  it("resolves punctuation-tolerant matches", () => {
    expect(
      resolveLinkTarget(
        "high-astromancer valerius",
        [makeNote("n4", "High Astromancer Valerius", "")],
      )?.id,
    ).toBe("n4");
  });

  it("returns undefined for unknown targets", () => {
    expect(resolveLinkTarget("nonexistent", notes)).toBeUndefined();
  });
});

describe("findBacklinks", () => {
  const current = makeNote("target", "Eldoria", "home note");

  it("finds wiki, aliased wiki, single-bracket, and folder-path links", () => {
    const notes = [
      current,
      makeNote("a", "Journal A", "Travelled to [[Eldoria]] today."),
      makeNote("b", "Journal B", "The [[Eldoria|capital]] gleams."),
      makeNote("c", "Journal C", "See [Eldoria] shorthand."),
      makeNote("d", "Journal D", "[[Locations/Eldoria]] is the capital."),
      makeNote("e", "Journal E", "No links here at all."),
      makeNote("f", "Journal F", "A [markdown link](https://x.com) is inert."),
    ];
    expect(findBacklinks(current, notes).map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("excludes the note itself even when self-linking", () => {
    const selfRef = makeNote("target", "Eldoria", "I link [[Eldoria]] myself.");
    expect(findBacklinks(selfRef, [selfRef])).toEqual([]);
  });

  it("matches via the current note's frontmatter aliases", () => {
    const aliased = makeNote("t2", "Valerius", "body", {
      aliases: ["the Astromancer"],
    });
    const src = makeNote("src", "S", "He is [[the astromancer]] himself.");
    expect(findBacklinks(aliased, [aliased, src]).map((n) => n.id)).toEqual([
      "src",
    ]);
  });

  it("matches by file stem when title differs from filename", () => {
    const note = makeNote("t3", "Combat", "body", {}, "Rules/Combat.md");
    const src = makeNote("src2", "S2", "See [[Rules/Combat]] for moves.");
    expect(findBacklinks(note, [note, src]).map((n) => n.id)).toEqual(["src2"]);
  });
});