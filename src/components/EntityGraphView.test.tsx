import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EntityGraphView } from "./EntityGraphView";
import { CampaignNote, SourceEntry } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

function makeNote(overrides: Partial<CampaignNote> = {}): CampaignNote {
  return {
    id: "n1",
    title: "Titus Crow",
    path: "People/Titus Crow.md",
    frontmatter: { type: "npc" },
    content: "",
    ...overrides,
  };
}

function makeSource(overrides: Partial<SourceEntry> = {}): SourceEntry {
  return {
    id: "s1",
    title: "The Call of Cthulhu",
    author: "H.P. Lovecraft",
    source_type: "canon",
    url: "https://example.com/call",
    date: "1928",
    ...overrides,
  };
}

describe("EntityGraphView", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue([]);
  });

  it("renders the empty state when no entity notes exist", () => {
    render(<EntityGraphView notes={[]} onOpenNote={vi.fn()} />);
    expect(screen.getByText("Entity Graph")).toBeTruthy();
    expect(
      screen.getByText(/No entities found/),
    ).toBeTruthy();
  });

  it("renders entity nodes from notes with a type frontmatter", () => {
    const notes = [
      makeNote({ id: "n1", title: "Titus Crow", frontmatter: { type: "npc" } }),
      makeNote({
        id: "n2",
        title: "Neft Daşları",
        frontmatter: { type: "location" },
      }),
    ];
    render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    expect(screen.getByText("Entity & Relationship Graph")).toBeTruthy();
    // Node count badge: 2 nodes · 0 relationships
    expect(screen.getByText(/2 nodes/)).toBeTruthy();
  });

  it("filters notes by provenance when a filter button is clicked", () => {
    const notes = [
      makeNote({
        id: "n1",
        title: "Canon NPC",
        frontmatter: { type: "npc", source_type: "canon" },
      }),
      makeNote({
        id: "n2",
        title: "History NPC",
        frontmatter: { type: "npc", source_type: "history" },
      }),
      makeNote({
        id: "n3",
        title: "Invention NPC",
        frontmatter: { type: "npc", source_type: "invention" },
      }),
    ];
    render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    expect(screen.getByText(/3 nodes/)).toBeTruthy();

    fireEvent.click(screen.getByText("Canon"));
    expect(screen.getByText(/1 node/)).toBeTruthy();

    fireEvent.click(screen.getByText("History"));
    expect(screen.getByText(/1 node/)).toBeTruthy();

    fireEvent.click(screen.getByText("All"));
    expect(screen.getByText(/3 nodes/)).toBeTruthy();
  });

  it("shows source nodes when notes reference a listed source", async () => {
    const source = makeSource();
    mockInvoke.mockResolvedValue([source]);
    const notes = [
      makeNote({
        id: "n1",
        title: "Canon NPC",
        frontmatter: { type: "npc", source_type: "canon", source_id: "s1" },
      }),
    ];
    render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    // Source node label appears once sources load
    expect(await screen.findByText("The Call of Cthulhu")).toBeTruthy();
    // 1 entity + 1 source = 2 nodes
    expect(screen.getByText(/2 nodes/)).toBeTruthy();
  });

  it("does not show source nodes for notes without a matching source", () => {
    const notes = [
      makeNote({
        id: "n1",
        title: "Orphan NPC",
        frontmatter: { type: "npc", source_type: "invention" },
      }),
    ];
    render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    expect(screen.getByText(/1 node/)).toBeTruthy();
    expect(screen.queryByText("The Call of Cthulhu")).toBeNull();
  });
});
