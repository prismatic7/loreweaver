import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BulkActionBar } from "./BulkActionBar";

const FOLDERS = ["Worldbuilding", "Characters"];

describe("BulkActionBar", () => {
  it("renders nothing with an empty selection", () => {
    const { container } = render(
      <BulkActionBar
        count={0}
        folders={FOLDERS}
        onTrash={vi.fn()}
        onMove={vi.fn()}
        onTag={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports how many notes are selected", () => {
    render(
      <BulkActionBar
        count={7}
        folders={FOLDERS}
        onTrash={vi.fn()}
        onMove={vi.fn()}
        onTag={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("7 selected")).toBeInTheDocument();
  });

  it("trashes the selection", () => {
    const onTrash = vi.fn();
    render(
      <BulkActionBar
        count={2}
        folders={FOLDERS}
        onTrash={onTrash}
        onMove={vi.fn()}
        onTag={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Trash"));
    expect(onTrash).toHaveBeenCalledTimes(1);
  });

  it("moves to the chosen folder and offers Root as a destination", () => {
    const onMove = vi.fn();
    render(
      <BulkActionBar
        count={3}
        folders={FOLDERS}
        onTrash={vi.fn()}
        onMove={onMove}
        onTag={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const select = screen.getByLabelText("Move selected notes to folder");
    // Root is always available, even when the vault has no folders.
    expect(screen.getByText("Root")).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "Characters" } });
    expect(onMove).toHaveBeenCalledWith("Characters");
  });

  it("adds a tag on Enter and clears the field", () => {
    const onTag = vi.fn();
    render(
      <BulkActionBar
        count={2}
        folders={FOLDERS}
        onTrash={vi.fn()}
        onMove={vi.fn()}
        onTag={onTag}
        onClear={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Tag to add");
    fireEvent.change(input, { target: { value: "heist" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onTag).toHaveBeenCalledWith("heist");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("does not fire a tag for whitespace only", () => {
    const onTag = vi.fn();
    render(
      <BulkActionBar
        count={2}
        folders={FOLDERS}
        onTrash={vi.fn()}
        onMove={vi.fn()}
        onTag={onTag}
        onClear={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Tag to add");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onTag).not.toHaveBeenCalled();
  });

  it("clears the selection", () => {
    const onClear = vi.fn();
    render(
      <BulkActionBar
        count={1}
        folders={FOLDERS}
        onTrash={vi.fn()}
        onMove={vi.fn()}
        onTag={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByLabelText("Clear selection"));
    expect(onClear).toHaveBeenCalled();
  });

  it("disables every action while a batch is in flight", () => {
    render(
      <BulkActionBar
        count={2}
        folders={FOLDERS}
        busy
        onTrash={vi.fn()}
        onMove={vi.fn()}
        onTag={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("Working…")).toBeInTheDocument();
    expect(screen.getByText("Trash").closest("button")).toBeDisabled();
    expect(screen.getByLabelText("Move selected notes to folder")).toBeDisabled();
  });
});
