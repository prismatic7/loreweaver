import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useInitiative } from "./useInitiative";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useInitiative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads combat state from the initiative-tracker plugin", async () => {
    vi.mocked(invoke).mockResolvedValue(
      JSON.stringify({ round: 1, combatants: [{ name: "A", initiative: 10 }] }),
    );
    const { result } = renderHook(() => useInitiative("/vault", 100_000_000));

    await waitFor(() => expect(result.current.hasPlugin).toBe(true));
    expect(result.current.state).toContain("combatants");
    expect(invoke).toHaveBeenCalledWith("execute_plugin_hook", {
      pluginId: "initiative-tracker",
      hook: "get_combat_state",
      payload: "{}",
    });
  });

  it("reports no plugin when the hook fails", async () => {
    vi.mocked(invoke).mockRejectedValue(
      new Error("Plugin initiative-tracker not active"),
    );
    const { result } = renderHook(() => useInitiative("/vault", 100_000_000));

    await waitFor(() => expect(result.current.hasPlugin).toBe(false));
    expect(result.current.state).toBeNull();
  });
});
