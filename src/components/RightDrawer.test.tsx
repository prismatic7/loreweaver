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
