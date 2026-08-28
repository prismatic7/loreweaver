import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TagTree } from "./TagTree";
import { CampaignNote } from "../types";

const makeNote = (id: string, tags: unknown): CampaignNote => ({
  id,
  title: `Note ${id}`,
  path: `Worldbuilding/${id}.md`,
  content: `# ${id}`,
  frontmatter: { tags },
});

describe("TagTree", () => {
  it("renders nested tags with note leaves", () => {
    const notes = [makeNote("n1", ["campaign/arc1/act3"])];
    render(<TagTree notes={notes} setSelectedNoteId={vi.fn()} />);

    expect(screen.getByText("campaign")).toBeInTheDocument();
    expect(screen.getByText("arc1")).toBeInTheDocument();
    expect(screen.getByText("act3")).toBeInTheDocument();
    expect(screen.getByText("Note n1")).toBeInTheDocument();
  });

  it("calls setSelectedNoteId when a note leaf is clicked", () => {
    const setSelectedNoteId = vi.fn();
    const notes = [makeNote("n1", ["npc"])];
    render(<TagTree notes={notes} setSelectedNoteId={setSelectedNoteId} />);

    fireEvent.click(screen.getByText("Note n1"));
    expect(setSelectedNoteId).toHaveBeenCalledWith("n1");
  });

  it("expands and collapses a branch", () => {
    const notes = [makeNote("n1", ["campaign/arc1"])];
    render(<TagTree notes={notes} setSelectedNoteId={vi.fn()} />);

    // Initially expanded: the child node and its note are visible.
    expect(screen.getByText("arc1")).toBeInTheDocument();
    expect(screen.getByText("Note n1")).toBeInTheDocument();

    // Collapse the "campaign" branch.
    fireEvent.click(screen.getByText("campaign"));
    expect(screen.queryByText("arc1")).not.toBeInTheDocument();
    expect(screen.queryByText("Note n1")).not.toBeInTheDocument();

    // Expand again.
    fireEvent.click(screen.getByText("campaign"));
    expect(screen.getByText("arc1")).toBeInTheDocument();
  });

  it("renders the empty state when no notes have tags", () => {
    const notes = [makeNote("n1", undefined)];
    render(<TagTree notes={notes} setSelectedNoteId={vi.fn()} />);
    expect(screen.getByText("No tags in this vault.")).toBeInTheDocument();
  });
});
