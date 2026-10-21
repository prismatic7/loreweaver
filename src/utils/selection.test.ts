import { describe, it, expect } from "vitest";
import {
  applySelection,
  clearSelection,
  pruneSelection,
  EMPTY_SELECTION,
} from "./selection";

const ORDER = ["a", "b", "c", "d", "e"];

describe("applySelection", () => {
  it("selects one note on a plain click and anchors it", () => {
    const state = applySelection(EMPTY_SELECTION, ORDER, "c");
    expect(state).toEqual({ ids: ["c"], anchor: "c" });
  });

  it("replaces the selection on a second plain click", () => {
    const first = applySelection(EMPTY_SELECTION, ORDER, "a");
    const second = applySelection(first, ORDER, "d");
    expect(second.ids).toEqual(["d"]);
  });

  it("toggles a note with ⌘/Ctrl and keeps the others", () => {
    const first = applySelection(EMPTY_SELECTION, ORDER, "a");
    const added = applySelection(first, ORDER, "c", { meta: true });
    expect(added.ids).toEqual(["a", "c"]);
    // The meta-clicked note becomes the new anchor.
    expect(added.anchor).toBe("c");

    const removed = applySelection(added, ORDER, "a", { meta: true });
    expect(removed.ids).toEqual(["c"]);
  });

  it("selects an inclusive range with ⇧", () => {
    const anchored = applySelection(EMPTY_SELECTION, ORDER, "b");
    const ranged = applySelection(anchored, ORDER, "d", { shift: true });
    expect(ranged.ids).toEqual(["b", "c", "d"]);
    expect(ranged.anchor).toBe("b");
  });

  it("ranges backwards when the click is above the anchor", () => {
    const anchored = applySelection(EMPTY_SELECTION, ORDER, "d");
    const ranged = applySelection(anchored, ORDER, "b", { shift: true });
    expect(ranged.ids).toEqual(["b", "c", "d"]);
  });

  it("re-ranges from the same anchor on a second ⇧-click", () => {
    const anchored = applySelection(EMPTY_SELECTION, ORDER, "b");
    const first = applySelection(anchored, ORDER, "e", { shift: true });
    const second = applySelection(first, ORDER, "c", { shift: true });
    expect(second.ids).toEqual(["b", "c"]);
    expect(second.anchor).toBe("b");
  });

  it("falls back to a plain selection when there is no anchor", () => {
    const state = applySelection(EMPTY_SELECTION, ORDER, "c", { shift: true });
    expect(state.ids).toEqual(["c"]);
    expect(state.anchor).toBe("c");
  });

  it("falls back to a plain selection when the anchor is no longer visible", () => {
    const anchored = { ids: ["z"], anchor: "z" };
    const state = applySelection(anchored, ORDER, "c", { shift: true });
    expect(state.ids).toEqual(["c"]);
  });

  it("never loses a click on an id that is not in the ordered list", () => {
    const state = applySelection(EMPTY_SELECTION, ORDER, "zzz");
    expect(state.ids).toEqual(["zzz"]);
  });
});

describe("clearSelection", () => {
  it("empties the selection and the anchor", () => {
    expect(clearSelection()).toEqual({ ids: [], anchor: null });
  });
});

describe("pruneSelection", () => {
  it("returns the same object when nothing was removed", () => {
    const state = { ids: ["a", "b"], anchor: "a" };
    expect(pruneSelection(state, ORDER)).toBe(state);
  });

  it("drops ids that no longer exist and clears a dead anchor", () => {
    const state = { ids: ["a", "gone"], anchor: "gone" };
    expect(pruneSelection(state, ORDER)).toEqual({ ids: ["a"], anchor: null });
  });
});
