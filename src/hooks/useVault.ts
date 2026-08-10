import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface Vault {
  path: string;
  name: string;
}

export function useVault() {
  const [vaultPath, setVaultPath] = useState<string>("");
  const [vaults, setVaults] = useState<Vault[]>([]);

  const loadVaults = useCallback(async () => {
    try {
      const list = await invoke<Vault[]>("list_vaults");
      setVaults(list || []);
    } catch (err) {
      console.error("Failed to list vaults:", err);
    }
  }, []);

  const switchVault = useCallback(async (path: string) => {
    try {
      await invoke("switch_vault", { path });
      setVaultPath(path);
    } catch (err) {
      console.error("Failed to switch vault:", err);
      throw err;
    }
  }, []);

  const refreshVaultPath = useCallback(async () => {
    try {
      const path = await invoke<string>("get_vault_path");
      setVaultPath(path || "");
    } catch (err) {
      console.error("Failed to get vault path:", err);
    }
  }, []);

  useEffect(() => {
    loadVaults();
    refreshVaultPath();
  }, [loadVaults, refreshVaultPath]);

  const getVaultLabel = useCallback(
    (path: string) => {
      const vault = vaults.find((item) => item.path === path);
      return (
        vault?.name || path.split(/[\\/]/).filter(Boolean).pop() || "vault"
      );
    },
    [vaults],
  );

  return {
    vaultPath,
    vaults,
    loadVaults,
    switchVault,
    refreshVaultPath,
    getVaultLabel,
  };
}
