import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SavedSearch } from "../bindings";
import { filterNotes } from "../utils/filter";
import type { CampaignNote } from "../types";

/**
 * Saved searches for the active vault (F4.3).
 *
 * Two kinds, deliberately different in where they run:
 * - `filter` — structural predicates evaluated here over the already-loaded
 *   notes, with `src/utils/filter.ts`. Instant, works offline, no IPC.
 * - `fts` — full-text, run through the existing `search_vault` (which itself
 *   falls back to keyword-only when embeddings are unavailable), then mapped
 *   back to notes by path.
 *
 * The active search is identified by id so the surrounding view can re-apply it
 * after a note edit without holding a stale copy of the query.
 */
export function useSavedSearches(notes: CampaignNote[], vaultPath: string) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ftsMatches, setFtsMatches] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vaultPath) {
      setSearches([]);
      return;
    }
    setLoading(true);
    try {
      const list = await invoke<SavedSearch[]>("list_saved_searches");
      setSearches(list ?? []);
      setError(null);
    } catch (err) {
      setError(String(err));
      setSearches([]);
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  const save = useCallback(
    async (search: Omit<SavedSearch, "id" | "created_at"> & Partial<SavedSearch>) => {
      try {
        const saved = await invoke<SavedSearch>("save_saved_search", {
          search: {
            id: search.id ?? "",
            name: search.name,
            kind: search.kind,
            query: search.query,
            filters: search.filters ?? "",
            created_at: search.created_at ?? 0,
          },
        });
        await refresh();
        setError(null);
        return saved;
      } catch (err) {
        setError(String(err));
        return null;
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await invoke<boolean>("delete_saved_search", { id });
        if (activeId === id) setActiveId(null);
        await refresh();
        setError(null);
        return true;
      } catch (err) {
        setError(String(err));
        return false;
      }
    },
    [refresh, activeId],
  );

  const active = searches.find((s) => s.id === activeId) ?? null;

  /** Runs a search: sets it active and, for `fts`, resolves its matching paths. */
  const run = useCallback(
    async (id: string) => {
      setActiveId(id);
      const search = searches.find((s) => s.id === id);
      if (!search || search.kind !== "fts") {
        setFtsMatches(null);
        return;
      }
      try {
        const response = await invoke<{ results: Array<{ path: string }> }>(
          "search_vault",
          { query: search.query, limit: 200 },
        );
        setFtsMatches((response?.results ?? []).map((r) => r.path));
        setError(null);
      } catch (err) {
        setError(String(err));
        setFtsMatches([]);
      }
    },
    [searches],
  );

  const clear = useCallback(() => {
    setActiveId(null);
    setFtsMatches(null);
  }, []);

  // The result set is derived on every render, so editing a note re-filters it
  // without re-running anything — and a stale result list is impossible.
  const results = (() => {
    if (!active) return null;
    if (active.kind === "fts") {
      if (ftsMatches === null) return null;
      const set = new Set(ftsMatches);
      const byFts = notes.filter((n) => set.has(n.path));
      // `filters` narrows an fts result structurally (e.g. type:npc).
      const filters = active.filters ?? "";
      return filters.trim() ? filterNotes(byFts, filters) : byFts;
    }
    return filterNotes(notes, active.query);
  })();

  useEffect(() => {
    setActiveId(null);
    setFtsMatches(null);
    void refresh();
  }, [vaultPath, refresh]);

  return {
    searches,
    active,
    activeId,
    results,
    loading,
    error,
    refresh,
    save,
    remove,
    run,
    clear,
  };
}
