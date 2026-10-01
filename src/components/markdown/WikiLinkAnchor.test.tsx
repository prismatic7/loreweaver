import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WikiLinkAnchor } from "./WikiLinkAnchor";

describe("WikiLinkAnchor", () => {
  it("navigates to existing note on click", () => {
    const onSelectNote = vi.fn();
    render(
      <WikiLinkAnchor
        target="Waterdeep"
        alias="Waterdeep"
        targetNoteId="note-123"
        onSelectNote={onSelectNote}
        onCreateNote={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("Waterdeep"));
    expect(onSelectNote).toHaveBeenCalledWith("note-123");
  });

  it("calls onCreateNote when target note does not exist", () => {
    const onCreateNote = vi.fn();
    render(
      <WikiLinkAnchor
        target="Missing Place"
        alias="Missing Place"
        targetNoteId={null}
        onSelectNote={vi.fn()}
        onCreateNote={onCreateNote}
      />
    );
    fireEvent.click(screen.getByText("Missing Place?"));
    expect(onCreateNote).toHaveBeenCalledWith("Missing Place");
  });

  it("renders display alias when provided", () => {
    render(
      <WikiLinkAnchor
        target="Waterdeep"
        alias="The Crown of the North"
        targetNoteId="note-123"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
      />
    );
    expect(screen.getByText("The Crown of the North")).toBeInTheDocument();
  });
});
