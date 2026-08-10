import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CampaignVaultView, CampaignVaultViewProps } from "./CampaignVaultView";
import { CampaignNote } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

vi.mock("./MarkdownEditor", () => ({
  default: () => <div data-testid="mock-markdown-editor" />,
}));

const mockNotes: CampaignNote[] = [
  {
    id: "note-1",
    title: "Ancient Ruins",
    path: "World/Ancient Ruins.md",
    frontmatter: { type: "Location", tags: ["exploration"] },
    content: "Deep in the forest...",
  },
  {
    id: "note-2",
    title: "Elira the Sage",
    path: "NPCs/Elira.md",
    frontmatter: { type: "NPC" },
    content: "An old wizard...",
  },
];

const notesByFolder: Record<string, CampaignNote[]> = {
  World: [mockNotes[0]],
  NPCs: [mockNotes[1]],
};

function makeProps(overrides: Partial<CampaignVaultViewProps> = {}): CampaignVaultViewProps {
  return {
    activeView: "vault",
    notesByFolder,
    collapsedFolders: {},
    setCollapsedFolders: vi.fn(),
    selectedNoteId: "",
    setSelectedNoteId: vi.fn(),
    currentNote: undefined,
    isEditingNote: false,
    setIsEditingNote: vi.fn(),
    editTitle: "",
    setEditTitle: vi.fn(),
    editFrontmatter: {},
    setEditFrontmatter: vi.fn(),
    editContent: "",
    setEditContent: vi.fn(),
    setContextMenu: vi.fn(),
    activeFolderDropdown: null,
    setActiveFolderDropdown: vi.fn(),
    renderFolderDropdown: () => null,
    handleNewNote: vi.fn(),
    handleNewFolder: vi.fn(),
    handleTrashNote: vi.fn(),
    renderMarkdown: (content: string) => <div>{content}</div>,
    currentCanvasFolder: null,
    setCurrentCanvasFolder: vi.fn(),
    handleNormalizeVaultMarkdown: vi.fn(),
    triggerImmediateSave: vi.fn(),
    notes: mockNotes,
    setActiveView: vi.fn(),
    onSelectNoteFromCanvas: vi.fn(),
    onSelectCanvas: vi.fn(),
    ...overrides,
  };
}

describe("CampaignVaultView Component", () => {
  it("renders folders and their notes", () => {
    render(<CampaignVaultView {...makeProps()} />);

    expect(screen.getByText("World")).toBeInTheDocument();
    expect(screen.getByText("NPCs")).toBeInTheDocument();
    expect(screen.getByText("Ancient Ruins")).toBeInTheDocument();
    expect(screen.getByText("Elira the Sage")).toBeInTheDocument();
  });

  it("selects a note and switches to vault view", () => {
    const setSelectedNoteId = vi.fn();
    const setActiveView = vi.fn();
    render(
      <CampaignVaultView
        {...makeProps({ setSelectedNoteId, setActiveView })}
      />,
    );

    fireEvent.click(screen.getByText("Ancient Ruins"));
    expect(setSelectedNoteId).toHaveBeenCalledWith("note-1");
    expect(setActiveView).toHaveBeenCalledWith("vault");
  });

  it("collapses and expands a folder", () => {
    const setCollapsedFolders = vi.fn();
    render(
      <CampaignVaultView {...makeProps({ setCollapsedFolders })} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle World folder" }));
    expect(setCollapsedFolders).toHaveBeenCalled();
  });

  it("renders note metadata and allows editing the title", () => {
    const setEditTitle = vi.fn();
    const setIsEditingNote = vi.fn();
    render(
      <CampaignVaultView
        {...makeProps({
          currentNote: mockNotes[0],
          isEditingNote: true,
          editTitle: "Ancient Ruins",
          editFrontmatter: { type: "Location", tags: ["exploration"] },
          setEditTitle,
          setIsEditingNote,
        })}
      />,
    );

    const titleInput = screen.getByPlaceholderText("Note Title");
    expect(titleInput).toHaveValue("Ancient Ruins");

    fireEvent.change(titleInput, { target: { value: "Ruins of Eldoria" } });
    expect(setEditTitle).toHaveBeenCalledWith("Ruins of Eldoria");

    expect(screen.getByDisplayValue("Location")).toBeInTheDocument();
    expect(screen.getByDisplayValue("exploration")).toBeInTheDocument();
  });

  it("renders preview mode with rendered markdown", () => {
    render(
      <CampaignVaultView
        {...makeProps({
          currentNote: mockNotes[0],
          isEditingNote: false,
          renderMarkdown: (content: string) => <div data-testid="preview">{content}</div>,
        })}
      />,
    );

    // "Ancient Ruins" appears in both the sidebar folder list and the doc title,
    // so scope the assertion to the preview body.
    expect(screen.getByTestId("preview")).toHaveTextContent("Deep in the forest...");
  });
});
