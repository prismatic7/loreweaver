import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export function useAgent(
  vaultPath: string,
  vaults: Array<{ path: string; name: string }>,
  settings: {
    llmProvider: string;
    llmModel: string;
    llmApiKey: string;
    llmBaseUrl: string;
  },
  selectedNoteId: string,
) {
  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByVault, setChatMessagesByVault] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [sessionCloneTargetVaultPath, setSessionCloneTargetVaultPath] =
    useState("");

  const defaultChatMessages = useMemo(
    () => [
      {
        role: "assistant" as const,
        text: "Greetings, Game Master. I am your Campaign Architect agent. I can help you draft notes, check rules, simulate NPCs, or generate ideas for your campaign. What shall we work on today?",
      },
    ],
    [],
  );

  const currentChatMessages = useMemo(
    () =>
      vaultPath
        ? chatMessagesByVault[vaultPath] || defaultChatMessages
        : defaultChatMessages,
    [vaultPath, chatMessagesByVault, defaultChatMessages],
  );

  const updateVaultChatMessages = useCallback(
    (updater: (currentMessages: ChatMessage[]) => ChatMessage[]) => {
      if (!vaultPath) return;
      setChatMessagesByVault((prev) => {
        const currentMessages = prev[vaultPath] || defaultChatMessages;
        return {
          ...prev,
          [vaultPath]: updater(currentMessages),
        };
      });
    },
    [vaultPath, defaultChatMessages],
  );

  const resetCurrentVaultSession = useCallback(() => {
    if (!vaultPath) return;
    setChatMessagesByVault((prev) => ({
      ...prev,
      [vaultPath]: defaultChatMessages,
    }));
  }, [vaultPath, defaultChatMessages]);

  const exportCurrentVaultSession = useCallback(
    (getVaultLabel: (path: string) => string) => {
      if (!vaultPath) return;
      const payload = {
        vaultPath,
        vaultName: getVaultLabel(vaultPath),
        exportedAt: new Date().toISOString(),
        messages: currentChatMessages,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${getVaultLabel(vaultPath)
        .replace(/[^a-z0-9-_]+/gi, "-")
        .toLowerCase()}-session.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    [vaultPath, currentChatMessages],
  );

  const cloneCurrentVaultSession = useCallback(() => {
    if (!vaultPath || !sessionCloneTargetVaultPath) return;
    if (sessionCloneTargetVaultPath === vaultPath) return;
    setChatMessagesByVault((prev) => ({
      ...prev,
      [sessionCloneTargetVaultPath]: currentChatMessages.map((msg) => ({
        ...msg,
      })),
    }));
  }, [vaultPath, sessionCloneTargetVaultPath, currentChatMessages]);

  const handleSendChatMessage = useCallback(() => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    updateVaultChatMessages((prev) => [
      ...prev,
      { role: "user", text: userMsg },
    ]);
    setChatInput("");

    invoke<string>("orchestrate_agent", {
      prompt: userMsg,
      provider: settings.llmProvider,
      model: settings.llmModel,
      apiKey: settings.llmApiKey || null,
      baseUrl: settings.llmBaseUrl || null,
      activeNoteId: selectedNoteId || null,
    })
      .then((botResponse) => {
        updateVaultChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: botResponse },
        ]);
      })
      .catch((err) => {
        console.error("AI agent error:", err);
        const fallback =
          `Error calling AI provider: ${err}. Please ensure your configured LLM server is running or configure an API key in Settings.`;
        updateVaultChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: fallback },
        ]);
      });
  }, [
    chatInput,
    settings.llmProvider,
    settings.llmModel,
    settings.llmApiKey,
    settings.llmBaseUrl,
    selectedNoteId,
    updateVaultChatMessages,
  ]);

  const initVaultChat = useCallback(() => {
    if (!vaultPath) return;
    setChatMessagesByVault((prev) => {
      if (prev[vaultPath]) return prev;
      return { ...prev, [vaultPath]: defaultChatMessages };
    });
    setSessionCloneTargetVaultPath((currentTarget) => {
      if (currentTarget && currentTarget !== vaultPath) return currentTarget;
      const firstOtherVault = vaults.find((item) => item.path !== vaultPath);
      return firstOtherVault?.path || "";
    });
  }, [vaultPath, vaults, defaultChatMessages]);

  return {
    chatInput,
    setChatInput,
    chatMessagesByVault,
    currentChatMessages,
    sessionCloneTargetVaultPath,
    setSessionCloneTargetVaultPath,
    updateVaultChatMessages,
    resetCurrentVaultSession,
    exportCurrentVaultSession,
    cloneCurrentVaultSession,
    handleSendChatMessage,
    initVaultChat,
  };
}
