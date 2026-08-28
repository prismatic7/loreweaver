import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NotePreviewTooltip } from "./NotePreviewTooltip";
import { CampaignNote } from "../types";

const makeNote = (content: string): CampaignNote => ({
  id: "n1",
  title: "The City",
  path: "Worldbuilding/The_City.md",
  content,
  frontmatter: {},
});

describe("NotePreviewTooltip", () => {
  it("shows nothing before hover", () => {
    render(
      <NotePreviewTooltip note={makeNote("body")}>
        <span>trigger</span>
      </NotePreviewTooltip>,
    );
    expect(screen.getByText("trigger")).toBeInTheDocument();
    expect(screen.queryByTestId("note-preview")).not.toBeInTheDocument();
  });

  it("reveals title and snippet on mouse enter", () => {
    render(
      <NotePreviewTooltip note={makeNote("# City\n\nA sprawling port city.")}>
        <span>trigger</span>
      </NotePreviewTooltip>,
    );

    fireEvent.mouseEnter(screen.getByText("trigger"));
    expect(screen.getByTestId("note-preview")).toBeInTheDocument();
    expect(screen.getByText("The City")).toBeInTheDocument();
    expect(screen.getByText(/A sprawling port city/)).toBeInTheDocument();
  });

  it("hides on mouse leave", () => {
    render(
      <NotePreviewTooltip note={makeNote("body text")}>
        <span>trigger</span>
      </NotePreviewTooltip>,
    );

    fireEvent.mouseEnter(screen.getByText("trigger"));
    expect(screen.getByTestId("note-preview")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByText("trigger"));
    expect(screen.queryByTestId("note-preview")).not.toBeInTheDocument();
  });

  it("truncates long content to the snippet cap", () => {
    const longContent = `# Long\n\n${"word ".repeat(100)}`;
    render(
      <NotePreviewTooltip note={makeNote(longContent)}>
        <span>trigger</span>
      </NotePreviewTooltip>,
    );

    fireEvent.mouseEnter(screen.getByText("trigger"));
    const preview = screen.getByTestId("note-preview");
    expect(preview.textContent).toContain("…");
  });
});
