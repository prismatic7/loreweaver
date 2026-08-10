import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Plugin {
  id: string;
  name: string;
  active?: boolean;
}

export function usePlugins(vaultPath: string) {
  const [pluginsList, setPluginsList] = useState<Plugin[]>([]);

  const loadPlugins = useCallback(async () => {
    try {
      const list = await invoke<Plugin[]>("load_plugins");
      setPluginsList(list || []);
    } catch (err) {
      console.error("Failed to load plugins:", err);
    }
  }, []);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    if (!vaultPath) return;
    loadPlugins();
  }, [vaultPath, loadPlugins]);

  const executeHook = useCallback(
    async (pluginId: string, hook: string, payload: string) => {
      try {
        const result = await invoke<string>("execute_plugin_hook", {
          pluginId,
          hook,
          payload,
        });
        return result;
      } catch (err) {
        console.error(`Plugin hook failed for ${pluginId}/${hook}:`, err);
        throw err;
      }
    },
    [],
  );

  const handleRollCharacterSheet = useCallback(
    async (alert: (message: string) => void, onCreated?: (note: any) => void) => {
      const name = prompt("Enter character name:", "Valerius");
      if (!name) return;
      const charClass = prompt("Enter character class:", "Fighter");
      if (!charClass) return;

      try {
        const resStr = await executeHook(
          "character-roller",
          "generate_character",
          JSON.stringify({ name, class: charClass }),
        );
        const data = JSON.parse(resStr);
        const newNote = {
          id: `char-${Date.now()}`,
          title: name,
          path: `Characters/${name.replace(/\s+/g, "_")}.md`,
          frontmatter: {
            type: "Character",
            class: charClass,
            tags: ["character-roller", "npc"],
          },
          content: data.sheet,
        };
        onCreated?.(newNote);
      } catch (err) {
        alert("Plugin failed: " + err);
      }
    },
    [executeHook],
  );

  const handleEvaluateEncounterThreat = useCallback(
    async (alert: (message: string) => void) => {
      const levelsStr = prompt(
        "Enter party character levels (comma separated):",
        "3, 3, 3, 3",
      );
      if (!levelsStr) return;
      const crsStr = prompt("Enter adversary CRs (comma separated):", "1, 2");
      if (!crsStr) return;

      const party_levels = levelsStr
        .split(",")
        .map((s) => parseInt(s.trim()) || 1);
      const adversaries_cr = crsStr
        .split(",")
        .map((s) => parseInt(s.trim()) || 1);

      try {
        const resStr = await executeHook(
          "threat-evaluator",
          "evaluate_encounter",
          JSON.stringify({ party_levels, adversaries_cr }),
        );
        const data = JSON.parse(resStr);
        alert(`Threat Assessment Verdict:\n\n${data.verdict}`);
      } catch (err) {
        alert("Plugin failed: " + err);
      }
    },
    [executeHook],
  );

  return {
    pluginsList,
    loadPlugins,
    executeHook,
    handleRollCharacterSheet,
    handleEvaluateEncounterThreat,
  };
}
