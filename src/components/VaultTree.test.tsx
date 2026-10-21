import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { VaultTree } from "./VaultTree";
import { CampaignNote } from "../types";

const mockNotes: CampaignNote[] = [
  {
    id: "note-1",
    title: "Campaign Intro",
    path: "Act 1/Intro.md",
    frontmatter: { type: "Note" },
    content: "The story begins...",
  },
  {
    id: "note-2",
    title: "Castle Raven",
    path: "Act 1/Locations/Castle.md",
    frontmatter: { type: "Location", icon: "Castle" },
    content: "A spooky castle.",
  },
  {
    id: "note-3",
    title: "Root Overview",
    path: "Overview.md",
    frontmatter: { type: "Note" },
    content: "Root note.",
  },
];

describe("VaultTree Component", () => {
  it("renders nested folders and notes", () => {
    render(
      <VaultTree
        notes={mockNotes}
        discoveredFolders={["Act 1", "Act 1/Locations"]}
        collapsedFolders={{}}
        onToggleFolder={vi.fn()}
        selectedNoteId=""
        onSelectNote={vi.fn()}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onRenameNote={vi.fn()}
        onRenameFolder={vi.fn()}
        onMoveNote={vi.fn()}
        onTrashNote={vi.fn()}
        onTrashFolder={vi.fn()}
      />,
    );

    expect(screen.getByText("Act 1")).toBeInTheDocument();
    expect(screen.getByText("Locations")).toBeInTheDocument();
    expect(screen.getByText("Campaign Intro")).toBeInTheDocument();
    expect(screen.getByText("Castle Raven")).toBeInTheDocument();
    expect(screen.getByText("Root Overview")).toBeInTheDocument();
  });

  it("calls onToggleFolder when a folder toggle button is clicked", () => {
    const onToggleFolder = vi.fn();
    render(
      <VaultTree
        notes={mockNotes}
        discoveredFolders={["Act 1"]}
        collapsedFolders={{}}
        onToggleFolder={onToggleFolder}
        selectedNoteId=""
        onSelectNote={vi.fn()}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onRenameNote={vi.fn()}
        onRenameFolder={vi.fn()}
        onMoveNote={vi.fn()}
        onTrashNote={vi.fn()}
        onTrashFolder={vi.fn()}
      />,
    );

    const toggleBtn = screen.getByRole("button", { name: "Toggle Act 1 folder" });
    fireEvent.click(toggleBtn);
    expect(onToggleFolder).toHaveBeenCalledWith("Act 1");
  });

  it("calls onSelectNote when a note is clicked", () => {
    const onSelectNote = vi.fn();
    render(
      <VaultTree
        notes={mockNotes}
        discoveredFolders={["Act 1"]}
        collapsedFolders={{}}
        onToggleFolder={vi.fn()}
        selectedNoteId=""
        onSelectNote={onSelectNote}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onRenameNote={vi.fn()}
        onRenameFolder={vi.fn()}
        onMoveNote={vi.fn()}
        onTrashNote={vi.fn()}
        onTrashFolder={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Campaign Intro"));
    expect(onSelectNote).toHaveBeenCalledWith("note-1");
  });

  it("triggers inline rename on double-click and saves on Enter", () => {
    const onRenameNote = vi.fn();
    render(
      <VaultTree
        notes={mockNotes}
        discoveredFolders={["Act 1"]}
        collapsedFolders={{}}
        onToggleFolder={vi.fn()}
        selectedNoteId=""
        onSelectNote={vi.fn()}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onRenameNote={onRenameNote}
        onRenameFolder={vi.fn()}
        onMoveNote={vi.fn()}
        onTrashNote={vi.fn()}
        onTrashFolder={vi.fn()}
      />,
    );

    const noteItem = screen.getByText("Campaign Intro");
    fireEvent.doubleClick(noteItem);

    const input = screen.getByDisplayValue("Campaign Intro");
    fireEvent.change(input, { target: { value: "New Intro Title" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRenameNote).toHaveBeenCalledWith(mockNotes[0], "New Intro Title");
  });

  it("opens context menu on right-click for a note with actions", () => {
    const onTrashNote = vi.fn();
    const onDuplicateNote = vi.fn();
    const onArchiveNote = vi.fn();
    const onRevealInFileManager = vi.fn();

    render(
      <VaultTree
        notes={mockNotes}
        discoveredFolders={["Act 1"]}
        collapsedFolders={{}}
        onToggleFolder={vi.fn()}
        selectedNoteId=""
        onSelectNote={vi.fn()}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onRenameNote={vi.fn()}
        onRenameFolder={vi.fn()}
        onMoveNote={vi.fn()}
        onDuplicateNote={onDuplicateNote}
        onArchiveNote={onArchiveNote}
        onRevealInFileManager={onRevealInFileManager}
        onTrashNote={onTrashNote}
        onTrashFolder={vi.fn()}
      />,
    );

    const noteElement = screen.getByText("Campaign Intro");
    fireEvent.contextMenu(noteElement);

    expect(screen.getByText("Open Note")).toBeInTheDocument();
    expect(screen.getByText("Rename (F2)")).toBeInTheDocument();
    expect(screen.getByText("Duplicate")).toBeInTheDocument();
    expect(screen.getByText("Archive Note")).toBeInTheDocument();
    expect(screen.getByText("Reveal in Finder")).toBeInTheDocument();
    expect(screen.getByText("Move to Trash")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Duplicate"));
    expect(onDuplicateNote).toHaveBeenCalledWith(mockNotes[0]);
  });

  it("handles drag and drop to move note to another folder", () => {
    const onMoveNote = vi.fn();
    render(
      <VaultTree
        notes={mockNotes}
        discoveredFolders={["Act 1", "Act 1/Locations"]}
        collapsedFolders={{}}
        onToggleFolder={vi.fn()}
        selectedNoteId=""
        onSelectNote={vi.fn()}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onRenameNote={vi.fn()}
        onRenameFolder={vi.fn()}
        onMoveNote={onMoveNote}
        onTrashNote={vi.fn()}
        onTrashFolder={vi.fn()}
      />,
    );

    const targetFolderHeader = screen.getByTestId("folder-header-Act 1");

    const dropEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: {
        getData: (type: string) =>
          type === "application/loreweaver-note-path" ? "Overview.md" : "",
        files: [],
      },
    };

    fireEvent.drop(targetFolderHeader, dropEvent);
    expect(onMoveNote).toHaveBeenCalledWith("Overview.md", "Act 1");
  });

  it("filters notes when typing in the search box", () => {
    render(
      <VaultTree
        notes={mockNotes}
        discoveredFolders={["Act 1", "Act 1/Locations"]}
        collapsedFolders={{}}
        onToggleFolder={vi.fn()}
        selectedNoteId=""
        onSelectNote={vi.fn()}
        onNewNote={vi.fn()}
        onNewFolder={vi.fn()}
        onRenameNote={vi.fn()}
        onRenameFolder={vi.fn()}
        onMoveNote={vi.fn()}
        onTrashNote={vi.fn()}
        onTrashFolder={vi.fn()}
      />,
    );

    // Open search box
    fireEvent.click(screen.getByTitle("Filter tree"));
    const searchInput = screen.getByPlaceholderText("Filter notes...");
    fireEvent.change(searchInput, { target: { value: "Castle" } });

    expect(screen.getByText("Castle Raven")).toBeInTheDocument();
    expect(screen.queryByText("Campaign Intro")).not.toBeInTheDocument();
  });

  describe("bulk selection (F4.2)", () => {
    const baseProps = {
      notes: mockNotes,
      discoveredFolders: ["Act 1", "Act 1/Locations"],
      collapsedFolders: {},
      onToggleFolder: vi.fn(),
      selectedNoteId: "",
      onSelectNote: vi.fn(),
      onNewNote: vi.fn(),
      onNewFolder: vi.fn(),
      onRenameNote: vi.fn(),
      onRenameFolder: vi.fn(),
      onMoveNote: vi.fn(),
      onTrashNote: vi.fn(),
      onTrashFolder: vi.fn(),
    };

    it("stays single-select and shows no action bar without bulk handlers", () => {
      render(<VaultTree {...baseProps} />);
      fireEvent.click(screen.getByTestId("tree-note-note-1"));
      expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    });

    it("adds notes to the selection with ⌘/Ctrl and shows the bar", () => {
      render(
        <VaultTree
          {...baseProps}
          onBulkTrash={vi.fn()}
          onBulkMove={vi.fn()}
          onBulkTag={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId("tree-note-note-1"));
      expect(screen.getByText("1 selected")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("tree-note-note-3"), { metaKey: true });
      expect(screen.getByText("2 selected")).toBeInTheDocument();
    });

    it("selects a visible range with ⇧ and ignores collapsed folders", () => {
      render(
        <VaultTree
          {...baseProps}
          collapsedFolders={{ "Act 1": true }}
          onBulkTrash={vi.fn()}
          onBulkMove={vi.fn()}
          onBulkTag={vi.fn()}
        />,
      );

      // Act 1 is collapsed, so only the root note is rendered; shift from it
      // cannot reach a hidden note and degrades to that one note.
      fireEvent.click(screen.getByTestId("tree-note-note-3"));
      fireEvent.click(screen.getByTestId("tree-note-note-3"), { shiftKey: true });
      expect(screen.getByText("1 selected")).toBeInTheDocument();
    });

    it("passes the selected note paths to the bulk handlers", () => {
      const onBulkTag = vi.fn();
      render(
        <VaultTree
          {...baseProps}
          onBulkTrash={vi.fn()}
          onBulkMove={vi.fn()}
          onBulkTag={onBulkTag}
        />,
      );

      fireEvent.click(screen.getByTestId("tree-note-note-1"));
      fireEvent.click(screen.getByTestId("tree-note-note-3"), { metaKey: true });

      fireEvent.change(screen.getByLabelText("Tag to add"), {
        target: { value: "heist" },
      });
      fireEvent.click(screen.getByText("Tag"));

      expect(onBulkTag).toHaveBeenCalledWith(
        ["Act 1/Intro.md", "Overview.md"],
        "heist",
      );
    });

    it("does not change the open note on a modifier click", () => {
      const onSelectNote = vi.fn();
      render(
        <VaultTree
          {...baseProps}
          onSelectNote={onSelectNote}
          onBulkTrash={vi.fn()}
          onBulkMove={vi.fn()}
          onBulkTag={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByTestId("tree-note-note-1"));
      expect(onSelectNote).toHaveBeenCalledWith("note-1");

      fireEvent.click(screen.getByTestId("tree-note-note-3"), { metaKey: true });
      // Still only the first click opened a note.
      expect(onSelectNote).toHaveBeenCalledTimes(1);
    });

    it("clears the selection from the action bar", () => {
      render(
        <VaultTree
          {...baseProps}
          onBulkTrash={vi.fn()}
          onBulkMove={vi.fn()}
          onBulkTag={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByTestId("tree-note-note-1"));
      expect(screen.getByText("1 selected")).toBeInTheDocument();

      fireEvent.click(screen.getByLabelText("Clear selection"));
      expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
    });
  });
});
