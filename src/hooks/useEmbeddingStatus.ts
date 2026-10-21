import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Reports whether semantic search is available (`search_engine_ready`).
 *
 * The embedding model is downloaded on first launch, so the answer legitimately
 * changes from `false` to `true` while the app is running — this polls rather
 * than reading once. Any error is treated as "not ready": the honest reading of
 * a failed status probe is that we cannot promise semantic results.
 */
export function useEmbeddingStatus(pollIntervalMs = 30_000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const value = await invoke<boolean>("search_engine_ready");
        if (!cancelled) setReady(value === true);
      } catch {
        if (!cancelled) setReady(false);
      }
    };

    void check();
    const id = setInterval(() => {
      void check();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollIntervalMs]);

  return ready;
}
