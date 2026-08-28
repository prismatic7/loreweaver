import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RightDrawer, RightDrawerProps } from "./RightDrawer";
import { WebClip } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function makeProps(overrides: Partial<RightDrawerProps> = {}): RightDrawerProps {
  return {
    activeView: "vault",
    isOpen: true,
    setIsOpen: vi.fn(),
    tab: "scratchpad",
    setTab: vi.fn(),
    scratchpadText: "",
    setScratchpadText: vi.fn(),
    diceNotation: "",
    setDiceNotation: vi.fn(),
    diceHistory: [],
    rollDiceNotation: vi.fn(),
    pluginsList: [],
    handleRollCharacterSheet: vi.fn(),
    handleEvaluateEncounterThreat: vi.fn(),
    handleInitiativeTracker: vi.fn(),
    handleEncounterBuilder: vi.fn(),
    currentChatMessages: [],
    chatInput: "",
    setChatInput: vi.fn(),
    handleSendChatMessage: vi.fn(),
    handleStopAgentStream: vi.fn(),
    handleApproveAgentTool: vi.fn(),
    handleRejectAgentTool: vi.fn(),
    pendingApproval: null,
    isAgentStreaming: false,
    contextItems: [],
    addContextItem: vi.fn(),
    removeContextItem: vi.fn(),
    notes: [],
    rules: [],
    renderMarkdown: vi.fn((md: string) => (
      <div data-testid="rendered-md">{md}</div>
    )),
    vaultPath: "/vault",
    resetCurrentVaultSession: vi.fn(),
    exportCurrentVaultSession: vi.fn(),
    cloneCurrentVaultSession: vi.fn(),
    sessionCloneTargetVaultPath: "",
    setSessionCloneTargetVaultPath: vi.fn(),
    vaults: [],
    memoryFacts: [],
    loadMemoryFacts: vi.fn(),
    addMemoryFact: vi.fn(),
    deleteMemoryFact: vi.fn(),
    isSummarizing: false,
    summaryText: "",
    handleSummarizeSession: vi.fn(),
    npcVoiceText: "",
    setNpcVoiceText: vi.fn(),
    npcVoiceName: "",
    setNpcVoiceName: vi.fn(),
    isSpeakingNpc: false,
    npcAudioUrl: "",
    handleSpeakAsNpc: vi.fn(),
    isGeneratingChatImage: false,
    chatImageUrl: "",
    handleGenerateChatImage: vi.fn(),
    imagePrompt: "",
    setImagePrompt: vi.fn(),
    imageStyle: "",
    setImageStyle: vi.fn(),
    imageQuality: "standard",
    setImageQuality: vi.fn(),
    imageFixedSeed: "",
    setImageFixedSeed: vi.fn(),
    isGeneratingImage: false,
    generatedImageUrl: "",
    handleGenerateImage: vi.fn(),
    ttsText: "",
    setTtsText: vi.fn(),
    ttsProvider: "",
    isGeneratingSpeech: false,
    generatedSpeechUrl: "",
    handleGenerateSpeech: vi.fn(),
    isTranscribing: false,
    transcribedText: "",
    handleTranscribeAudio: vi.fn(),
    backlinks: [],
    setSelectedNoteId: vi.fn(),
    captureTitle: "",
    setCaptureTitle: vi.fn(),
    captureContent: "",
    setCaptureContent: vi.fn(),
    captureUrl: "",
    setCaptureUrl: vi.fn(),
    captureSourceType: "history",
    setCaptureSourceType: vi.fn(),
    isClipping: false,
    clipResult: null,
    handleClipUrl: vi.fn(),
    handleSaveClipAsNote: vi.fn(),
    handleSaveCapture: vi.fn(),
    handleFileDrop: vi.fn(),
    ...overrides,
  };
}

describe("Capture Inbox", () => {
  it("renders the capture section with title, content, and URL inputs", () => {
    render(<RightDrawer {...makeProps()} />);
    expect(screen.getByText("Capture Inbox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Title (optional)")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Paste text, drop a file, or type a capture..."),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://... (clip a page)")).toBeInTheDocument();
  });

  it("calls handleSaveCapture when Save as note is clicked", () => {
    const handleSaveCapture = vi.fn();
    render(<RightDrawer {...makeProps({ handleSaveCapture })} />);
    fireEvent.click(screen.getByRole("button", { name: "Save as note" }));
    expect(handleSaveCapture).toHaveBeenCalled();
  });

  it("calls handleClipUrl when Clip is clicked", () => {
    const handleClipUrl = vi.fn();
    render(<RightDrawer {...makeProps({ handleClipUrl })} />);
    fireEvent.click(screen.getByRole("button", { name: "Clip" }));
    expect(handleClipUrl).toHaveBeenCalled();
  });

  it("shows clip result and save button when a clip is present", () => {
    const clip: WebClip = {
      title: "The Call of Cthulhu",
      site: "example.com",
      url: "https://example.com/cthulhu",
      markdown: "# The Call\n\nIn his house at R'lyeh...",
      fetched_at: "2026-01-01",
    };
    const handleSaveClipAsNote = vi.fn();
    render(
      <RightDrawer
        {...makeProps({ clipResult: clip, handleSaveClipAsNote })}
      />,
    );
    expect(screen.getByText("The Call of Cthulhu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save clip as note" }));
    expect(handleSaveClipAsNote).toHaveBeenCalled();
  });
});

describe("Architect chat markdown", () => {
  it("renders assistant messages through renderMarkdown", () => {
    const renderMarkdown = vi.fn((md: string) => (
      <div data-testid="rendered-md">{md}</div>
    ));
    render(
      <RightDrawer
        {...makeProps({
          tab: "ai",
          currentChatMessages: [
            { role: "assistant", text: "**bold** and `code`" },
          ],
          renderMarkdown,
        })}
      />,
    );
    expect(renderMarkdown).toHaveBeenCalledWith("**bold** and `code`");
    expect(screen.getByTestId("rendered-md")).toBeInTheDocument();
  });

  it("renders user messages as plain pre-wrapped text", () => {
    const renderMarkdown = vi.fn();
    render(
      <RightDrawer
        {...makeProps({
          tab: "ai",
          currentChatMessages: [{ role: "user", text: "plain user text" }],
          renderMarkdown,
        })}
      />,
    );
    expect(screen.getByText("plain user text")).toBeInTheDocument();
    expect(renderMarkdown).not.toHaveBeenCalled();
  });
});

describe("Tag Hierarchy tab", () => {
  it("renders the tag tree for notes with nested tags", () => {
    render(
      <RightDrawer
        {...makeProps({
          tab: "tags",
          notes: [
            {
              id: "n1",
              title: "Act 3 Opening",
              path: "Worldbuilding/Act_3.md",
              content: "# Act 3",
              frontmatter: { tags: ["campaign/arc1/act3"] },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText("Tag Hierarchy")).toBeInTheDocument();
    expect(screen.getByText("campaign")).toBeInTheDocument();
    expect(screen.getByText("arc1")).toBeInTheDocument();
    expect(screen.getByText("act3")).toBeInTheDocument();
    expect(screen.getByText("Act 3 Opening")).toBeInTheDocument();
  });

  it("calls setSelectedNoteId when a tag leaf note is clicked", () => {
    const setSelectedNoteId = vi.fn();
    render(
      <RightDrawer
        {...makeProps({
          tab: "tags",
          setSelectedNoteId,
          notes: [
            {
              id: "n1",
              title: "Boss",
              path: "Worldbuilding/Boss.md",
              content: "# Boss",
              frontmatter: { tags: ["npc"] },
            },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByText("Boss"));
    expect(setSelectedNoteId).toHaveBeenCalledWith("n1");
  });
});

describe("Backlinks tab preview", () => {
  it("shows a preview snippet when hovering a backlink row", () => {
    const backlinks = [
      {
        id: "n2",
        title: "The City",
        path: "Worldbuilding/The_City.md",
        content: "A sprawling port city at the edge of the bay.",
        frontmatter: {},
      },
    ];
    render(
      <RightDrawer
        {...makeProps({
          tab: "backlinks",
          backlinks,
        })}
      />,
    );

    expect(screen.getByText("Incoming Backlinks")).toBeInTheDocument();
    expect(screen.queryByTestId("note-preview")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("The City"));
    expect(screen.getByTestId("note-preview")).toBeInTheDocument();
    expect(screen.getByText(/sprawling port city/)).toBeInTheDocument();
  });
});
