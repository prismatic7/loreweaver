import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import MarkdownEditor from "./MarkdownEditor";

vi.mock("@uiw/react-codemirror", () => {
  return {
    default: ({ value, onChange }: any) => {
      return (
        <textarea
          data-testid="mock-codemirror"
          value={value}
          onChange={(e) => {
            if (onChange) {
              onChange(e.target.value);
            }
          }}
        />
      );
    },
  };
});

describe("MarkdownEditor Component", () => {
  it("renders with initial value and triggers onChange", () => {
    const handleChange = vi.fn();
    render(
      <MarkdownEditor
        value="Initial content"
        onChange={handleChange}
        notes={[]}
      />,
    );

    const textarea = screen.getByTestId("mock-codemirror");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("Initial content");

    fireEvent.change(textarea, { target: { value: "New edited content" } });
    expect(handleChange).toHaveBeenCalledWith("New edited content");
  });
});

describe("WikiLink Autocompletion logic", () => {
  const sampleNotes = [
    {
      title: "Ancient Dragon",
      content: "# Ancient Dragon\n\n## Breath Weapon\nDeals 18d6 fire damage.\n\n## Legendary Actions\nWing Attack.",
      frontmatter: {
        aliases: ["Red Wyrm", "Flame Tyrant"],
      },
    },
    {
      title: "Castle Ravenloft",
      content: "# Castle Ravenloft\n\n## Throne Room\nGrand hall.\n\n## Dungeon\nDark and wet.",
      frontmatter: {
        alias: "Barovia Castle",
      },
    },
  ];

  it("buildLinkCandidates extracts both note titles and aliases", async () => {
    const { buildLinkCandidates } = await import(
      "../utils/editor/wikiLinkCompletion"
    );
    const candidates = buildLinkCandidates(sampleNotes);

    expect(candidates).toEqual(
      expect.arrayContaining([
        {
          label: "Ancient Dragon",
          detail: "Note",
          type: "text",
          target: "Ancient Dragon",
          applyText: "Ancient Dragon]]",
        },
        {
          label: "Red Wyrm",
          detail: "Alias of Ancient Dragon",
          type: "text",
          target: "Ancient Dragon",
          applyText: "Ancient Dragon|Red Wyrm]]",
        },
        {
          label: "Flame Tyrant",
          detail: "Alias of Ancient Dragon",
          type: "text",
          target: "Ancient Dragon",
          applyText: "Ancient Dragon|Flame Tyrant]]",
        },
        {
          label: "Castle Ravenloft",
          detail: "Note",
          type: "text",
          target: "Castle Ravenloft",
          applyText: "Castle Ravenloft]]",
        },
        {
          label: "Barovia Castle",
          detail: "Alias of Castle Ravenloft",
          type: "text",
          target: "Castle Ravenloft",
          applyText: "Castle Ravenloft|Barovia Castle]]",
        },
      ])
    );
  });

  it("wikiLinkCompletion returns candidates when [[ is typed", async () => {
    const { buildLinkCandidates, wikiLinkCompletion } = await import(
      "../utils/editor/wikiLinkCompletion"
    );
    const candidates = buildLinkCandidates(sampleNotes);
    const Fuse = (await import("fuse.js")).default;
    const fuse = new Fuse(candidates, { keys: ["label", "detail"], threshold: 0.4 });

    const completion = wikiLinkCompletion(fuse, candidates, sampleNotes);

    // Mock CompletionContext
    const mockContext = {
      pos: 10,
      explicit: false,
      matchBefore: (regex: RegExp) => {
        const text = "See also [[";
        if (regex.test(text)) {
          return { from: 9, to: 11, text: "[[" };
        }
        return null;
      },
      state: {
        sliceDoc: (_from: number, _to: number) => "",
      },
    } as any;

    const result = completion(mockContext);
    expect(result).not.toBeNull();
    expect(result?.from).toBe(11);
    expect(result?.to).toBe(10);
    expect(result?.options.length).toBeGreaterThan(0);
    expect(result?.options.some((opt) => opt.label === "Ancient Dragon")).toBe(true);
  });

  it("wikiLinkCompletion adjusts `to` boundary when closing brackets ]] exist", async () => {
    const { buildLinkCandidates, wikiLinkCompletion } = await import(
      "../utils/editor/wikiLinkCompletion"
    );
    const candidates = buildLinkCandidates(sampleNotes);
    const Fuse = (await import("fuse.js")).default;
    const fuse = new Fuse(candidates, { keys: ["label", "detail"], threshold: 0.4 });

    const completion = wikiLinkCompletion(fuse, candidates, sampleNotes);

    const mockContext = {
      pos: 11,
      explicit: false,
      matchBefore: () => ({ from: 9, to: 11, text: "[[" }),
      state: {
        sliceDoc: (from: number, to: number) => {
          if (from === 11 && to === 13) return "]]";
          return "";
        },
      },
    } as any;

    const result = completion(mockContext);
    expect(result).not.toBeNull();
    expect(result?.to).toBe(13); // includes ]] so it replaces them cleanly
  });

  it("wikiLinkCompletion suggests headings when # is typed", async () => {
    const { buildLinkCandidates, wikiLinkCompletion } = await import(
      "../utils/editor/wikiLinkCompletion"
    );
    const candidates = buildLinkCandidates(sampleNotes);
    const Fuse = (await import("fuse.js")).default;
    const fuse = new Fuse(candidates, { keys: ["label", "detail"], threshold: 0.4 });

    const completion = wikiLinkCompletion(fuse, candidates, sampleNotes);

    const mockContext = {
      pos: 26,
      explicit: false,
      matchBefore: () => ({ from: 9, to: 26, text: "[[Ancient Dragon#" }),
      state: {
        sliceDoc: () => "",
      },
    } as any;

    const result = completion(mockContext);
    expect(result).not.toBeNull();
    expect(result?.options.some((opt) => opt.label === "#Breath Weapon")).toBe(true);
    expect(result?.options.some((opt) => opt.label === "#Legendary Actions")).toBe(true);
    expect(result?.options[0].apply).toContain("Ancient Dragon#");
  });
});
