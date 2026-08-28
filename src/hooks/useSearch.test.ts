import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSearch } from "./useSearch";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe("useSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns results and flags expanded queries from the SearchResponse", async () => {
    invokeMock.mockResolvedValue({
      results: [
        {
          type: "note",
          title: "Campaign Notes",
          snippet: "The campaign spans the eastern reaches.",
          score: 0.42,
          path: "Worldbuilding/CampaignNotes.md",
        },
      ],
      expanded: true,
    });

    const { result } = renderHook(() => useSearch([], []));

    await act(async () => {
      result.current.setSearchQuery("campain");
    });

    await waitFor(() => {
      expect(result.current.searchResults).toHaveLength(1);
    });
    expect(result.current.searchResults[0].title).toBe("Campaign Notes");
    expect(result.current.searchExpanded).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("search_vault", {
      query: "campain",
      category: "all",
    });
  });

  it("clears results and resets the expansion flag on an empty query", async () => {
    invokeMock.mockResolvedValue({
      results: [
        {
          type: "note",
          title: "Campaign Notes",
          snippet: "snippet",
          score: 0.42,
          path: "Worldbuilding/CampaignNotes.md",
        },
      ],
      expanded: true,
    });

    const { result } = renderHook(() => useSearch([], []));

    await act(async () => {
      result.current.setSearchQuery("campain");
    });
    await waitFor(() => {
      expect(result.current.searchResults).toHaveLength(1);
    });

    await act(async () => {
      result.current.setSearchQuery("");
    });

    await waitFor(() => {
      expect(result.current.searchResults).toHaveLength(0);
    });
    expect(result.current.searchExpanded).toBe(false);
  });
});
