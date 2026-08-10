import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiminalView } from "./LiminalView";
import { CampaignNote, WorldInfo } from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
const mockInvoke = vi.mocked(invoke);

function makeNote(overrides: Partial<CampaignNote> = {}): CampaignNote {
  return {
    id: "_liminal/Captures/Idea.md",
    title: "Idea",
    path: "_liminal/Captures/Idea.md",
    frontmatter: { type: "Capture" },
    content: "",
    ...overrides,
  };
}

function makeWorld(overrides: Partial<WorldInfo> = {}): WorldInfo {
  return {
    id: "fate",
    name: "FATE",
    description: "A 2003 espionage-horror world",
    icon: "",
    path: "/campaigns/FATE",
    last_opened: null,
    ...overrides,
  };
}

describe("LiminalView", () => {
  const worlds = [makeWorld()];

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue([]);
  });

  it("renders the empty state when there are no liminal notes", async () => {
    render(
      <LiminalView
        worlds={worlds}
        onMakeWorldFromLiminal={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(mockInvoke).toHaveBeenCalledWith("list_liminal_notes");
    expect(
      await screen.findByText("The Liminal is empty"),
    ).toBeInTheDocument();
  });

  it("lists liminal notes and lets the user claim one into a world", async () => {
    mockInvoke.mockResolvedValueOnce([makeNote()]);
    mockInvoke.mockResolvedValueOnce(undefined); // claim_liminal_note
    mockInvoke.mockResolvedValueOnce([]); // refresh after claim

    render(
      <LiminalView
        worlds={worlds}
        onMakeWorldFromLiminal={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Idea")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Claim Idea into world" }),
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("claim_liminal_note", {
        notePath: "_liminal/Captures/Idea.md",
        targetWorldPath: "/campaigns/FATE",
      });
    });
  });

  it("births a new world from liminal captures", async () => {
    mockInvoke.mockResolvedValueOnce([makeNote()]);
    const onMakeWorldFromLiminal = vi.fn().mockResolvedValue(undefined);
    mockInvoke.mockResolvedValueOnce([]); // refresh after birth

    render(
      <LiminalView
        worlds={worlds}
        onMakeWorldFromLiminal={onMakeWorldFromLiminal}
        onClose={vi.fn()}
      />,
    );

    await screen.findByText("Idea");

    fireEvent.change(screen.getByPlaceholderText(/birth a new world/i), {
      target: { value: "NewWorld" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Birth world from liminal captures" }),
    );

    await waitFor(() => {
      expect(onMakeWorldFromLiminal).toHaveBeenCalledWith("NewWorld");
    });
  });

  it("calls onClose when the back button is pressed", async () => {
    const onClose = vi.fn();
    render(
      <LiminalView
        worlds={worlds}
        onMakeWorldFromLiminal={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /back to the shelf/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error when listing liminal notes fails", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("boom"));

    render(
      <LiminalView
        worlds={worlds}
        onMakeWorldFromLiminal={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
  });
});
