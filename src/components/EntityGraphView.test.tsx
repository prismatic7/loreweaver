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
    // The actual SVG circles must render, not just the badge. Guards against
    // "badge says 2 but nothing is drawn" regressions.
    const { container } = render(
      <EntityGraphView notes={notes} onOpenNote={vi.fn()} />,
    );
    const canvas = container.querySelector('[data-od-id="entity-graph-canvas"]');
    expect(canvas).toBeTruthy();
    const circles = canvas!.querySelectorAll("circle");
    expect(circles.length).toBe(2);
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

  it("auto-falls back to all notes when a provenance filter matches nothing", () => {
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

    // Click a provenance filter no note carries → the graph must NOT dead-end
    // in an empty state: it falls back to "all" and shows a notice.
    fireEvent.click(screen.getByText("Canon"));
    expect(screen.getByText(/fell back to showing all notes/i)).toBeTruthy();
    expect(screen.getByText(/2 nodes/)).toBeTruthy();
    expect(screen.queryByText(/No entities found/)).toBeNull();

    // The "All" tab is active again after the fallback.
    const allTab = screen.getByText("All");
    expect(
      (allTab.closest("button") as HTMLButtonElement).style.borderBottom,
    ).toContain("var(--accent)");
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

  it("keeps small graphs inside the canvas (regression: nodes flew to clamp corners)", () => {
    // With 2 nodes and no edges there is no attraction, so repulsion alone
    // used to slam both nodes into the clamp bounds (-100/700, 900/-100) —
    // off-screen at scale(1), i.e. a blank canvas with a correct badge.
    const notes = [
      makeNote({ id: "n1", title: "Titus Crow" }),
      makeNote({ id: "n2", title: "Elira" }),
    ];
    const { container } = render(<EntityGraphView notes={notes} onOpenNote={vi.fn()} />);
    const canvas = container.querySelector('[data-od-id="entity-graph-canvas"]')!;
    Object.defineProperty(canvas, "clientWidth", { configurable: true, value: 1000 });
    Object.defineProperty(canvas, "clientHeight", { configurable: true, value: 600 });

    const circles = container.querySelectorAll(
      '[data-od-id="entity-graph-canvas"] svg circle',
    );
    expect(circles.length).toBe(2);

    const positions = Array.from(circles).map((c) => {
      const g = c.closest("g");
      const m = g
        ?.getAttribute("transform")
        ?.match(/translate\((-?[\d.]+), (-?[\d.]+)\)/);
      return { x: Number(m?.[1]), y: Number(m?.[2]) };
    });
    positions.forEach((p) => {
      expect(p.x).toBeGreaterThan(-50);
      expect(p.x).toBeLessThan(850);
      expect(p.y).toBeGreaterThan(-50);
      expect(p.y).toBeLessThan(650);
    });
  });
});
