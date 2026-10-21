import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PluginPanel } from "./PluginPanel";
import type { UiPanel } from "../bindings";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const panel: UiPanel = {
  id: "npc-panel",
  title: "NPC Generator",
  fields: [
    { key: "faction", field_type: "text", label: "Faction" },
    {
      key: "tone",
      field_type: "select",
      label: "Tone",
      options: ["grim", "heroic", "comic"],
    },
  ],
  actions: [{ id: "generate", label: "Generate", hook: "generate_npc" }],
};

describe("PluginPanel", () => {
  it("renders fields and action buttons from the typed schema", () => {
    render(<PluginPanel pluginId="npc-generator" panel={panel} />);
    expect(screen.getByText("NPC Generator")).toBeInTheDocument();
    expect(screen.getByText("Faction")).toBeInTheDocument();
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  it("invokes the action hook with serialized field values and renders a table", async () => {
    vi.mocked(invoke).mockResolvedValue(
      JSON.stringify({
        type: "table",
        columns: ["Name", "Role"],
        rows: [["Vex", "Captain"]],
      }),
    );

    render(<PluginPanel pluginId="npc-generator" panel={panel} />);

    fireEvent.change(screen.getByLabelText("Faction"), {
      target: { value: "Ironclads" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("execute_plugin_hook", {
        pluginId: "npc-generator",
        hook: "generate_npc",
        payload: JSON.stringify({ faction: "Ironclads", tone: "grim" }),
      }),
    );

    await waitFor(() => expect(screen.getByText("Vex")).toBeInTheDocument());
    expect(screen.getByText("Captain")).toBeInTheDocument();
  });

  it("surfaces a hook error without rendering a result", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("hook exploded"));

    render(<PluginPanel pluginId="npc-generator" panel={panel} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(screen.getByText("hook exploded")).toBeInTheDocument());
  });
});
