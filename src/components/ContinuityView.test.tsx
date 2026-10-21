import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ContinuityView } from "./ContinuityView";

describe("ContinuityView", () => {
  it("shows an empty state when there are no findings", () => {
    render(
      <ContinuityView
        report={{ entities: [], findings: [] }}
        loading={false}
        onRunAudit={vi.fn()}
        onOpenNote={vi.fn()}
      />,
    );
    expect(screen.getByText(/No continuity issues found/)).toBeInTheDocument();
  });

  it("groups findings by severity and shows evidence", () => {
    render(
      <ContinuityView
        report={{
          entities: [],
          findings: [
            {
              id: "f1",
              kind: "dead_actor",
              severity: "high",
              note_ids: ["n1", "n2"],
              evidence: "Vex is marked dead but is mentioned in a dated note.",
              citation: "Worldbuilding/The_Heist.md",
            },
          ],
        }}
        loading={false}
        onRunAudit={vi.fn()}
        onOpenNote={vi.fn()}
      />,
    );
    expect(screen.getByText(/high \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("dead_actor")).toBeInTheDocument();
    expect(
      screen.getByText(/Vex is marked dead but is mentioned in a dated note./),
    ).toBeInTheDocument();
  });

  it("opens a note when the open-note button is clicked", () => {
    const onOpenNote = vi.fn();
    render(
      <ContinuityView
        report={{
          entities: [],
          findings: [
            {
              id: "f1",
              kind: "orphan_thread",
              severity: "medium",
              note_ids: ["n1"],
              evidence: "Thread has no inbound links.",
              citation: "Worldbuilding/Thread.md",
            },
          ],
        }}
        loading={false}
        onRunAudit={vi.fn()}
        onOpenNote={onOpenNote}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open note" }));
    expect(onOpenNote).toHaveBeenCalledWith("n1");
  });
});
