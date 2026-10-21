import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RelatedNote } from "../bindings";

/**
 * Loads notes semantically related to `noteId` ("related by meaning") via the
 * `nearest_notes` command, which reuses the cached chunk embeddings.
 */
export function useRelatedNotes(noteId: string | undefined, k = 5) {
  const [related, setRelated] = useState<RelatedNote[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!noteId) {
      setRelated([]);
      return;
    }
    setLoading(true);
    try {
      const list = await invoke<RelatedNote[]>("nearest_notes", { noteId, k });
      setRelated(list ?? []);
    } catch (err) {
      console.error("Related notes failed:", err);
      setRelated([]);
    } finally {
      setLoading(false);
    }
  }, [noteId, k]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { related, loading, refresh };
}
