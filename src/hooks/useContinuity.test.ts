import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useContinuity } from "./useContinuity";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("useContinuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the audit on mount and stores the report", async () => {
    vi.mocked(invoke).mockResolvedValue({
      entities: [{ id: "e1", name: "Vex", aliases: [], note_ids: [] }],
      findings: [],
    });
    const { result } = renderHook(() => useContinuity("/vault"));

    await waitFor(() => expect(result.current.report).not.toBeNull());
    expect(invoke).toHaveBeenCalledWith("audit_continuity");
    expect(result.current.report?.entities).toHaveLength(1);
  });

  it("re-runs the audit on demand", async () => {
    vi.mocked(invoke).mockResolvedValue({ entities: [], findings: [] });
    const { result } = renderHook(() => useContinuity("/vault"));
    await waitFor(() => expect(result.current.report).not.toBeNull());

    vi.clearAllMocks();
    await act(async () => {
      await result.current.runAudit();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
