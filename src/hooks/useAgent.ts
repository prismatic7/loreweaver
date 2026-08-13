import { useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
}

export interface MemoryFact {
  id: string;
  fact: string;
  category: string;
  created_at: number;
}

export function useAgent(
  vaultPath: string,
  vaults: Array<{ path: string; name: string }>,
  settings: {
    llmProvider: string;
    llmModel: string;
    llmApiKey: string;
    llmBaseUrl: string;
    imageProvider: string;
    imageModel: string;
    imageApiKey: string;
    imageBaseUrl: string;
    ttsProvider: string;
    ttsApiKey: string;
    ttsBaseUrl: string;
  },
  selectedNoteId: string,
) {
  const [chatInput, setChatInput] = useState("");
  const [chatMessagesByVault, setChatMessagesByVault] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [sessionCloneTargetVaultPath, setSessionCloneTargetVaultPath] =
    useState("");
  const [memoryFacts, setMemoryFacts] = useState<MemoryFact[]>([]);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [npcVoiceText, setNpcVoiceText] = useState("");
  const [npcVoiceName, setNpcVoiceName] = useState("");
  const [isSpeakingNpc, setIsSpeakingNpc] = useState(false);
  const [npcAudioUrl, setNpcAudioUrl] = useState("");
  const [isGeneratingChatImage, setIsGeneratingChatImage] = useState(false);
  const [chatImageUrl, setChatImageUrl] = useState("");

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

  // --- P7: Session Memory ---
  const loadMemoryFacts = useCallback(() => {
    if (!vaultPath) return;
    invoke<MemoryFact[]>("list_session_memory")
      .then((facts) => setMemoryFacts(facts || []))
      .catch((err) => console.error("Failed to load session memory:", err));
  }, [vaultPath]);

  const addMemoryFact = useCallback(
    (fact: string, category: string) => {
      if (!vaultPath || !fact.trim()) return;
      invoke<string>("save_session_memory", { fact, category })
        .then(() => loadMemoryFacts())
        .catch((err) => console.error("Failed to save session memory:", err));
    },
    [vaultPath, loadMemoryFacts],
  );

  const deleteMemoryFact = useCallback(
    (id: string) => {
      if (!vaultPath) return;
      invoke("delete_session_memory", { id })
        .then(() => loadMemoryFacts())
        .catch((err) => console.error("Failed to delete session memory:", err));
    },
    [vaultPath, loadMemoryFacts],
  );

  // --- P8: Session Summary ---
  const handleSummarizeSession = useCallback(() => {
    if (!vaultPath || isSummarizing) return;
    setIsSummarizing(true);
    setSummaryText("");
    const transcript = JSON.stringify(currentChatMessages);
    invoke<string>("summarize_session", {
      messagesJson: transcript,
      provider: settings.llmProvider,
      model: settings.llmModel,
      apiKey: settings.llmApiKey || null,
      baseUrl: settings.llmBaseUrl || null,
    })
      .then((summary) => setSummaryText(summary))
      .catch((err) => {
        console.error("Session summary error:", err);
        setSummaryText(`Error generating summary: ${err}`);
      })
      .finally(() => setIsSummarizing(false));
  }, [
    vaultPath,
    isSummarizing,
    currentChatMessages,
    settings.llmProvider,
    settings.llmModel,
    settings.llmApiKey,
    settings.llmBaseUrl,
  ]);

  // --- P9: NPC Voice ---
  const handleSpeakAsNpc = useCallback(() => {
    if (!npcVoiceText.trim() || isSpeakingNpc) return;
    setIsSpeakingNpc(true);
    setNpcAudioUrl("");
    invoke<string>("generate_speech", {
      text: npcVoiceText,
      provider: settings.ttsProvider,
      apiKey: settings.ttsApiKey || null,
      voice: npcVoiceName || null,
      baseUrl: settings.ttsBaseUrl || null,
    })
      .then((audioUrl) => setNpcAudioUrl(audioUrl))
      .catch((err) => {
        console.error("NPC speech error:", err);
        setNpcAudioUrl("");
      })
      .finally(() => setIsSpeakingNpc(false));
  }, [
    npcVoiceText,
    isSpeakingNpc,
    npcVoiceName,
    settings.ttsProvider,
    settings.ttsApiKey,
  ]);

  // --- P10: Image-in-Chat ---
  const handleGenerateChatImage = useCallback(() => {
    if (!chatInput.trim() || isGeneratingChatImage) return;
    setIsGeneratingChatImage(true);
    setChatImageUrl("");
    invoke<string>("generate_image", {
      prompt: chatInput,
      style: "Fantasy Portrait",
      provider: settings.imageProvider,
      model: settings.imageModel,
      apiKey: settings.imageApiKey || null,
      baseUrl: settings.imageBaseUrl || null,
    })
      .then((dataUrl) => {
        setChatImageUrl(dataUrl);
        updateVaultChatMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "Here is the image I generated:",
            imageUrl: dataUrl,
          },
        ]);
      })
      .catch((err) => {
        console.error("Chat image error:", err);
        updateVaultChatMessages((prev) => [
          ...prev,
          { role: "assistant", text: `Image generation failed: ${err}` },
        ]);
      })
      .finally(() => setIsGeneratingChatImage(false));
  }, [
    chatInput,
    isGeneratingChatImage,
    settings.imageProvider,
    settings.imageModel,
    settings.imageApiKey,
    settings.imageBaseUrl,
    updateVaultChatMessages,
  ]);

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
    // P7
    memoryFacts,
    loadMemoryFacts,
    addMemoryFact,
    deleteMemoryFact,
    // P8
    isSummarizing,
    summaryText,
    handleSummarizeSession,
    // P9
    npcVoiceText,
    setNpcVoiceText,
    npcVoiceName,
    setNpcVoiceName,
    isSpeakingNpc,
    npcAudioUrl,
    handleSpeakAsNpc,
    // P10
    isGeneratingChatImage,
    chatImageUrl,
    handleGenerateChatImage,
  };
}
