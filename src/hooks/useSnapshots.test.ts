import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSnapshots } from "./useSnapshots";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const SNAPSHOT = {
  id: "20261021T120000",
  label: "Before session 4",
  created_at: 1_790_000_000,
  size_bytes: 40_960,
  file_count: 12,
  vault: "eldoria",
};

describe("useSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists snapshots on mount", async () => {
    vi.mocked(invoke).mockResolvedValue([SNAPSHOT]);
    const { result } = renderHook(() => useSnapshots("/vault"));

    await waitFor(() => expect(result.current.snapshots).toHaveLength(1));
    expect(invoke).toHaveBeenCalledWith("list_snapshots");
    expect(result.current.snapshots[0].label).toBe("Before session 4");
  });

  it("does not call the backend when no vault is open", async () => {
    renderHook(() => useSnapshots(""));
    await waitFor(() => expect(invoke).not.toHaveBeenCalled());
  });

  it("creates a snapshot with a trimmed label and refreshes the list", async () => {
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "list_snapshots") return [SNAPSHOT];
      if (cmd === "create_snapshot") return SNAPSHOT;
      throw new Error(`unexpected command ${cmd}`);
    }) as never);

    const { result } = renderHook(() => useSnapshots("/vault"));
    await waitFor(() => expect(result.current.snapshots).toHaveLength(1));

    await act(async () => {
      const info = await result.current.create("  Before session 4  ");
      expect(info?.id).toBe(SNAPSHOT.id);
    });

    expect(invoke).toHaveBeenCalledWith("create_snapshot", {
      label: "Before session 4",
    });
    // create() refreshes the list, so the list command runs again.
    expect(
      vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "list_snapshots"),
    ).toHaveLength(2);
  });

  it("sends null rather than an empty label", async () => {
    vi.mocked(invoke).mockResolvedValue(SNAPSHOT);
    const { result } = renderHook(() => useSnapshots("/vault"));

    await act(async () => {
      await result.current.create("   ");
    });

    expect(invoke).toHaveBeenCalledWith("create_snapshot", { label: null });
  });

  it("loads a diff for the selected snapshot and keeps the selection", async () => {
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "list_snapshots") return [SNAPSHOT];
      if (cmd === "snapshot_diff") {
        return [{ path: "Worldbuilding/Oslo.md", kind: "modified" }];
      }
      throw new Error(`unexpected command ${cmd}`);
    }) as never);

    const { result } = renderHook(() => useSnapshots("/vault"));
    await waitFor(() => expect(result.current.snapshots).toHaveLength(1));

    await act(async () => {
      await result.current.diff(SNAPSHOT.id);
    });

    expect(invoke).toHaveBeenCalledWith("snapshot_diff", { id: SNAPSHOT.id });
    expect(result.current.selectedId).toBe(SNAPSHOT.id);
    expect(result.current.changes).toEqual([
      { path: "Worldbuilding/Oslo.md", kind: "modified" },
    ]);
  });

  it("reports a failed restore as an error instead of throwing", async () => {
    vi.mocked(invoke).mockImplementation((async (cmd: string) => {
      if (cmd === "list_snapshots") return [SNAPSHOT];
      if (cmd === "restore_note_from_snapshot") {
        throw "Security Violation: Attempted directory traversal";
      }
      throw new Error(`unexpected command ${cmd}`);
    }) as never);

    const { result } = renderHook(() => useSnapshots("/vault"));
    await waitFor(() => expect(result.current.snapshots).toHaveLength(1));

    let ok = true;
    await act(async () => {
      ok = await result.current.restore(SNAPSHOT.id, "../escape.md");
    });

    expect(ok).toBe(false);
    expect(result.current.error).toContain("traversal");
    expect(invoke).toHaveBeenCalledWith("restore_note_from_snapshot", {
      id: SNAPSHOT.id,
      path: "../escape.md",
    });
  });

  it("clears the selection when the vault changes", async () => {
    vi.mocked(invoke).mockResolvedValue([SNAPSHOT]);
    const { result, rerender } = renderHook(
      ({ vault }: { vault: string }) => useSnapshots(vault),
      { initialProps: { vault: "/vault-a" } },
    );
    await waitFor(() => expect(result.current.snapshots).toHaveLength(1));

    await act(async () => {
      await result.current.diff(SNAPSHOT.id);
    });
    expect(result.current.selectedId).toBe(SNAPSHOT.id);

    rerender({ vault: "/vault-b" });
    await waitFor(() => expect(result.current.selectedId).toBeNull());
    expect(result.current.changes).toEqual([]);
  });
});
