import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileChange, SnapshotInfo } from "../bindings";

/**
 * Vault Time Machine — bounded snapshots of the active vault, the diff against
 * the live vault, and single-note restore.
 *
 * All three commands are vault-scoped on the Rust side (they read
 * `AppState::vault_path`), so switching worlds invalidates everything here: the
 * hook reloads on `vaultPath` change rather than caching across worlds.
 */
export function useSnapshots(vaultPath: string) {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!vaultPath) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    try {
      const list = await invoke<SnapshotInfo[]>("list_snapshots");
      setSnapshots(list ?? []);
      setError(null);
    } catch (err) {
      setError(String(err));
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  const create = useCallback(
    async (label?: string): Promise<SnapshotInfo | null> => {
      if (!vaultPath) return null;
      try {
        const info = await invoke<SnapshotInfo>("create_snapshot", {
          label: label?.trim() ? label.trim() : null,
        });
        await refresh();
        setError(null);
        return info;
      } catch (err) {
        setError(String(err));
        return null;
      }
    },
    [vaultPath, refresh],
  );

  const diff = useCallback(
    async (id: string): Promise<FileChange[]> => {
      setSelectedId(id);
      setDiffLoading(true);
      try {
        const result = await invoke<FileChange[]>("snapshot_diff", { id });
        setChanges(result ?? []);
        setError(null);
        return result ?? [];
      } catch (err) {
        setError(String(err));
        setChanges([]);
        return [];
      } finally {
        setDiffLoading(false);
      }
    },
    [],
  );

  /** Restores one file. Returns true on success; the caller reloads notes. */
  const restore = useCallback(
    async (id: string, path: string): Promise<boolean> => {
      try {
        await invoke("restore_note_from_snapshot", { id, path });
        setError(null);
        return true;
      } catch (err) {
        setError(String(err));
        return false;
      }
    },
    [],
  );

  useEffect(() => {
    setSelectedId(null);
    setChanges([]);
    void refresh();
  }, [vaultPath, refresh]);

  return {
    snapshots,
    loading,
    error,
    selectedId,
    changes,
    diffLoading,
    refresh,
    create,
    diff,
    restore,
  };
}
