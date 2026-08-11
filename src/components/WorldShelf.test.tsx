import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { WorldShelf, WorldShelfProps } from "./WorldShelf";
import { WorldInfo } from "../types";

const worlds: WorldInfo[] = [
  {
    id: "fate-of-cthulhu",
    name: "FATE of Cthulhu",
    description: "2003 espionage-horror.",
    icon: "🜁",
    path: "/vaults/fate-of-cthulhu",
    last_opened: "2026-08-10",
  },
  {
    id: "pulp",
    name: "Pulp Noir",
    description: "Warm paper and rust.",
    icon: "🕵",
    path: "/vaults/pulp",
    last_opened: null,
  },
];

function makeProps(overrides: Partial<WorldShelfProps> = {}): WorldShelfProps {
  return {
    worlds,
    activeWorldPath: "/vaults/fate-of-cthulhu",
    onSwitchWorld: vi.fn(),
    onOpenLiminal: vi.fn(),
    onCreateWorld: vi.fn(async () => {}),
    onExportWorld: vi.fn(async () => {}),
    onImportWorld: vi.fn(async () => {}),
    onMakeWorldFromLiminal: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("WorldShelf", () => {
  it("renders worlds and the liminal entry", () => {
    render(<WorldShelf {...makeProps()} />);
    expect(screen.getByText(/FATE of Cthulhu/)).toBeTruthy();
    expect(screen.getByText(/Pulp Noir/)).toBeTruthy();
    expect(screen.getByText(/The Liminal/)).toBeTruthy();
  });

  it("calls onSwitchWorld when a world is selected", () => {
    const onSwitchWorld = vi.fn();
    render(<WorldShelf {...makeProps({ onSwitchWorld })} />);
    fireEvent.change(screen.getByLabelText("World shelf"), {
      target: { value: "/vaults/pulp" },
    });
    expect(onSwitchWorld).toHaveBeenCalledWith("/vaults/pulp");
  });

  it("calls onOpenLiminal when the liminal entry is selected", () => {
    const onOpenLiminal = vi.fn();
    render(<WorldShelf {...makeProps({ onOpenLiminal })} />);
    fireEvent.change(screen.getByLabelText("World shelf"), {
      target: { value: "LIMINAL_TRIGGER" },
    });
    expect(onOpenLiminal).toHaveBeenCalled();
  });

  it("creates a new world with a scaffold choice", async () => {
    const onCreateWorld = vi.fn(async () => {});
    render(<WorldShelf {...makeProps({ onCreateWorld })} />);
    fireEvent.click(screen.getByTitle("New World"));
    fireEvent.change(screen.getByPlaceholderText("World name"), {
      target: { value: "My New World" },
    });
    fireEvent.change(screen.getByLabelText("Scaffold from"), {
      target: { value: "/vaults/pulp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreateWorld).toHaveBeenCalledWith("My New World", "/vaults/pulp");
  });

  it("calls onExportWorld for the active world", () => {
    const onExportWorld = vi.fn(async () => {});
    render(<WorldShelf {...makeProps({ onExportWorld })} />);
    fireEvent.click(screen.getByTitle("Export active world"));
    expect(onExportWorld).toHaveBeenCalledWith(worlds[0]);
  });

  it("calls onImportWorld when the import button is pressed", () => {
    const onImportWorld = vi.fn(async () => {});
    render(<WorldShelf {...makeProps({ onImportWorld })} />);
    fireEvent.click(screen.getByTitle("Import World (zip)"));
    expect(onImportWorld).toHaveBeenCalledTimes(1);
  });
});
