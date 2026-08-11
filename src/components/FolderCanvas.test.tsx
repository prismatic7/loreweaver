import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FolderCanvas } from "./FolderCanvas";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

const EMPTY_CANVAS = JSON.stringify({ nodes: [], edges: [], containers: [] });

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

  describe("container boxes", () => {
    beforeEach(() => {
      mockInvoke.mockReset();
      mockInvoke.mockResolvedValue(EMPTY_CANVAS);
    });

    it("adds a container box that can be dragged", async () => {
      const { container } = renderCanvas();
      expect(await screen.findByText(/Canvas: World/)).toBeInTheDocument();

      fireEvent.click(screen.getByTitle("Add Container / Boundary Box"));
      const boxDiv = container.querySelector('[aria-label="Delete Container"]')?.parentElement;
      expect(boxDiv).toBeTruthy();
      expect(boxDiv!.style.width).toBe("400px");
      expect(boxDiv!.style.height).toBe("300px");

      // Drag the box: mousedown on it, move, mouseup.
      fireEvent.mouseDown(boxDiv!, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(boxDiv!, { clientX: 200, clientY: 150 });
      fireEvent.mouseUp(boxDiv!);

      // The box moved by the delta (100, 50) in canvas coords (zoom=1, pan=40,40).
      // x: (200 - 40) - (100 - 40 - 80) = 160 - (-20) = 180
      // y: (150 - 40) - (100 - 40 - 80) = 110 - (-20) = 130
      expect(boxDiv!.style.left).toBe("180px");
      expect(boxDiv!.style.top).toBe("130px");
    });

    it("resizes a container box from the bottom-right handle", async () => {
      const { container } = renderCanvas();
      expect(await screen.findByText(/Canvas: World/)).toBeInTheDocument();

      fireEvent.click(screen.getByTitle("Add Container / Boundary Box"));
      const handle = container.querySelector('[aria-label="Resize Container"]') as HTMLElement;
      expect(handle).toBeTruthy();

      // Resize: mousedown on the handle, drag out, mouseup.
      fireEvent.mouseDown(handle, { clientX: 480, clientY: 380 });
      fireEvent.mouseMove(handle, { clientX: 600, clientY: 500 });
      fireEvent.mouseUp(handle);

      const boxDiv = handle.parentElement!;
      // Handle starts at the box's right edge (canvas x = 80 + 400 = 480), so
      // boxX = (480 - 40) - 400 = 40. At clientX=600: width = (600-40) - 40 = 520.
      // Height: boxY = (380 - 40) - 300 = 40; at clientY=500: height = (500-40) - 40 = 420.
      expect(boxDiv.style.width).toBe("520px");
      expect(boxDiv.style.height).toBe("420px");
    });

    it("deletes a container box", async () => {
      const { container } = renderCanvas();
      expect(await screen.findByText(/Canvas: World/)).toBeInTheDocument();

      fireEvent.click(screen.getByTitle("Add Container / Boundary Box"));
      const deleteBtn = container.querySelector('[aria-label="Delete Container"]') as HTMLElement;
      expect(deleteBtn).toBeTruthy();

      fireEvent.click(deleteBtn);
      expect(container.querySelector('[aria-label="Delete Container"]')).toBeNull();
    });
  });
});
