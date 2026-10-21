import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useRelatedNotes } from "./useRelatedNotes";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useRelatedNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads related notes for the given note", async () => {
    vi.mocked(invoke).mockResolvedValue([
      { note_id: "n2", title: "Vex", path: "Worldbuilding/Vex.md", score: 0.82 },
    ]);
    const { result } = renderHook(() => useRelatedNotes("n1", 5));

    await waitFor(() => expect(result.current.related).toHaveLength(1));
    expect(invoke).toHaveBeenCalledWith("nearest_notes", { noteId: "n1", k: 5 });
    expect(result.current.related[0].title).toBe("Vex");
  });

  it("clears results when there is no note", async () => {
    const { result } = renderHook(() => useRelatedNotes(undefined));
    await waitFor(() => expect(result.current.related).toEqual([]));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("swallows errors and returns an empty list", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("no cache"));
    const { result } = renderHook(() => useRelatedNotes("n1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.related).toEqual([]);
  });
});
