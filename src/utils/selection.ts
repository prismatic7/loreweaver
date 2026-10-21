/**
 * Multi-select logic for the vault tree.
 *
 * Kept as a pure function so the modifier rules (⌘/Ctrl toggle, ⇧ range) can be
 * tested without rendering a tree, and so the same rules can be reused by any
 * other list that grows multi-select later.
 */

export interface SelectionState {
  /** Selected note ids, in click order. */
  ids: string[];
  /** Anchor for ⇧-range selection: the last note clicked without ⇧. */
  anchor: string | null;
}

export const EMPTY_SELECTION: SelectionState = { ids: [], anchor: null };

export interface SelectionModifiers {
  /** ⌘ on macOS, Ctrl elsewhere — toggle one item. */
  meta?: boolean;
  /** ⇧ — select the range from the anchor to the clicked item. */
  shift?: boolean;
}

/**
 * Applies one click to the selection.
 *
 * - Plain click: select only that note, and move the anchor to it.
 * - ⌘/Ctrl click: add or remove that note; it becomes the new anchor.
 * - ⇧ click: select the inclusive range from the anchor to the clicked note,
 *   in the order given by `orderedIds` (the visible tree order). With no anchor,
 *   or when either end is no longer visible, it degrades to a plain selection
 *   rather than guessing at a range.
 */
export function applySelection(
  state: SelectionState,
  orderedIds: string[],
  clickedId: string,
  modifiers: SelectionModifiers = {},
): SelectionState {
  if (modifiers.meta) {
    const already = state.ids.includes(clickedId);
    return {
      ids: already
        ? state.ids.filter((id) => id !== clickedId)
        : [...state.ids, clickedId],
      anchor: clickedId,
    };
  }

  if (modifiers.shift && state.anchor) {
    const from = orderedIds.indexOf(state.anchor);
    const to = orderedIds.indexOf(clickedId);
    if (from >= 0 && to >= 0) {
      const [start, end] = from <= to ? [from, to] : [to, from];
      // The anchor stays put so a second ⇧-click re-ranges from the same origin.
      return { ids: orderedIds.slice(start, end + 1), anchor: state.anchor };
    }
  }

  return { ids: [clickedId], anchor: clickedId };
}

/** Clears the selection but keeps nothing anchored. */
export function clearSelection(): SelectionState {
  return { ids: [], anchor: null };
}

/** Drops ids that no longer exist (e.g. after a trash) without reordering. */
export function pruneSelection(state: SelectionState, existingIds: string[]): SelectionState {
  const ids = state.ids.filter((id) => existingIds.includes(id));
  if (ids.length === state.ids.length) return state;
  const anchor = state.anchor && ids.includes(state.anchor) ? state.anchor : null;
  return { ids, anchor };
}
