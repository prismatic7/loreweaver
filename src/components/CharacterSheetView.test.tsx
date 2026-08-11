import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CharacterSheetView } from "./CharacterSheetView";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const mockInvoke = invoke as unknown as ReturnType<typeof vi.fn>;

const TEMPLATES = [
  {
    name: "Character",
    properties: {
      name: { type: "string", default: "" },
      hp: { type: "number", default: 10 },
      class: { type: "string", default: "Fighter" },
    },
    actions: [
      { label: "Roll HP", hook: "roll_hp", plugin: "dice" },
    ],
  },
  {
    name: "NPC",
    properties: {
      name: { type: "string", default: "" },
      faction: { type: "string", default: "" },
    },
    actions: [],
  },
];

describe("CharacterSheetView", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(TEMPLATES);
  });

  it("loads templates and renders the first one's fields", async () => {
    render(
      <CharacterSheetView
        vaultPath="/vault"
        alert={vi.fn()}
        onOpenNote={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Character" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("name")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("10")).toBeInTheDocument();
    expect(screen.getByLabelText("class")).toHaveValue("Fighter");
  });

  it("shows an empty state when no templates exist", async () => {
    mockInvoke.mockResolvedValue([]);
    render(
      <CharacterSheetView
        vaultPath="/vault"
        alert={vi.fn()}
        onOpenNote={vi.fn()}
      />,
    );

    expect(await screen.findByText("No templates found")).toBeInTheDocument();
  });

  it("resets form values when switching templates", async () => {
    const { container } = render(
      <CharacterSheetView
        vaultPath="/vault"
        alert={vi.fn()}
        onOpenNote={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Character" });
    fireEvent.change(screen.getByLabelText("name"), {
      target: { value: "Elira" },
    });
    expect(screen.getByLabelText("name")).toHaveValue("Elira");

    fireEvent.change(
      container.querySelector('[data-od-id="character-template-select"]')!,
      { target: { value: "NPC" } },
    );
    await waitFor(() => {
      expect(screen.getByLabelText("name")).toHaveValue("");
    });
    expect(screen.getByLabelText("faction")).toBeInTheDocument();
  });

  it("saves the sheet as a note with frontmatter and content", async () => {
    const alert = vi.fn();
    const onOpenNote = vi.fn();
    const { container } = render(
      <CharacterSheetView
        vaultPath="/vault"
        alert={alert}
        onOpenNote={onOpenNote}
      />,
    );

    await screen.findByRole("heading", { name: "Character" });
    fireEvent.change(screen.getByLabelText("name"), {
      target: { value: "Elira" },
    });
    fireEvent.change(screen.getByLabelText("hp"), {
      target: { value: "42" },
    });

    fireEvent.click(
      container.querySelector('[data-od-id="character-save-btn"]')!,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("save_note", {
        note: expect.objectContaining({
          title: "Elira",
          path: "Characters/Elira.md",
          frontmatter: expect.objectContaining({
            type: "Character",
            template: "Character",
            name: "Elira",
            hp: "42",
          }),
        }),
      });
    });
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("Elira"));
    expect(onOpenNote).toHaveBeenCalled();
  });

  it("runs a template action via execute_plugin_hook", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "list_templates") return Promise.resolve(TEMPLATES);
      if (cmd === "execute_plugin_hook") return Promise.resolve("Rolled 12 HP");
      return Promise.resolve(null);
    });
    const alert = vi.fn();
    const { container } = render(
      <CharacterSheetView
        vaultPath="/vault"
        alert={alert}
        onOpenNote={vi.fn()}
      />,
    );

    await screen.findByRole("heading", { name: "Character" });
    fireEvent.click(
      container.querySelector('[data-od-id="character-action-Roll HP"]')!,
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("execute_plugin_hook", {
        pluginId: "dice",
        hook: "roll_hp",
        payload: expect.stringContaining("Character"),
      });
    });
    expect(alert).toHaveBeenCalledWith("Rolled 12 HP");
  });
});
