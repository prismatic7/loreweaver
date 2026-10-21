import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUndo } from "./useUndo";

describe("useUndo", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useUndo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("pushes, undoes, and redoes an entry", async () => {
    const undoFn = vi.fn().mockResolvedValue(undefined);
    const redoFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useUndo());

    act(() => {
      result.current.pushUndo({ label: "Rename", undo: undoFn, redo: redoFn });
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.undoLabel).toBe("Rename");

    await act(async () => {
      await result.current.undo();
    });
    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    await act(async () => {
      await result.current.redo();
    });
    expect(redoFn).toHaveBeenCalledTimes(1);
    expect(result.current.canUndo).toBe(true);
  });

  it("coalesces consecutive entries with the same key", () => {
    const { result } = renderHook(() => useUndo());
    act(() => {
      result.current.pushUndo({ label: "Rename 1", key: "r:1", undo: vi.fn(), redo: vi.fn() });
      result.current.pushUndo({ label: "Rename 2", key: "r:1", undo: vi.fn(), redo: vi.fn() });
    });
    // Only one entry survives, with the latest label.
    expect(result.current.undoLabel).toBe("Rename 2");
  });

  it("clears redo when a new entry is pushed", async () => {
    const { result } = renderHook(() => useUndo());
    act(() => {
      result.current.pushUndo({ label: "A", undo: vi.fn(), redo: vi.fn() });
    });
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);
    act(() => {
      result.current.pushUndo({ label: "B", undo: vi.fn(), redo: vi.fn() });
    });
    expect(result.current.canRedo).toBe(false);
  });

  it("bounds the stack to the max size", () => {
    const { result } = renderHook(() => useUndo(3));
    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.pushUndo({
          label: `Op ${i}`,
          undo: vi.fn(),
          redo: vi.fn(),
        });
      });
    }
    expect(result.current.undoLabel).toBe("Op 4");
  });
});
