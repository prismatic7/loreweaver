import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TimelineView } from "./TimelineView";
import type { CampaignNote } from "../types";

const datedNote: CampaignNote = {
  id: "n1",
  title: "The Battle of Ashen Ford",
  path: "Events/Battle.md",
  frontmatter: { date: "1245-01-01" },
  content: "The armies met at dawn.",
};

describe("TimelineView", () => {
  it("renders dated events", () => {
    render(<TimelineView notes={[datedNote]} onOpenNote={vi.fn()} />);
    expect(screen.getByText("The Battle of Ashen Ford")).toBeInTheDocument();
  });

  it("calls onDropNote when a note is dropped on the timeline", () => {
    const onDropNote = vi.fn();
    const { container } = render(
      <TimelineView notes={[]} onOpenNote={vi.fn()} onDropNote={onDropNote} />,
    );
    const root = container.querySelector('[data-od-id="timeline-view"]');
    expect(root).not.toBeNull();
    fireEvent.drop(root!, {
      dataTransfer: {
        getData: () => "Worldbuilding/Vex.md",
      },
    });
    expect(onDropNote).toHaveBeenCalledWith("Worldbuilding/Vex.md");
  });

  it("ignores drops when no handler is wired", () => {
    const { container } = render(
      <TimelineView notes={[]} onOpenNote={vi.fn()} />,
    );
    const root = container.querySelector('[data-od-id="timeline-view"]');
    expect(() =>
      fireEvent.drop(root!, {
        dataTransfer: { getData: () => "Worldbuilding/Vex.md" },
      }),
    ).not.toThrow();
  });
});
