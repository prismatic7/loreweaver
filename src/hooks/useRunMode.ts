import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RunState } from "../bindings";

/**
 * Loads and mutates Run Mode's vault-scoped live-play state (the current scene
 * note and the pinned rule ids). State persists under `run.*` keys in
 * `app_settings` via `get_run_state` / `set_run_state`.
 */
export function useRunMode(vaultPath: string) {
  const [runState, setRunState] = useState<RunState>({
    scene_note_id: null,
    pinned_rule_ids: [],
  });

  const loadRunState = useCallback(async () => {
    if (!vaultPath) return;
    try {
      const state = await invoke<RunState>("get_run_state");
      setRunState(state ?? { scene_note_id: null, pinned_rule_ids: [] });
    } catch (err) {
      console.error("Failed to load run state:", err);
    }
  }, [vaultPath]);

  useEffect(() => {
    setRunState({ scene_note_id: null, pinned_rule_ids: [] });
    if (!vaultPath) return;
    void loadRunState();
  }, [vaultPath, loadRunState]);

  const setScene = useCallback(async (noteId: string | null) => {
    await invoke("set_run_state", {
      key: "scene_note_id",
      value: noteId ?? "",
    });
    setRunState((prev) => ({ ...prev, scene_note_id: noteId }));
  }, []);

  const setPinnedRules = useCallback(async (ruleIds: string[]) => {
    await invoke("set_run_state", {
      key: "pinned_rule_ids",
      value: JSON.stringify(ruleIds),
    });
    setRunState((prev) => ({ ...prev, pinned_rule_ids: ruleIds }));
  }, []);

  return { runState, loadRunState, setScene, setPinnedRules };
}
