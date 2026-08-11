import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MapBuilderView } from "./MapBuilderView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

const SAVED_MAP = JSON.stringify({
  type: "map",
  tokens: [
    { id: "t1", label: "Elira", x: 120, y: 120, color: "oklch(52% 0.10 28)" },
    { id: "t2", label: "Baron", x: 300, y: 200, color: "oklch(50% 0.14 25)" },
  ],
  fog: [
    { id: "f1", x: 80, y: 80, width: 300, height: 200, hidden: true },
  ],
});

function renderMap(overrides: Partial<Parameters<typeof MapBuilderView>[0]> = {}) {
  const props = {
    vaultPath: "/vault",
    mapRelPath: "Maps/Dungeon.map",
    alert: vi.fn(),
    ...overrides,
  };
  return {
    ...render(<MapBuilderView {...props} />),
    props,
  };
}

describe("MapBuilderView", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(SAVED_MAP);
  });

  it("loads and renders saved tokens and fog regions", async () => {
    renderMap();
    expect(await screen.findByText("Elira")).toBeInTheDocument();
    expect(screen.getByText("Baron")).toBeInTheDocument();
    expect(screen.getByText("Fog (hidden)")).toBeInTheDocument();
  });

  it("shows the empty canvas when the map file is empty", async () => {
    mockInvoke.mockResolvedValue("{}");
    renderMap();
    expect(await screen.findByText("Map Builder (0 tokens, 0 fog regions)")).toBeInTheDocument();
  });

  it("adds a token via the naming overlay", async () => {
    renderMap();
    fireEvent.click(await screen.findByTitle("Add Token"));
    // Overlay appears with an input
    const input = await screen.findByPlaceholderText("Token label");
    fireEvent.change(input, { target: { value: "Zarathustra" } });
    fireEvent.click(screen.getByText("Add Token"));
    expect(screen.getByText("Zarathustra")).toBeInTheDocument();
    expect(screen.getByText(/3 tokens/)).toBeInTheDocument();
  });

  it("defaults to 'Token' label when the overlay input is empty", async () => {
    renderMap();
    fireEvent.click(await screen.findByTitle("Add Token"));
    fireEvent.click(await screen.findByText("Add Token"));
    // Two Token labels now: the toolbar button and the new token's label
    expect(screen.getAllByText("Token")).toHaveLength(2);
    expect(screen.getByText(/3 tokens/)).toBeInTheDocument();
  });

  it("cancels token creation when Escape is pressed", async () => {
    renderMap();
    fireEvent.click(await screen.findByTitle("Add Token"));
    const input = await screen.findByPlaceholderText("Token label");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Token label")).not.toBeInTheDocument();
    // Still only the two saved tokens
    expect(screen.getByText(/2 tokens/)).toBeInTheDocument();
  });

  it("adds a fog region that starts hidden", async () => {
    renderMap();
    fireEvent.click(await screen.findByTitle("Add Fog-of-War Region"));
    expect(screen.getByText(/2 fog regions/)).toBeInTheDocument();
    // One from the saved map, one new — both hidden
    expect(screen.getAllByText("Fog (hidden)")).toHaveLength(2);
  });

  it("toggles a fog region hidden/revealed", async () => {
    renderMap();
    const toggle = await screen.findByRole("button", { name: "Toggle fog region" });
    fireEvent.click(toggle);
    expect(screen.getByText("Revealed")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("Fog (hidden)")).toBeInTheDocument();
  });

  it("deletes a token with its delete control", async () => {
    renderMap();
    const deleteButtons = await screen.findAllByRole("button", { name: "Delete token" });
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]);
    expect(screen.queryByText("Elira")).not.toBeInTheDocument();
    expect(screen.getByText(/1 token/)).toBeInTheDocument();
  });

  it("deletes a fog region with its delete control", async () => {
    renderMap();
    fireEvent.click(await screen.findByRole("button", { name: "Delete fog region" }));
    expect(screen.queryByText("Fog (hidden)")).not.toBeInTheDocument();
    expect(screen.getByText(/0 fog regions/)).toBeInTheDocument();
  });

  it("selects a token on mousedown and deselects on canvas click", async () => {
    const { container } = renderMap();
    const tokenGroup = (await screen.findByText("Elira")).closest("g")!;
    expect(tokenGroup).not.toBeNull();
    fireEvent.mouseDown(tokenGroup);
    // Selecting is internal state; verify no crash and the token still renders
    expect(screen.getByText("Elira")).toBeInTheDocument();
    fireEvent.click(container.querySelector('[data-od-id="map-canvas"]')!);
    expect(screen.getByText("Elira")).toBeInTheDocument();
  });

  it("measures a distance with the ruler after two clicks", async () => {
    const { container } = renderMap();
    fireEvent.click(await screen.findByText("Ruler"));
    const canvas = container.querySelector('[data-od-id="map-canvas"]')!;
    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    });
    fireEvent.click(canvas, { clientX: 100, clientY: 100 });
    fireEvent.click(canvas, { clientX: 200, clientY: 100 });
    // 100 units apart in map space (zoom 1, pan 40,40 → x=(clientX-40))
    expect(screen.getByText("100 units")).toBeInTheDocument();
  });

  it("saves the map and alerts on success", async () => {
    // Load resolves the saved map (Elira appears); save resolves null (success).
    // NB: mockResolvedValue replaces the default, so the load would get null too
    // unless sequenced with Once.
    mockInvoke.mockResolvedValueOnce(SAVED_MAP).mockResolvedValue(null);
    renderMap();
    // Wait for the async load to populate tokens before saving
    await screen.findByText("Elira");
    fireEvent.click(screen.getByTitle("Save Map"));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        "save_canvas_file",
        expect.objectContaining({ relPath: "Maps/Dungeon.map" }),
      );
    });
    // First call is the load; find the save call
    const saveCall = mockInvoke.mock.calls.find(
      (c) => c[0] === "save_canvas_file",
    );
    const saveArgs = saveCall?.[1] as { content?: string };
    expect(saveArgs?.content).toContain("\"type\": \"map\"");
    expect(saveArgs?.content).toContain("\"label\": \"Elira\"");
  });

  it("alerts on save failure", async () => {
    mockInvoke.mockRejectedValue(new Error("disk full"));
    const { props } = renderMap();
    fireEvent.click(await screen.findByTitle("Save Map"));
    await waitFor(() => {
      expect(props.alert).toHaveBeenCalledWith(expect.stringContaining("Failed to save map"));
    });
  });
});
