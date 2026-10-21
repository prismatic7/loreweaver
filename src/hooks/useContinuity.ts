import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ContinuityReport } from "../bindings";

/**
 * Runs the continuity audit (`audit_continuity`) for the active vault and
 * holds the report (entity/alias registry + findings).
 */
export function useContinuity(vaultPath: string) {
  const [report, setReport] = useState<ContinuityReport | null>(null);
  const [loading, setLoading] = useState(false);

  const runAudit = useCallback(async () => {
    if (!vaultPath) return;
    setLoading(true);
    try {
      const result = await invoke<ContinuityReport>("audit_continuity");
      setReport(result ?? null);
    } catch (err) {
      console.error("Continuity audit failed:", err);
    } finally {
      setLoading(false);
    }
  }, [vaultPath]);

  useEffect(() => {
    setReport(null);
    if (!vaultPath) return;
    void runAudit();
  }, [vaultPath, runAudit]);

  return { report, loading, runAudit };
}
