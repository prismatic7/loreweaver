import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FolderCanvas } from "./FolderCanvas";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

const mockNotes = [
  {
    id: "note-1",
    title: "Ancient Ruins",
    path: "World/Ancient Ruins.md",
    frontmatter: { type: "Location", tags: ["region:west"] },
    content: "Deep in the forest. [[Elira the Sage]]",
  },
  {
    id: "note-2",
    title: "Elira the Sage",
    path: "World/Elira.md",
    frontmatter: { type: "NPC", tags: ["region:west"] },
    content: "An old wizard.",
  },
];

function renderCanvas(overrides: Partial<Parameters<typeof FolderCanvas>[0]> = {}) {
  return render(
    <FolderCanvas
      currentFolder="World"
      activeCanvasPath="World/World.canvas"
      notes={mockNotes as any}
      onSelectNote={vi.fn()}
      onSelectCanvas={vi.fn()}
      {...overrides}
    />,
  );
}

describe("FolderCanvas Component", () => {
  it("renders nodes for notes in the current folder", async () => {
    renderCanvas();

    // Nodes are populated asynchronously from the mocked load_canvas_file invoke.
    expect(await screen.findByText("Ancient Ruins")).toBeInTheDocument();
    expect(screen.getByText("Elira the Sage")).toBeInTheDocument();
  });

  it("renders dynamic edges derived from wiki links and frontmatter", async () => {
    renderCanvas();

    // Wait for nodes to render before asserting on the SVG edge lines.
    await screen.findByText("Ancient Ruins");
    const lines = document.querySelectorAll("svg line");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("calls onSelectNote when the view button is clicked", async () => {
    const onSelectNote = vi.fn();
    renderCanvas({ onSelectNote });

    const viewButtons = await screen.findAllByTitle("View Note");
    fireEvent.click(viewButtons[0]);
    expect(onSelectNote).toHaveBeenCalledWith("note-1");
  });

  it("calls onSelectCanvas when a canvas node is double-clicked", async () => {
    const onSelectCanvas = vi.fn();
    const canvasNote = {
      id: "canvas-1",
      title: "World Map",
      path: "World/World.canvas",
      frontmatter: { type: "Canvas" },
      content: "",
    };
    render(
      <FolderCanvas
        currentFolder="World"
        activeCanvasPath="World/World.canvas"
        notes={[canvasNote] as any}
        onSelectNote={vi.fn()}
        onSelectCanvas={onSelectCanvas}
      />,
    );

    const canvasNode = await screen.findByRole("button", {
      name: "Open canvas World Map",
    });
    fireEvent.doubleClick(canvasNode);
    expect(onSelectCanvas).toHaveBeenCalledWith("World/World.canvas");
  });
});
