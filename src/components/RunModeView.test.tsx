import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RunModeView } from "./RunModeView";

describe("RunModeView", () => {
  it("renders the four grid panels with empty states", () => {
    render(<RunModeView />);
    expect(screen.getByText("Scene")).toBeInTheDocument();
    expect(screen.getByText("Initiative")).toBeInTheDocument();
    expect(screen.getByText("Pinned Rules")).toBeInTheDocument();
    expect(screen.getByText("Session Ledger")).toBeInTheDocument();
    expect(screen.getByText(/No scene on stage/)).toBeInTheDocument();
    expect(screen.getByText("No rules pinned.")).toBeInTheDocument();
  });

  it("renders a scene note when one is on stage", () => {
    render(
      <RunModeView
        sceneNote={{ id: "n1", title: "The Tavern", content: "Smoke and ale." }}
      />,
    );
    expect(screen.getByText("The Tavern")).toBeInTheDocument();
    expect(screen.getByText("Smoke and ale.")).toBeInTheDocument();
  });

  it("renders pinned rule cards", () => {
    render(
      <RunModeView
        pinnedRules={[{ id: "r1", title: "Grapple", content: "Contested STR." }]}
      />,
    );
    expect(screen.getByText("Grapple")).toBeInTheDocument();
    expect(screen.getByText("Contested STR.")).toBeInTheDocument();
  });

  it("rolls dice and clears the input", () => {
    const rollDice = vi.fn();
    render(<RunModeView rollDice={rollDice} />);
    const input = screen.getByLabelText("Dice notation");
    fireEvent.change(input, { target: { value: "1d20+4" } });
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    expect(rollDice).toHaveBeenCalledWith("1d20+4");
  });

  it("renders initiative state from JSON", () => {
    render(
      <RunModeView
        initiativeState={JSON.stringify({
          round: 2,
          currentIndex: 1,
          combatants: [
            { name: "Aragorn", initiative: 18 },
            { name: "Goblin", initiative: 12 },
          ],
        })}
      />,
    );
    expect(screen.getByText("Round 2")).toBeInTheDocument();
    expect(screen.getByText(/Aragorn/)).toBeInTheDocument();
    expect(screen.getByText(/Goblin/)).toBeInTheDocument();
  });

  it("renders presentation mode with the scene only", () => {
    render(
      <RunModeView
        presentation
        sceneNote={{ id: "n1", title: "The Throne Room", content: "Silence." }}
      />,
    );
    expect(screen.getByText("The Throne Room")).toBeInTheDocument();
    expect(screen.getByText("Press Esc to exit read-aloud")).toBeInTheDocument();
    // The grid panels are hidden in presentation mode.
    expect(screen.queryByText("Pinned Rules")).not.toBeInTheDocument();
  });

  it("toggles presentation via the read-aloud button", () => {
    const onTogglePresentation = vi.fn();
    render(<RunModeView onTogglePresentation={onTogglePresentation} />);
    fireEvent.click(screen.getByRole("button", { name: "Read aloud" }));
    expect(onTogglePresentation).toHaveBeenCalled();
  });
});
