import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CrossWorldHit, CrossWorldResults } from "../bindings";

/**
 * Cross-world fan-out search (F4.4).
 *
 * The palette owns the query string, so `search()` is called on every keystroke
 * and debounced here. Two rounds are issued per query at most:
 *
 * 1. structural (titles/tags/paths) — fast, no embeddings, always available;
 * 2. the same query with `semantic: true` — only issued when the first round
 *    came back saying a semantic pass is possible, and only after the
 *    structural hits are already on screen.
 *
 * `semanticUsed` reports whether the vector pass actually ran, so the UI can say
 * "titles & tags only" instead of implying a meaning-based search that never
 * happened.
 */
export function useCrossWorldSearch(debounceMs = 250) {
  const [hits, setHits] = useState<CrossWorldHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [semanticUsed, setSemanticUsed] = useState(false);
  const [worldsScanned, setWorldsScanned] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const run = useCallback(
    async (query: string, semantic: boolean) => {
      const trimmed = query.trim();
      const id = ++requestId.current;
      if (!trimmed) {
        setHits([]);
        setSemanticUsed(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await invoke<CrossWorldResults>("search_all_worlds", {
          query: trimmed,
          semantic,
        });
        // Drop results from a superseded request.
        if (id !== requestId.current) return;
        setHits(result.hits ?? []);
        setSemanticUsed(Boolean(result.semantic_used));
        setWorldsScanned(Number(result.worlds_scanned ?? 0));
        setError(null);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(String(err));
        setHits([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  /** Debounced entry point used by the palette while typing. */
  const search = useCallback(
    (query: string) => {
      if (timer.current) clearTimeout(timer.current);
      if (!query.trim()) {
        void run("", false);
        return;
      }
      timer.current = setTimeout(() => {
        // Structural first, then the semantic pass on the same query. Issuing
        // both immediately would make the palette wait for the slower one to
        // show anything at all.
        void (async () => {
          await run(query, false);
          await run(query, true);
        })();
      }, debounceMs);
    },
    [run, debounceMs],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    requestId.current += 1;
    setHits([]);
    setLoading(false);
    setSemanticUsed(false);
    setError(null);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { hits, loading, semanticUsed, worldsScanned, error, search, clear };
}
