import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RulesView, RulesViewProps } from "./RulesView";
import { RuleEntry } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => []),
}));

vi.mock("./MarkdownEditor", () => ({
  default: () => <div data-testid="mock-markdown-editor" />,
}));

const mockRules: RuleEntry[] = [
  {
    id: "rule-1",
    title: "Advantage and Disadvantage",
    path: "Rules/Advantage.md",
    category: "Mechanics",
    source: "Core Rules",
    content: "Roll twice and take the higher result.",
  },
];

const rulesByFolder: Record<string, RuleEntry[]> = {
  Rules: mockRules,
};

function makeProps(overrides: Partial<RulesViewProps> = {}): RulesViewProps {
  return {
    rulesByFolder,
    collapsedFolders: {},
    setCollapsedFolders: vi.fn(),
    setContextMenu: vi.fn(),
    activeFolderDropdown: null,
    setActiveFolderDropdown: vi.fn(),
    renderFolderDropdown: () => null,
    selectedRuleId: "",
    setSelectedRuleId: vi.fn(),
    isEditingRule: false,
    setIsEditingRule: vi.fn(),
    handleNewRule: vi.fn(),
    handleNewRuleFolder: vi.fn(),
    handleInsertRuleImage: vi.fn(),
    handleDeleteRule: vi.fn(),
    editRuleTitle: "",
    setEditRuleTitle: vi.fn(),
    editRulePath: "",
    setEditRulePath: vi.fn(),
    editRuleCategory: "",
    setEditRuleCategory: vi.fn(),
    editRuleSource: "",
    setEditRuleSource: vi.fn(),
    editRuleContent: "",
    setEditRuleContent: vi.fn(),
    currentRule: undefined,
    renderMarkdown: (content: string) => <div>{content}</div>,
    ...overrides,
  };
}

describe("RulesView Component", () => {
  it("renders rule folders and their rules", () => {
    render(<RulesView {...makeProps()} />);

    expect(screen.getByText("Rules")).toBeInTheDocument();
    expect(screen.getByText("Advantage and Disadvantage")).toBeInTheDocument();
  });

  it("creates a new rule via the New Rule button", () => {
    const handleNewRule = vi.fn();
    render(<RulesView {...makeProps({ handleNewRule })} />);

    fireEvent.click(screen.getByText("New Rule"));
    expect(handleNewRule).toHaveBeenCalledTimes(1);
  });

  it("creates a new rulebook folder via the Folder button", () => {
    const handleNewRuleFolder = vi.fn();
    render(<RulesView {...makeProps({ handleNewRuleFolder })} />);

    fireEvent.click(screen.getByText("Folder"));
    expect(handleNewRuleFolder).toHaveBeenCalledTimes(1);
  });

  it("selects a rule and switches to preview", () => {
    const setSelectedRuleId = vi.fn();
    const setIsEditingRule = vi.fn();
    render(
      <RulesView
        {...makeProps({ setSelectedRuleId, setIsEditingRule })}
      />,
    );

    fireEvent.click(screen.getByText("Advantage and Disadvantage"));
    expect(setSelectedRuleId).toHaveBeenCalledWith("rule-1");
    expect(setIsEditingRule).toHaveBeenCalledWith(false);
  });

  it("deletes the selected rule via the Trash Rule button", () => {
    const handleDeleteRule = vi.fn();
    render(
      <RulesView
        {...makeProps({
          selectedRuleId: "rule-1",
          currentRule: mockRules[0],
          handleDeleteRule,
        })}
      />,
    );

    fireEvent.click(screen.getByText("Trash Rule"));
    expect(handleDeleteRule).toHaveBeenCalledWith("rule-1");
  });

  it("renders rule metadata and allows editing the title", () => {
    const setEditRuleTitle = vi.fn();
    render(
      <RulesView
        {...makeProps({
          isEditingRule: true,
          currentRule: mockRules[0],
          editRuleTitle: "Advantage and Disadvantage",
          editRulePath: "Rules/Advantage.md",
          editRuleCategory: "Mechanics",
          editRuleSource: "Core Rules",
          setEditRuleTitle,
        })}
      />,
    );

    const titleInput = screen.getByPlaceholderText("Untitled Rule");
    expect(titleInput).toHaveValue("Advantage and Disadvantage");

    fireEvent.change(titleInput, { target: { value: "Advantage" } });
    expect(setEditRuleTitle).toHaveBeenCalledWith("Advantage");

    expect(screen.getByDisplayValue("Rules/Advantage.md")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Mechanics")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Core Rules")).toBeInTheDocument();
  });
});
