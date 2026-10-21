import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Reads the `initiative-tracker` plugin's combat state (read-only) for the Run
 * Mode left rail.
 *
 * The state is fetched by invoking the plugin's `get_combat_state` hook and
 * refreshed on a slow poll so `next_turn` / damage changes made elsewhere are
 * picked up. `hasPlugin` is false when the plugin is absent (or its hook fails),
 * letting the UI show an "add initiative plugin" hint.
 */
export function useInitiative(vaultPath: string, pollIntervalMs = 3000) {
  const [state, setState] = useState<string | null>(null);
  const [hasPlugin, setHasPlugin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await invoke<string>("execute_plugin_hook", {
        pluginId: "initiative-tracker",
        hook: "get_combat_state",
        payload: "{}",
      });
      setState(res);
      setHasPlugin(true);
    } catch {
      setState(null);
      setHasPlugin(false);
    }
  }, []);

  useEffect(() => {
    setState(null);
    setHasPlugin(false);
    if (!vaultPath) return;
    void refresh();
    const id = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(id);
  }, [vaultPath, refresh, pollIntervalMs]);

  return { state, hasPlugin, refresh };
}
