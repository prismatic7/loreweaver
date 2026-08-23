import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AiView, AiViewProps } from "./AiView";
import type { ChatMessage } from "../hooks/useAgent";
import type { ContextItem, PendingToolApproval } from "../bindings";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    onmessage: (event: unknown) => void = () => {};
  },
}));

function makeProps(overrides: Partial<AiViewProps> = {}): AiViewProps {
  return {
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
    renderMarkdown: (md: string) => <div data-testid="rendered-md">{md}</div>,
    sessionTemperature: null,
    setSessionTemperature: vi.fn(),
    defaultTemperature: 0.8,
    ...overrides,
  };
}

describe("AiView", () => {
  it("renders the header and input", () => {
    render(<AiView {...makeProps()} />);
    expect(screen.getByText("Campaign Architect")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ask the Campaign Architect..."),
    ).toBeInTheDocument();
  });

  it("shows a stop button while streaming and calls handleStopAgentStream", () => {
    const handleStopAgentStream = vi.fn();
    render(
      <AiView
        {...makeProps({
          isAgentStreaming: true,
          handleStopAgentStream,
        })}
      />,
    );
    const stop = screen.getByRole("button", { name: "Stop generating" });
    fireEvent.click(stop);
    expect(handleStopAgentStream).toHaveBeenCalled();
  });

  it("renders reasoning and tool blocks for a streaming assistant message", () => {
    const msg: ChatMessage = {
      role: "assistant",
      text: "The goblin rolls poorly.",
      reasoning: "Let me think about the goblin's odds...",
      toolCalls: [
        {
          id: "tc1",
          name: "roll_dice",
          arguments: '{"notation":"2d6"}',
          result: "2d6 → [3, 5] = 8",
        },
      ],
      isStreaming: false,
    };
    render(<AiView {...makeProps({ currentChatMessages: [msg] })} />);

    // Reasoning block is collapsed by default; expand it.
    fireEvent.click(screen.getByRole("button", { name: /Thinking/ }));
    expect(
      screen.getByText("Let me think about the goblin's odds..."),
    ).toBeInTheDocument();

    // Tool block is collapsed by default; expand it.
    fireEvent.click(screen.getByRole("button", { name: /Tools/ }));
    expect(screen.getByText("roll_dice")).toBeInTheDocument();
    expect(screen.getByText('{"notation":"2d6"}')).toBeInTheDocument();
    expect(screen.getByText("2d6 → [3, 5] = 8")).toBeInTheDocument();
  });

  it("renders context chips and removes them", () => {
    const removeContextItem = vi.fn();
    const items: ContextItem[] = [
      {
        kind: "note",
        id: "n1",
        title: "Goblin Lair",
        content: "A damp cave.",
      },
    ];
    render(
      <AiView
        {...makeProps({
          contextItems: items,
          removeContextItem,
        })}
      />,
    );
    expect(screen.getByText("Goblin Lair")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Goblin Lair from context" }),
    );
    expect(removeContextItem).toHaveBeenCalledWith("n1");
  });

  it("opens the add-context picker and attaches a note", () => {
    const addContextItem = vi.fn();
    render(
      <AiView
        {...makeProps({
          notes: [{ id: "n1", title: "Goblin Lair", content: "A damp cave." }],
          addContextItem,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Context" }));
    fireEvent.click(screen.getByRole("button", { name: "Goblin Lair" }));
    expect(addContextItem).toHaveBeenCalledWith({
      kind: "note",
      id: "n1",
      title: "Goblin Lair",
      content: "A damp cave.",
    });
  });

  it("opens the add-context picker and attaches a rule", () => {
    const addContextItem = vi.fn();
    render(
      <AiView
        {...makeProps({
          rules: [{ id: "r1", title: "Sanity", content: "Sanity erodes." }],
          addContextItem,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Context" }));
    fireEvent.click(screen.getByRole("button", { name: "Sanity" }));
    expect(addContextItem).toHaveBeenCalledWith({
      kind: "rule",
      id: "r1",
      title: "Sanity",
      content: "Sanity erodes.",
    });
  });

  it("shows the approval banner and approves a pending tool call", () => {
    const handleApproveAgentTool = vi.fn();
    const pendingApproval: PendingToolApproval = {
      run_id: "run-1",
      tool_call_id: "call-1",
      name: "save_note",
      arguments: '{"path":"notes/goblin.md"}',
      summary: "save_note → notes/goblin.md",
    };
    render(
      <AiView
        {...makeProps({
          pendingApproval,
          handleApproveAgentTool,
        })}
      />,
    );
    expect(
      screen.getByText("The agent wants to write to your vault"),
    ).toBeInTheDocument();
    expect(screen.getByText("save_note → notes/goblin.md")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(handleApproveAgentTool).toHaveBeenCalled();
  });

  it("rejects a pending tool call from the approval banner", () => {
    const handleRejectAgentTool = vi.fn();
    const pendingApproval: PendingToolApproval = {
      run_id: "run-1",
      tool_call_id: "call-1",
      name: "save_note",
      arguments: '{"path":"notes/goblin.md"}',
      summary: "save_note → notes/goblin.md",
    };
    render(
      <AiView
        {...makeProps({
          pendingApproval,
          handleRejectAgentTool,
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(handleRejectAgentTool).toHaveBeenCalled();
  });
});
