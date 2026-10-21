import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ProviderStatus {
  reachable: boolean;
  modelAvailable: boolean;
  checking: boolean;
}

/**
 * Polls `test_provider_connection` (debounced + on a slow interval) to report
 * whether the configured LLM provider is reachable and has models available.
 *
 * The check is debounced on provider/base-url/api-key changes, and re-runs on
 * a `pollIntervalMs` cadence to catch offline→online transitions.
 */
export function useProviderStatus(
  provider: string,
  baseUrl: string,
  apiKey: string,
  pollIntervalMs = 30_000,
): ProviderStatus {
  const [status, setStatus] = useState<ProviderStatus>({
    reachable: false,
    modelAvailable: false,
    checking: true,
  });

  const check = useCallback(async () => {
    setStatus((s) => ({ ...s, checking: true }));
    try {
      const models = await invoke<string[]>("test_provider_connection", {
        provider,
        baseUrl,
        apiKey: apiKey || null,
      });
      setStatus({
        reachable: true,
        modelAvailable: (models ?? []).length > 0,
        checking: false,
      });
    } catch {
      setStatus({ reachable: false, modelAvailable: false, checking: false });
    }
  }, [provider, baseUrl, apiKey]);

  // Debounced re-check when the provider config changes.
  useEffect(() => {
    const timer = setTimeout(() => {
      void check();
    }, 500);
    return () => clearTimeout(timer);
  }, [check]);

  // Slow poll to catch offline→online transitions.
  useEffect(() => {
    const id = setInterval(() => {
      void check();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [check, pollIntervalMs]);

  return status;
}
