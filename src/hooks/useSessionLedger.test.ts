import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSessionLedger } from "./useSessionLedger";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useSessionLedger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accumulates events and advances the since cursor across polls", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "list_session_events") {
        if (args?.since === 0) {
          return [{ id: "e1", kind: "dice_roll", payload: "{}", created_at: 1000 }];
        }
        if (args?.since === 1000) {
          return [{ id: "e2", kind: "note_saved", payload: "{}", created_at: 2000 }];
        }
        return [];
      }
      return null;
    });

    // Long interval so the auto-tick does not fire during the test.
    const { result } = renderHook(() => useSessionLedger("/vault", 100_000_000));

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(invoke).toHaveBeenCalledWith("list_session_events", { since: 0 });

    // Simulate the next poll; the cursor should now be 1000.
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.events).toHaveLength(2);
    expect(result.current.events.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(invoke).toHaveBeenCalledWith("list_session_events", { since: 1000 });
  });

  it("logs an event then refreshes", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_session_events") return [];
      if (cmd === "log_session_event") return "e3";
      return null;
    });

    const { result } = renderHook(() => useSessionLedger("/vault", 100_000_000));

    await act(async () => {
      await result.current.logEvent("scene_changed", '{"scene":"Tavern"}');
    });

    expect(invoke).toHaveBeenCalledWith("log_session_event", {
      kind: "scene_changed",
      payload: '{"scene":"Tavern"}',
    });
  });
});
