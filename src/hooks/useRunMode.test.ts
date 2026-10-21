import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRunMode } from "./useRunMode";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useRunMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads run state on mount", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_run_state") {
        return { scene_note_id: "n1", pinned_rule_ids: ["r1", "r2"] };
      }
      return null;
    });
    const { result } = renderHook(() => useRunMode("/vault"));

    await waitFor(() =>
      expect(result.current.runState.scene_note_id).toBe("n1"),
    );
    expect(result.current.runState.pinned_rule_ids).toEqual(["r1", "r2"]);
  });

  it("sets the scene via set_run_state", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_run_state") {
        return { scene_note_id: null, pinned_rule_ids: [] };
      }
      return null;
    });
    const { result } = renderHook(() => useRunMode("/vault"));
    await waitFor(() => expect(result.current.runState.scene_note_id).toBeNull());

    await act(async () => {
      await result.current.setScene("n5");
    });
    expect(invoke).toHaveBeenCalledWith("set_run_state", {
      key: "scene_note_id",
      value: "n5",
    });
    expect(result.current.runState.scene_note_id).toBe("n5");
  });

  it("sets pinned rules as a JSON array", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "get_run_state") {
        return { scene_note_id: null, pinned_rule_ids: [] };
      }
      return null;
    });
    const { result } = renderHook(() => useRunMode("/vault"));
    await waitFor(() => expect(result.current.runState.pinned_rule_ids).toEqual([]));

    await act(async () => {
      await result.current.setPinnedRules(["r1", "r3"]);
    });
    expect(invoke).toHaveBeenCalledWith("set_run_state", {
      key: "pinned_rule_ids",
      value: JSON.stringify(["r1", "r3"]),
    });
    expect(result.current.runState.pinned_rule_ids).toEqual(["r1", "r3"]);
  });
});
