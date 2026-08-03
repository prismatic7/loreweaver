import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DashboardView } from "./DashboardView";
import { CampaignNote, RuleEntry } from "../types";

describe("DashboardView Component", () => {
  const mockNotes: CampaignNote[] = [
    {
      id: "note-1",
      title: "Ancient Ruins",
      path: "World/Ancient Ruins.md",
      frontmatter: { type: "Location" },
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

  const mockRules: RuleEntry[] = [
    {
      id: "rule-1",
      title: "Advantage and Disadvantage",
      path: "Rules/Advantage.md",
      category: "Mechanics",
      source: "Core Rules",
      content: "Roll twice...",
    },
  ];

  it("renders workspace counts and recent notes", () => {
    render(
      <DashboardView
        notes={mockNotes}
        rules={mockRules}
        setActiveView={vi.fn()}
        setSelectedNoteId={vi.fn()}
      />
    );

    expect(screen.getByText("Campaign Workspace")).toBeInTheDocument();
    expect(screen.getByText(/2 notes/)).toBeInTheDocument();
    expect(screen.getByText(/1 rule guides/)).toBeInTheDocument();

    expect(screen.getByText("Ancient Ruins")).toBeInTheDocument();
    expect(screen.getByText("Location")).toBeInTheDocument();
    expect(screen.getByText("Elira the Sage")).toBeInTheDocument();
    expect(screen.getByText("NPC")).toBeInTheDocument();
  });

  it("handles navigation buttons and card clicks", () => {
    const setActiveView = vi.fn();
    const setSelectedNoteId = vi.fn();

    render(
      <DashboardView
        notes={mockNotes}
        rules={mockRules}
        setActiveView={setActiveView}
        setSelectedNoteId={setSelectedNoteId}
      />
    );

    const openVaultBtn = screen.getByText("Open Vault");
    fireEvent.click(openVaultBtn);
    expect(setActiveView).toHaveBeenCalledWith("vault");

    const askArchitectBtn = screen.getByText("Ask Architect");
    fireEvent.click(askArchitectBtn);
    expect(setActiveView).toHaveBeenCalledWith("ai");

    const rulesCard = screen.getByText("Rule Entries");
    fireEvent.click(rulesCard.closest(".dash-card")!);
    expect(setActiveView).toHaveBeenCalledWith("rules");

    const noteItem = screen.getByText("Ancient Ruins");
    fireEvent.click(noteItem.closest(".dash-recent-item")!);
    expect(setActiveView).toHaveBeenCalledWith("vault");
    expect(setSelectedNoteId).toHaveBeenCalledWith("note-1");
  });
});
