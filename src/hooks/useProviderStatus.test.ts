import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useProviderStatus } from "./useProviderStatus";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useProviderStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports reachable with models available", async () => {
    vi.mocked(invoke).mockResolvedValue(["model-a", "model-b"]);
    const { result } = renderHook(() =>
      useProviderStatus("ollama", "http://localhost:11434", ""),
    );

    await waitFor(() => expect(result.current.reachable).toBe(true), {
      timeout: 2000,
    });
    expect(result.current.modelAvailable).toBe(true);
    expect(result.current.checking).toBe(false);
  });

  it("reports unreachable when the connection test throws", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("connection refused"));
    const { result } = renderHook(() =>
      useProviderStatus("ollama", "http://localhost:11434", ""),
    );

    await waitFor(() => expect(result.current.checking).toBe(false), {
      timeout: 2000,
    });
    expect(result.current.reachable).toBe(false);
    expect(result.current.modelAvailable).toBe(false);
  });
});
