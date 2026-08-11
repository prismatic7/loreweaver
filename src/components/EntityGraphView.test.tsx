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

  it("shows filter-empty state (not entity guidance) when provenance filter matches zero notes", () => {
    const notes = [
      makeNote({ id: "n1", title: "Titus Crow", frontmatter: { type: "npc" } }),
      makeNote({
        id: "n2",
        title: "Neft Daşları",
        frontmatter: { type: "location" },
      }),
    ];
    render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    // Default: all notes, both entities render.
    expect(screen.getByText(/2 nodes/)).toBeTruthy();

    // Click a provenance filter no note carries → filter-empty state, not the
    // "add entity notes" guidance. (getByText matches direct text nodes only,
    // so the phrase inside <strong>/<code> is not part of the match.)
    fireEvent.click(screen.getByText("Canon"));
    expect(screen.getByText(/No notes match the/i)).toBeTruthy();
    expect(screen.queryByText(/No entities found/)).toBeNull();
    expect(
      screen.queryByText(/add notes with a frontmatter/i),
    ).toBeNull();

    // Reset button returns to the full graph.
    fireEvent.click(screen.getByText("Show all notes"));
    expect(screen.getByText(/2 nodes/)).toBeTruthy();
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

  it("zooms with the mouse wheel", () => {
    const notes = [makeNote({ id: "n1", title: "Titus Crow" })];
    const { container } = render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    const canvas = container.querySelector('[data-od-id="entity-graph-canvas"]')!;
    // NB: querySelector("svg") would match the toolbar's lucide icon first —
    // scope to the canvas container for the graph SVG.
    const svg = container.querySelector('[data-od-id="entity-graph-canvas"] svg') as SVGSVGElement;
    // Reset to a known state after the auto-fit on mount
    fireEvent.wheel(canvas, { deltaY: -100 });
    expect(svg.style.transform).toContain("scale(1.1)");
    fireEvent.wheel(canvas, { deltaY: 100 });
    expect(svg.style.transform).toContain("scale(1)");
  });

  it("pans the graph by dragging the canvas background", () => {
    const notes = [makeNote({ id: "n1", title: "Titus Crow" })];
    const { container } = render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    const canvas = container.querySelector('[data-od-id="entity-graph-canvas"]')!;
    const svg = container.querySelector('[data-od-id="entity-graph-canvas"] svg') as SVGSVGElement;

    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 140 });
    expect(svg.style.transform).toContain("translate(50px, 40px)");
    fireEvent.pointerUp(canvas);
  });

  it("does not start panning when a node is clicked", () => {
    const notes = [makeNote({ id: "n1", title: "Titus Crow" })];
    const { container } = render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    const canvas = container.querySelector('[data-od-id="entity-graph-canvas"]')!;
    const svg = container.querySelector('[data-od-id="entity-graph-canvas"] svg') as SVGSVGElement;

    // Snapshot the transform after auto-fit, then attempt a node drag
    const before = svg.style.transform;
    const nodeG = svg.querySelector("g[style]")!;
    fireEvent.pointerDown(nodeG, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 120 });
    expect(svg.style.transform).toBe(before);
    fireEvent.pointerUp(canvas);
  });

  it("fits the graph to the view when the fit button is clicked", () => {
    const notes = [
      makeNote({ id: "n1", title: "Titus Crow" }),
      makeNote({ id: "n2", title: "Elira" }),
    ];
    const { container } = render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    const svg = container.querySelector('[data-od-id="entity-graph-canvas"] svg') as SVGSVGElement;
    const canvas = container.querySelector('[data-od-id="entity-graph-canvas"]')!;

    // Give the canvas real dimensions so fitToView can compute a valid scale.
    // (jsdom's 0-size rects make the mount-time auto-fit early-return.)
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 560 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 120 });

    // Zoom in first — the auto-fit on mount already ran with 0-size (jsdom) and
    // set nothing, so wheel-in leaves us at scale(1.1).
    fireEvent.wheel(canvas, { deltaY: -100 });
    expect(svg.style.transform).toContain("scale(1.1)");

    fireEvent.click(screen.getByTitle("Fit Graph to View"));
    // Fit re-scales to the deterministic force-directed bounds, capped at 1.5.
    // Assert the scale is within the fit cap and no longer the wheel-zoomed 1.1.
    const match = svg.style.transform.match(/scale\(([\d.]+)\)/);
    expect(match).toBeTruthy();
    expect(Number(match![1])).toBeLessThanOrEqual(1.5);
    expect(svg.style.transform).not.toContain("scale(1.1)");
  });
});
