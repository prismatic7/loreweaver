import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCrossWorldSearch } from "./useCrossWorldSearch";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const HIT = {
  world: "Eldoria",
  world_id: "eldoria",
  world_path: "/campaigns/eldoria",
  path: "Characters/Vex.md",
  title: "Vex",
  tags: ["captain"],
  kind: "title",
  score: 1,
};

describe("useCrossWorldSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not search on an empty query", async () => {
    const { result } = renderHook(() => useCrossWorldSearch(10));
    await act(async () => {
      result.current.search("   ");
    });
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.hits).toEqual([]);
  });

  it("debounces, then runs structural before semantic", async () => {
    vi.mocked(invoke).mockImplementation((async (_cmd: string, args: any) => {
      if (args.semantic) {
        return {
          hits: [{ ...HIT, kind: "semantic", score: 0.7 }],
          semantic_used: true,
          worlds_scanned: 2,
        };
      }
      return { hits: [HIT], semantic_used: false, worlds_scanned: 2 };
    }) as never);

    const { result } = renderHook(() => useCrossWorldSearch(100));

    // Three keystrokes inside the debounce window issue one round, not three.
    await act(async () => {
      result.current.search("v");
      result.current.search("ve");
      result.current.search("vex");
      vi.advanceTimersByTime(120);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const calls = vi.mocked(invoke).mock.calls;
    expect(calls[0]).toEqual([
      "search_all_worlds",
      { query: "vex", semantic: false },
    ]);
    expect(calls[1]).toEqual([
      "search_all_worlds",
      { query: "vex", semantic: true },
    ]);
    expect(result.current.semanticUsed).toBe(true);
    expect(result.current.worldsScanned).toBe(2);
  });

  it("reports titles-and-tags-only when the semantic pass was skipped", async () => {
    vi.mocked(invoke).mockResolvedValue({
      hits: [HIT],
      semantic_used: false,
      worlds_scanned: 3,
    });

    const { result } = renderHook(() => useCrossWorldSearch(10));
    await act(async () => {
      result.current.search("vex");
      vi.advanceTimersByTime(20);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.semanticUsed).toBe(false);
    expect(result.current.hits).toHaveLength(1);
  });

  it("clears results and pending work", async () => {
    vi.mocked(invoke).mockResolvedValue({ hits: [HIT], semantic_used: true, worlds_scanned: 1 });
    const { result } = renderHook(() => useCrossWorldSearch(10));

    await act(async () => {
      result.current.search("vex");
      vi.advanceTimersByTime(20);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.hits).toHaveLength(1);

    act(() => result.current.clear());
    expect(result.current.hits).toEqual([]);
    expect(result.current.semanticUsed).toBe(false);
  });

  it("surfaces a backend failure as an error with no hits", async () => {
    vi.mocked(invoke).mockRejectedValue("campaigns root missing");
    const { result } = renderHook(() => useCrossWorldSearch(10));

    await act(async () => {
      result.current.search("vex");
      vi.advanceTimersByTime(20);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toContain("campaigns root missing");
    expect(result.current.hits).toEqual([]);
  });
});
