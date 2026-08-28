import { useState, useCallback, useMemo } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import type { AgentEvent, ContextItem, PendingToolApproval } from "../bindings";

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: string;
  result?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  imageUrl?: string;
  /** Accumulated reasoning/thinking text (streamed). */
  reasoning?: string;
  /** Tool calls made during this turn, with results when available. */
  toolCalls?: ToolCallRecord[];
  /** True while the assistant turn is still streaming. */
  isStreaming?: boolean;
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
  // Per-vault so a summary from World A never shows while browsing World B.
  const [summaryByVault, setSummaryByVault] = useState<Record<string, string>>(
    {},
  );
  const [npcVoiceText, setNpcVoiceText] = useState("");
  const [npcVoiceName, setNpcVoiceName] = useState("");
  const [isSpeakingNpc, setIsSpeakingNpc] = useState(false);
  const [npcAudioUrl, setNpcAudioUrl] = useState("");
  const [isGeneratingChatImage, setIsGeneratingChatImage] = useState(false);
  const [chatImageUrl, setChatImageUrl] = useState("");
  // Session-level Firm↔Wild override. `null` = follow world/global default.
  const [sessionTemperature, setSessionTemperature] = useState<number | null>(
    null
  );
  // Streaming state: active run id (for cancel), busy flag, and attached context.
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isAgentStreaming, setIsAgentStreaming] = useState(false);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  // A write tool (save_note) is paused awaiting the user's decision.
  const [pendingApproval, setPendingApproval] =
    useState<PendingToolApproval | null>(null);

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

  // --- P7: Session Memory (declared before the chat handler, which calls it) ---
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

  const handleSendChatMessage = useCallback(() => {
    if (!chatInput.trim() || isAgentStreaming) return;
    const userMsg = chatInput;

    // Slash affordance: `/roll <expr>` evaluates dice/arithmetic locally via
    // the expression engine (Increment E2) instead of hitting the LLM.
    const rollMatch = userMsg.trim().match(/^\/roll\s+(.+)$/i);
    if (rollMatch) {
      const expr = rollMatch[1].trim();
      updateVaultChatMessages((prev) => [
        ...prev,
        { role: "user", text: userMsg },
        { role: "assistant", text: "Rolling…", isStreaming: true },
      ]);
      setChatInput("");
      invoke("evaluate_expression", { expr })
        .then((res) => {
          const r = res as { expression: string; rolls: number[]; total: number };
          const rollsText = r.rolls.join(", ");
          updateVaultChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = {
                ...last,
                text: `🎲 **${r.expression}** → ${rollsText} = **${r.total}**`,
                isStreaming: false,
              };
            }
            return next;
          });
        })
        .catch((err) => {
          updateVaultChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = {
                ...last,
                text: `⚠️ Couldn't roll \`${expr}\`: ${String(err)}`,
                isStreaming: false,
              };
            }
            return next;
          });
        });
      return;
    }

    const priorMessages = chatMessagesByVault[vaultPath] || defaultChatMessages;
    // History sent to the backend: prior turns only (the new user turn is the
    // `prompt` argument). Streaming placeholders are excluded.
    const history: Array<{ role: string; content: string }> = priorMessages
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.text }));
    updateVaultChatMessages((prev) => [
      ...prev,
      { role: "user", text: userMsg },
      {
        role: "assistant",
        text: "",
        reasoning: "",
        toolCalls: [],
        isStreaming: true,
      },
    ]);
    setChatInput("");

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setActiveRunId(runId);
    setIsAgentStreaming(true);

    const channel = new Channel<AgentEvent>();
    channel.onmessage = (event) => {
      switch (event.type) {
        case "reasoning":
          updateVaultChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = {
                ...last,
                reasoning: (last.reasoning || "") + event.delta,
              };
            }
            return next;
          });
          break;
        case "tool_call":
          updateVaultChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = {
                ...last,
                toolCalls: [
                  ...(last.toolCalls || []),
                  {
                    id: event.id,
                    name: event.name,
                    arguments: event.arguments,
                  },
                ],
              };
            }
            return next;
          });
          break;
        case "tool_result":
          updateVaultChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = {
                ...last,
                toolCalls: (last.toolCalls || []).map((tc) =>
                  tc.id === event.id
                    ? { ...tc, result: event.result }
                    : tc,
                ),
              };
            }
            return next;
          });
          break;
        case "delta":
          updateVaultChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = { ...last, text: last.text + event.text };
            }
            return next;
          });
          break;
        case "tool_approval_required":
          setPendingApproval(event.approval);
          break;
        case "done":
          updateVaultChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = {
                ...last,
                text: event.text || last.text,
                isStreaming: false,
              };
            }
            return next;
          });
          break;
        case "error":
          updateVaultChatMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === "assistant" && last.isStreaming) {
              next[next.length - 1] = {
                ...last,
                text: last.text || `Error: ${event.message}`,
                isStreaming: false,
              };
            }
            return next;
          });
          break;
      }
    };

    invoke<string>("orchestrate_agent_stream", {
      runId,
      prompt: userMsg,
      provider: settings.llmProvider,
      model: settings.llmModel,
      apiKey: settings.llmApiKey || null,
      baseUrl: settings.llmBaseUrl || null,
      activeNoteId: selectedNoteId || null,
      sessionTemperature,
      history,
      contextItems,
      onEvent: channel,
    })
      .then(() => {
        // World-scoped memory: after each completed exchange, ask the LLM to
        // extract durable facts into the ACTIVE world's memory table. Best-
        // effort and silent — a failed extraction never breaks the chat.
        const transcript = JSON.stringify([
          ...priorMessages,
          { role: "user", text: userMsg },
        ]);
        invoke<number>("extract_session_memories", {
          messagesJson: transcript,
          provider: settings.llmProvider,
          model: settings.llmModel,
          apiKey: settings.llmApiKey || null,
          baseUrl: settings.llmBaseUrl || null,
        })
          .then(() => loadMemoryFacts())
          .catch((err) =>
            console.error("Memory extraction failed (non-fatal):", err),
          );
      })
      .catch((err) => {
        console.error("AI agent error:", err);
        const fallback =
          `Error calling AI provider: ${err}. Please ensure your configured LLM server is running or configure an API key in Settings.`;
        updateVaultChatMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && last.isStreaming) {
            next[next.length - 1] = {
              ...last,
              text: last.text || fallback,
              isStreaming: false,
            };
          }
          return next;
        });
      })
      .finally(() => {
        setActiveRunId(null);
        setIsAgentStreaming(false);
      });
  }, [
    chatInput,
    isAgentStreaming,
    chatMessagesByVault,
    vaultPath,
    defaultChatMessages,
    settings.llmProvider,
    settings.llmModel,
    settings.llmApiKey,
    settings.llmBaseUrl,
    selectedNoteId,
    sessionTemperature,
    contextItems,
    updateVaultChatMessages,
    loadMemoryFacts,
  ]);

  const handleStopAgentStream = useCallback(() => {
    if (!activeRunId) return;
    invoke("cancel_agent_stream", { runId: activeRunId }).catch((err) =>
      console.error("Failed to cancel agent stream:", err),
    );
  }, [activeRunId]);

  const handleApproveAgentTool = useCallback(() => {
    if (!pendingApproval) return;
    invoke("approve_agent_tool", {
      runId: pendingApproval.run_id,
      toolCallId: pendingApproval.tool_call_id,
    })
      .then(() => setPendingApproval(null))
      .catch((err) => console.error("Failed to approve agent tool:", err));
  }, [pendingApproval]);

  const handleRejectAgentTool = useCallback(() => {
    if (!pendingApproval) return;
    invoke("reject_agent_tool", {
      runId: pendingApproval.run_id,
      toolCallId: pendingApproval.tool_call_id,
    })
      .then(() => setPendingApproval(null))
      .catch((err) => console.error("Failed to reject agent tool:", err));
  }, [pendingApproval]);

  const addContextItem = useCallback((item: ContextItem) => {
    setContextItems((prev) => {
      if (prev.some((existing) => existing.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeContextItem = useCallback((id: string) => {
    setContextItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

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

  // --- P8: Session Summary ---
  const handleSummarizeSession = useCallback(() => {
    if (!vaultPath || isSummarizing) return;
    setIsSummarizing(true);
    setSummaryByVault((prev) => ({ ...prev, [vaultPath]: "" }));
    const transcript = JSON.stringify(currentChatMessages);
    invoke<string>("summarize_session", {
      messagesJson: transcript,
      provider: settings.llmProvider,
      model: settings.llmModel,
      apiKey: settings.llmApiKey || null,
      baseUrl: settings.llmBaseUrl || null,
    })
      .then((summary) =>
        setSummaryByVault((prev) => ({ ...prev, [vaultPath]: summary })),
      )
      .catch((err) => {
        console.error("Session summary error:", err);
        setSummaryByVault((prev) => ({
          ...prev,
          [vaultPath]: `Error generating summary: ${err}`,
        }));
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
    settings.ttsBaseUrl,
  ]);

  // --- P10: Image-in-Chat ---
  const handleGenerateChatImage = useCallback(() => {
    if (!chatInput.trim() || isGeneratingChatImage) return;
    setIsGeneratingChatImage(true);
    setChatImageUrl("");

    // Use the world's style template when set; fall back to the classic default.
    const resolveStyle = async (): Promise<string> => {
      try {
        const vs = await invoke<{ image_style_template?: string | null }>(
          "load_vault_settings",
        );
        return vs?.image_style_template?.trim() || "Fantasy Portrait";
      } catch {
        return "Fantasy Portrait";
      }
    };

    resolveStyle().then((style) =>
      invoke<string>("generate_image", {
        prompt: chatInput,
        style,
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
        .finally(() => setIsGeneratingChatImage(false))
    );
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
    handleStopAgentStream,
    handleApproveAgentTool,
    handleRejectAgentTool,
    pendingApproval,
    isAgentStreaming,
    activeRunId,
    contextItems,
    addContextItem,
    removeContextItem,
    initVaultChat,
    // Session Firm↔Wild quick toggle
    sessionTemperature,
    setSessionTemperature,
    // P7
    memoryFacts,
    loadMemoryFacts,
    addMemoryFact,
    deleteMemoryFact,
    // P8
    isSummarizing,
    summaryText: summaryByVault[vaultPath] || "",
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
