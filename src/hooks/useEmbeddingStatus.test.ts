import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEmbeddingStatus } from "./useEmbeddingStatus";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useEmbeddingStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts pessimistic, then reports the engine as ready", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    const { result } = renderHook(() => useEmbeddingStatus());

    // The first render cannot promise semantic search before the probe answers.
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(invoke).toHaveBeenCalledWith("search_engine_ready");
  });

  it("stays false while the embedding model is unavailable", async () => {
    vi.mocked(invoke).mockResolvedValue(false);
    const { result } = renderHook(() => useEmbeddingStatus());

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it("treats a failed probe as not ready rather than guessing", async () => {
    vi.mocked(invoke).mockRejectedValue("no such command");
    const { result } = renderHook(() => useEmbeddingStatus());

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
