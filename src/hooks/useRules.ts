import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RuleEntry } from "../types";

export function useRules(vaultPath: string) {
  const [rules, setRules] = useState<RuleEntry[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [isEditingRule, setIsEditingRule] = useState(false);
  const [editRuleTitle, setEditRuleTitle] = useState("");
  const [editRulePath, setEditRulePath] = useState("");
  const [editRuleCategory, setEditRuleCategory] = useState("");
  const [editRuleSource, setEditRuleSource] = useState("");
  const [editRuleContent, setEditRuleContent] = useState("");
  const activeEditingRuleIdRef = useRef<string | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const loadedRules = await invoke<RuleEntry[]>("load_rules");
      if (loadedRules && loadedRules.length > 0) {
        setRules(loadedRules);
        if (!selectedRuleId) {
          setSelectedRuleId(loadedRules[0].id);
        }
      } else {
        setRules([]);
      }
    } catch (err) {
      console.error("Failed to load rules:", err);
    }
  }, [selectedRuleId]);

  useEffect(() => {
    if (!vaultPath) return;
    loadRules();
  }, [vaultPath, loadRules]);

  useEffect(() => {
    const rule = rules.find((r) => r.id === selectedRuleId);
    if (rule) {
      setEditRuleTitle(rule.title);
      setEditRulePath(rule.path || `General/${rule.title}.md`);
      setEditRuleCategory(rule.category || "General");
      setEditRuleSource(rule.source || "D&D 5e SRD");
      setEditRuleContent(rule.content || "");
      activeEditingRuleIdRef.current = rule.id;
    }
  }, [selectedRuleId, rules]);

  const saveRule = useCallback(
    async (rule: RuleEntry) => {
      try {
        await invoke("save_rule", { rule });
        await loadRules();
      } catch (err) {
        console.error("Failed to save rule:", err);
        throw err;
      }
    },
    [loadRules],
  );

  const deleteRule = useCallback(
    async (ruleId: string) => {
      try {
        activeEditingRuleIdRef.current = null;
        await invoke("delete_rule", { ruleId });
        await loadRules();
        setIsEditingRule(false);
      } catch (err) {
        console.error("Failed to delete rule:", err);
        throw err;
      }
    },
    [loadRules],
  );

  const deleteRulesFolder = useCallback(
    async (folderPath: string) => {
      try {
        activeEditingRuleIdRef.current = null;
        await invoke("delete_rules_folder", { folderPath });
        await loadRules();
      } catch (err) {
        console.error("Failed to delete rule folder:", err);
        throw err;
      }
    },
    [loadRules],
  );

  const handleNewRule = useCallback(
    (targetFolder: string = "General") => {
      const newId = `rule-${Date.now()}`;
      const cleanFolder = targetFolder === "General" ? "General" : targetFolder;
      const newRule: RuleEntry = {
        id: newId,
        title: "Untitled Rule",
        path: `${cleanFolder}/Untitled Rule.md`,
        category: cleanFolder.split("/")[0] || "General",
        source: "Homebrew",
        content: `# Untitled Rule\n\nWrite your rule details and mechanics here...`,
      };
      setRules((prev) => [...prev, newRule]);
      setSelectedRuleId(newId);
      setIsEditingRule(true);
      saveRule(newRule).catch((err) =>
        console.error("Failed to persist new rule:", err),
      );
    },
    [saveRule],
  );

  const handleNewRuleFolder = useCallback(async () => {
    const folderPath = prompt(
      "Enter folder path (e.g. Combat/Reactions or Spellcasting/Evocation):",
    );
    if (!folderPath || !folderPath.trim()) return;
    const cleanFolder = folderPath.trim().replace(/^\/+|\/+$/g, "");
    handleNewRule(cleanFolder);
  }, [handleNewRule]);

  const handleInsertRuleImage = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (!dataUrl) return;
        const base64Data = dataUrl.split(",")[1] || "";
        const currentRuleObj = rules.find((r) => r.id === selectedRuleId);
        const notePath = currentRuleObj?.path || `General/${file.name}.md`;
        invoke<string>("save_note_asset", {
          notePath,
          filename: file.name,
          base64Data,
        })
          .then((assetRelPath) => {
            const imageMarkdown = `\n\n![${file.name}](${assetRelPath})\n`;
            setEditRuleContent((prev) => prev + imageMarkdown);
          })
          .catch((err) => {
            console.error("Failed to save rule image:", err);
            const imageMarkdown = `\n\n![${file.name}](${dataUrl})\n`;
            setEditRuleContent((prev) => prev + imageMarkdown);
          });
      };
      reader.readAsDataURL(file);
    },
    [rules, selectedRuleId],
  );

  const rulesByFolder = useMemo<Record<string, RuleEntry[]>>(() => {
    const groups: Record<string, RuleEntry[]> = {};
    rules.forEach((rule) => {
      const parts = rule.path
        ? rule.path.split("/")
        : ["General", rule.title + ".md"];
      let folder = "General";
      if (parts.length > 1) {
        parts.pop();
        folder = parts.join("/");
      }
      if (!groups[folder]) {
        groups[folder] = [];
      }
      groups[folder].push(rule);
    });
    return groups;
  }, [rules]);

  const currentRule = useMemo(
    () => rules.find((r) => r.id === selectedRuleId),
    [rules, selectedRuleId],
  );

  // Auto-save active rule changes when editing
  useEffect(() => {
    if (
      !selectedRuleId ||
      !isEditingRule ||
      activeEditingRuleIdRef.current !== selectedRuleId
    )
      return;
    const rule = rules.find((r) => r.id === selectedRuleId);
    if (!rule) return;

    const updatedRule: RuleEntry = {
      ...rule,
      title: editRuleTitle,
      path: editRulePath,
      category: editRuleCategory,
      source: editRuleSource,
      content: editRuleContent,
    };

    setRules((prev) =>
      prev.map((r) => (r.id === selectedRuleId ? updatedRule : r)),
    );

    invoke("save_rule", { rule: updatedRule }).catch((err) =>
      console.error("Failed to save rule:", err),
    );
  }, [
    selectedRuleId,
    isEditingRule,
    editRuleTitle,
    editRulePath,
    editRuleCategory,
    editRuleSource,
    editRuleContent,
    rules,
  ]);

  return {
    rules,
    setRules,
    rulesByFolder,
    selectedRuleId,
    setSelectedRuleId,
    currentRule,
    isEditingRule,
    setIsEditingRule,
    editRuleTitle,
    setEditRuleTitle,
    editRulePath,
    setEditRulePath,
    editRuleCategory,
    setEditRuleCategory,
    editRuleSource,
    setEditRuleSource,
    editRuleContent,
    setEditRuleContent,
    activeEditingRuleIdRef,
    loadRules,
    saveRule,
    deleteRule,
    deleteRulesFolder,
    handleNewRule,
    handleNewRuleFolder,
    handleInsertRuleImage,
  };
}
