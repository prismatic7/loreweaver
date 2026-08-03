import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TrashView } from "./TrashView";
import { CampaignNote } from "../types";

describe("TrashView Component", () => {
  const mockTrashedNotes: CampaignNote[] = [
    {
      id: "note-1",
      title: "Test Trashed Note",
      path: "Trash/note-1.md",
      frontmatter: { original_path: "Notes/note-1.md" },
      content: "Content of trashed note",
    },
  ];

  it("renders empty state when trashedNotes is empty", () => {
    render(
      <TrashView
        trashedNotes={[]}
        handleEmptyTrash={vi.fn()}
        handleRestoreNote={vi.fn()}
        handleDeleteTrashedNote={vi.fn()}
      />
    );

    expect(screen.getByText("Vault & Rulebook Trash")).toBeInTheDocument();
    expect(screen.getByText("Trash is Empty")).toBeInTheDocument();
    expect(
      screen.getByText("Any deleted campaign notes will appear here for easy recovery.")
    ).toBeInTheDocument();
  });

  it("renders trashed notes and triggers handlers", () => {
    const handleEmptyTrash = vi.fn();
    const handleRestoreNote = vi.fn();
    const handleDeleteTrashedNote = vi.fn();

    render(
      <TrashView
        trashedNotes={mockTrashedNotes}
        handleEmptyTrash={handleEmptyTrash}
        handleRestoreNote={handleRestoreNote}
        handleDeleteTrashedNote={handleDeleteTrashedNote}
      />
    );

    expect(screen.getByText("Vault & Rulebook Trash")).toBeInTheDocument();
    expect(screen.getByText("Trashed Vault Notes (1)")).toBeInTheDocument();
    expect(screen.getByText("Test Trashed Note")).toBeInTheDocument();
    expect(screen.getByText("Notes/note-1.md")).toBeInTheDocument();

    const emptyTrashButton = screen.getByText("Empty Trash");
    fireEvent.click(emptyTrashButton);
    expect(handleEmptyTrash).toHaveBeenCalledTimes(1);

    const restoreButton = screen.getByText("Restore");
    fireEvent.click(restoreButton);
    expect(handleRestoreNote).toHaveBeenCalledWith("Trash/note-1.md");

    const deleteButton = screen.getByText("Delete Permanently");
    fireEvent.click(deleteButton);
    expect(handleDeleteTrashedNote).toHaveBeenCalledWith("Trash/note-1.md");
  });
});
