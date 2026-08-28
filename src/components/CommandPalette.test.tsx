import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CommandPalette, fuzzyScore, type PaletteNote, type PaletteView } from "./CommandPalette";

const views: PaletteView[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "vault", label: "Vault" },
  { id: "rules", label: "Rules" },
  { id: "ai", label: "AI & Generations" },
  { id: "settings", label: "Settings" },
];

const notes: PaletteNote[] = [
  { id: "n1", title: "Ancient Ruins", path: "World/Ancient Ruins.md" },
  { id: "n2", title: "Elira the Sage", path: "World/Elira.md" },
  { id: "n3", title: "The Night Voyage", path: "World/Night Voyage.md" },
];

function makeProps(overrides: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    views,
    notes,
    recentNoteIds: ["n3"],
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe("fuzzyScore", () => {
  it("ranks prefix matches best", () => {
    expect(fuzzyScore("vau", "Vault")).toBe(0);
  });
  it("ranks substring matches next", () => {
    expect(fuzzyScore("ault", "Vault")).toBe(1);
  });
  it("accepts subsequence matches weakly", () => {
    expect(fuzzyScore("vl", "Vault")).toBeGreaterThan(10);
  });
  it("rejects non-matches", () => {
    expect(fuzzyScore("zzz", "Vault")).toBe(Infinity);
  });
  it("treats empty query as a match-all", () => {
    expect(fuzzyScore("", "Vault")).toBe(0);
  });
});

describe("CommandPalette", () => {
  it("renders views and notes when open", () => {
    render(<CommandPalette {...makeProps()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument();
    expect(screen.getAllByText(/Ancient Ruins/).length).toBeGreaterThan(0);
  });

  it("renders nothing when closed", () => {
    render(<CommandPalette {...makeProps({ open: false })} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("fuzzy-filters notes by title", () => {
    render(<CommandPalette {...makeProps()} />);
    fireEvent.change(screen.getByLabelText("Palette query"), {
      target: { value: "elra" },
    });
    expect(screen.getByText(/Elira the Sage/)).toBeInTheDocument();
    expect(screen.queryByText(/Ancient Ruins/)).not.toBeInTheDocument();
  });

  it("pins recent notes above others with an empty query", () => {
    const { container } = render(<CommandPalette {...makeProps()} />);
    // Recent note gets a recency boost: it sorts before everything (score -0.25 < 0).
    const firstRow = container.querySelector('[data-index="0"]');
    expect(firstRow).toHaveTextContent("The Night Voyage");
  });

  it("selects a note on Enter", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<CommandPalette {...makeProps({ onSelect, onClose })} />);
    fireEvent.change(screen.getByLabelText("Palette query"), {
      target: { value: "ancient" },
    });
    fireEvent.keyDown(screen.getByLabelText("Palette query"), {
      key: "Enter",
    });
    expect(onSelect).toHaveBeenCalledWith({ kind: "note", id: "n1" });
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates with arrow keys and selects a view", () => {
    const onSelect = vi.fn();
    render(<CommandPalette {...makeProps({ onSelect })} />);
    const input = screen.getByLabelText("Palette query");
    // Empty-query ordering: recent note first (-0.25), then views alphabetically.
    fireEvent.keyDown(input, { key: "ArrowDown" }); // recent note -> AI & Generations
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ kind: "view", id: "ai" });
  });

  it("closes on Escape and on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = render(<CommandPalette {...makeProps({ onClose })} />);
    fireEvent.keyDown(screen.getByLabelText("Palette query"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(2);
    void container;
  });

  it("shows the empty state for a nonsense query", () => {
    render(<CommandPalette {...makeProps()} />);
    fireEvent.change(screen.getByLabelText("Palette query"), {
      target: { value: "qqqqzzzz" },
    });
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });
});