import { useState, useCallback } from "react";

/**
 * A bounded, async undo/redo store.
 *
 * Entries are `{ label, key?, undo, redo }`. `key` coalesces consecutive entries
 * (e.g. repeated renames of the same note collapse into one), and pushing a new
 * entry clears the redo stack. The stack is capped at `max` entries (default 50).
 */
export interface UndoEntry {
  label: string;
  /** Optional coalescing key — consecutive entries with the same key merge. */
  key?: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export interface UndoStore {
  pushUndo: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
}

export function useUndo(max = 50): UndoStore {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  const pushUndo = useCallback(
    (entry: UndoEntry) => {
      setUndoStack((prev) => {
        const next = [...prev];
        const top = next[next.length - 1];
        if (entry.key && top?.key === entry.key) {
          next[next.length - 1] = entry;
        } else {
          next.push(entry);
        }
        return next.slice(-max);
      });
      setRedoStack([]);
    },
    [max],
  );

  const undo = useCallback(async () => {
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    await entry.undo();
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, entry]);
  }, [undoStack]);

  const redo = useCallback(async () => {
    const entry = redoStack[redoStack.length - 1];
    if (!entry) return;
    await entry.redo();
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, entry]);
  }, [redoStack]);

  return {
    pushUndo,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoLabel: undoStack[undoStack.length - 1]?.label ?? "",
    redoLabel: redoStack[redoStack.length - 1]?.label ?? "",
  };
}
