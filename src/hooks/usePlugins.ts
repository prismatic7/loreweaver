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

  // --- P1: Initiative Tracker ---
  const handleInitiativeTracker = useCallback(
    async (alert: (message: string) => void) => {
      const namesStr = prompt(
        "Enter combatant names (comma separated):",
        "Aragorn, Legolas, Goblin 1, Goblin 2",
      );
      if (!namesStr) return;
      const names = namesStr.split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length === 0) return;

      const combatants = names.map((name) => {
        const initStr = prompt(`Initiative for ${name}:`, "10");
        const hpStr = prompt(`HP for ${name}:`, "10");
        return {
          name,
          initiative: parseInt(initStr || "10") || 0,
          hp: parseInt(hpStr || "10") || 0,
          maxHp: parseInt(hpStr || "10") || 0,
        };
      });

      try {
        const resStr = await executeHook(
          "initiative-tracker",
          "init_combat",
          JSON.stringify({ combatants }),
        );
        const state = JSON.parse(resStr);
        const current = state.combatants[state.currentIndex];
        alert(
          `Combat started (Round ${state.round}).\n\nCurrent turn: ${current?.name || "none"}\n\n` +
            state.combatants
              .map(
                (c: any, i: number) =>
                  `${i === state.currentIndex ? "▶ " : "  "}${c.name} (init ${c.initiative}, HP ${c.hp}/${c.maxHp})`,
              )
              .join("\n"),
        );
      } catch (err) {
        alert("Initiative tracker failed: " + err);
      }
    },
    [executeHook],
  );

  // --- P2: Encounter Builder ---
  const handleEncounterBuilder = useCallback(
    async (alert: (message: string) => void) => {
      const name = prompt("Encounter name:", "Ambush at the Crossroads");
      if (!name) return;
      const levelsStr = prompt(
        "Party levels (comma separated):",
        "3, 3, 3, 3",
      );
      if (!levelsStr) return;
      const advStr = prompt(
        "Adversaries as 'Name:CR:count' (semicolon separated):",
        "Goblin:1:2; Hobgoblin:2:1",
      );
      if (!advStr) return;

      const partyLevels = levelsStr
        .split(",")
        .map((s) => parseInt(s.trim()) || 1);
      const adversaries = advStr
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [n, cr, count] = s.split(":");
          return {
            name: n?.trim() || "Adversary",
            cr: parseInt(cr || "1") || 1,
            count: parseInt(count || "1") || 1,
          };
        });

      try {
        const resStr = await executeHook(
          "encounter-builder",
          "build_encounter",
          JSON.stringify({ name, partyLevels, adversaries }),
        );
        const data = JSON.parse(resStr);
        alert(
          `Encounter: ${data.name}\nDifficulty: ${data.difficulty}\nTotal CR: ${data.totalCR}\n\n${data.verdict}\n\nCombatants ready: ${data.combatants.length}`,
        );
      } catch (err) {
        alert("Encounter builder failed: " + err);
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
    handleInitiativeTracker,
    handleEncounterBuilder,
  };
}
