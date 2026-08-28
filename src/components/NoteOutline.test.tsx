import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NoteOutline } from "./NoteOutline";

describe("NoteOutline", () => {
  it("renders a nested heading tree", () => {
    render(
      <NoteOutline
        content={["## The City", "### Districts", "### Underdark", "## The Guilds"].join("\n")}
      />,
    );

    expect(screen.getByText("Outline")).toBeInTheDocument();
    expect(screen.getByText("The City")).toBeInTheDocument();
    expect(screen.getByText("Districts")).toBeInTheDocument();
    expect(screen.getByText("Underdark")).toBeInTheDocument();
    expect(screen.getByText("The Guilds")).toBeInTheDocument();
  });

  it("collapses and expands a branch", () => {
    render(<NoteOutline content={["## A", "### A1", "## B"].join("\n")} />);

    expect(screen.getByText("A1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("A"));
    expect(screen.queryByText("A1")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();

    fireEvent.click(screen.getByText("A"));
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("renders nothing when content has no headings", () => {
    const { container } = render(<NoteOutline content="plain text\nmore text" />);
    expect(container.firstChild).toBeNull();
  });
});
