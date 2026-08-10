import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useOnClickOutside } from "usehooks-ts";
import "./App.css";

import { DashboardView } from "./components/DashboardView";
import { SettingsView } from "./components/SettingsView";
import { TrashView } from "./components/TrashView";
import { RulesView } from "./components/RulesView";
import { AiView } from "./components/AiView";
import { CampaignVaultView } from "./components/CampaignVaultView";
import { AppShell, type AppView } from "./components/AppShell";
import { RightDrawer, type RightDrawerTab } from "./components/RightDrawer";
import { SettingsRightPanel } from "./components/SettingsRightPanel";
import {
  ConfirmModal,
  PromptModal,
  AlertModal,
  IngestModal,
  NewRuleModal,
  NewVaultModal,
  ContextMenu,
} from "./components/Modals";

import { useVault } from "./hooks/useVault";
import { useNotes } from "./hooks/useNotes";
import { useRules } from "./hooks/useRules";
import { useSearch } from "./hooks/useSearch";
import { useAgent } from "./hooks/useAgent";
import { usePlugins } from "./hooks/usePlugins";
import { useSettings } from "./hooks/useSettings";
import { useDialogs } from "./hooks/useDialogs";
import { useMarkdownRender } from "./hooks/useMarkdownRender";
import { useIngest } from "./hooks/useIngest";
import { useFolderActions } from "./hooks/useFolderActions";

import { fallbackRoll } from "./utils/dice";

import { CampaignNote, RuleEntry, SearchResult } from "./types";

function App() {
  const [activeView, setActiveView] = useState<AppView>("dashboard");

  const { vaultPath, vaults, switchVault, refreshVaultPath, getVaultLabel, loadVaults } = useVault();
  const {
    notes,
    notesByFolder,
    selectedNoteId,
    setSelectedNoteId,
    currentNote,
    isEditingNote,
    setIsEditingNote,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    editFrontmatter,
    setEditFrontmatter,
    trashedNotes,
    currentCanvasFolder,
    setCurrentCanvasFolder,
    activeEditingNoteIdRef,
    loadNotes,
    loadTrashNotes,
    loadFolders,
    saveNote,
    immediateSave,
    trashNote,
    restoreNote,
    deleteTrashedNote,
    emptyTrash,
    handleNewNote,
    trashFolder,
    normalizeCampaignMarkdown,
  } = useNotes(vaultPath);
  const {
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
    loadRules,
    handleNewRule,
    handleNewRuleFolder,
    handleInsertRuleImage,
    deleteRule,
    deleteRulesFolder,
  } = useRules(vaultPath);
  const {
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    searchResults,
  } = useSearch(notes, rules);
  const {
    theme,
    setTheme,
    settingsTab,
    setSettingsTab,
    register,
    handleSubmit,
    setValue,
    watch,
    errors,
    isDirty,
    isValid,
    loadSettings,
    handleSaveSettings,
    llmProvider,
    llmModel,
    llmApiKey,
    llmBaseUrl,
    imageProvider,
    imageModel,
    imageApiKey,
    imageBaseUrl,
    ttsProvider,
    ttsApiKey,
  } = useSettings();
  const { pluginsList, handleRollCharacterSheet, handleEvaluateEncounterThreat } =
    usePlugins(vaultPath);

  const {
    confirmDialog,
    setConfirmDialog,
    promptDialog,
    setPromptDialog,
    alertDialog,
    setAlertDialog,
    pendingConfirm,
    setPendingConfirm,
    alert,
    showPrompt,
    confirm,
  } = useDialogs();

  const { renderMarkdown } = useMarkdownRender({
    notes,
    selectedNoteId,
    vaultPath,
    setSelectedNoteId,
    setIsEditingNote,
    saveNote,
  });

  const { ingestDialog, setIngestDialog, handleIngestSRD } = useIngest({
    alert,
    loadRules,
    llmProvider,
    llmModel,
    llmApiKey,
    llmBaseUrl,
  });

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: "note" | "folder" | "rule" | "rule-folder";
    targetId: string;
    path?: string;
    isRulebook?: boolean;
  } | null>(null);

  const {
    pendingAssetTarget,
    assetFileInputRef,
    handleNewFolder,
    handleAssetFileSelected,
    handleTrashFolder,
    renderFolderDropdown,
  } = useFolderActions({
    setRules,
    setSelectedNoteId,
    setSelectedRuleId,
    setIsEditingNote,
    setIsEditingRule,
    setEditTitle,
    setEditContent,
    setEditFrontmatter,
    activeEditingNoteIdRef,
    setCurrentCanvasFolder,
    setActiveView,
    saveNote,
    handleNewNote,
    handleNewRule,
    trashFolder,
    deleteRulesFolder,
    currentNote,
    currentRule,
    notes,
    alert,
    showPrompt,
    confirm,
    pluginsList,
    contextMenu,
  });

  const [isRightDrawerOpen, setIsRightDrawerOpen] = useState(true);
  const [rightDrawerTab, setRightDrawerTab] = useState<RightDrawerTab>("scratchpad");

  const [scratchpadText, setScratchpadText] = useState(() => {
    return (
      localStorage.getItem("loreweaver_scratchpad") ||
      "## GM Session Scratchpad\n- Active Party: \n- Notes: \n- Combat Tracker: \n"
    );
  });
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [showNewVaultModal, setShowNewVaultModal] = useState(false);

  const searchRef = useRef<HTMLDivElement | null>(null);
  useOnClickOutside(searchRef as any, () => setIsSearchOpen(false));

  useEffect(() => {
    localStorage.setItem("loreweaver_scratchpad", scratchpadText);
  }, [scratchpadText]);

  const [diceHistory, setDiceHistory] = useState<string[]>([]);
  const [diceNotation, setDiceNotation] = useState<string>("2d20+5");

  const [imagePrompt, setImagePrompt] = useState(
    "A detailed portrait of Lirael, the elven mage",
  );
  const [imageStyle, setImageStyle] = useState("Fantasy Portrait");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>("");

  const [ttsText, setTtsText] = useState("");
  const [isGeneratingSpeech, setIsGeneratingSpeech] = useState(false);
  const [generatedSpeechUrl, setGeneratedSpeechUrl] = useState<string>("");

  const agent = useAgent(
    vaultPath,
    vaults,
    { llmProvider, llmModel, llmApiKey, llmBaseUrl },
    selectedNoteId,
  );

  const refreshVaultData = useCallback(async () => {
    await loadNotes();
    await loadRules();
    await refreshVaultPath();
    await loadFolders();
    await loadTrashNotes();
    await loadSettings();
  }, [loadNotes, loadRules, refreshVaultPath, loadFolders, loadTrashNotes, loadSettings]);

  useEffect(() => {
    refreshVaultData();
    loadVaults();

    const unlisten = listen("vault-changed", () => {
      loadNotes()
        .then(() => loadFolders())
        .catch((err) => console.error("Background vault sync failed:", err));
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!vaultPath) return;
    agent.initVaultChat();
  }, [vaultPath]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  const handleSaveSettingsCb = (data: any) => handleSaveSettings(data, alert);

  const handleSelectSearchResult = useCallback(
    (result: SearchResult) => {
      if (result.type === "note") {
        const matchedNote = notes.find((n) => n.path === result.path);
        if (matchedNote) {
          setSelectedNoteId(matchedNote.id);
          setActiveView("vault");
        }
      } else {
        const rule = rules.find((r) => r.id === result.path);
        if (rule) {
          setSelectedRuleId(rule.id);
          setActiveView("rules");
        }
      }
    },
    [notes, rules, setSelectedNoteId, setSelectedRuleId],
  );

  const rollDiceNotation = (notation: string) => {
    if (!notation.trim()) return;
    const hasDicePlugin = pluginsList.some((p) => p.id === "dice-roller" && p.active);
    const addHistory = (text: string) => {
      setDiceHistory((prev) => [text, ...prev.slice(0, 15)]);
    };

    if (hasDicePlugin) {
      invoke<string>("execute_plugin_hook", {
        pluginId: "dice-roller",
        hook: "roll_notation",
        payload: notation,
      })
        .then((resultStr) => {
          const res = JSON.parse(resultStr);
          addHistory(`${res.notation}: ${res.rolls} = ${res.total}`);
        })
        .catch(() => {
          addHistory(fallbackRoll(notation));
        });
    } else {
      addHistory(fallbackRoll(notation));
    }
  };

  const handleGenerateImage = () => {
    setIsGeneratingImage(true);
    setGeneratedImageUrl("");

    invoke<string>("generate_image", {
      prompt: imagePrompt,
      style: imageStyle,
      provider: imageProvider,
      model: imageModel,
      apiKey: imageApiKey || null,
      baseUrl: imageBaseUrl || null,
    })
      .then((dataUrl) => {
        setGeneratedImageUrl(dataUrl);
      })
      .catch((err) => {
        alert("Image generation failed: " + err);
      })
      .finally(() => {
        setIsGeneratingImage(false);
      });
  };

  const handleGenerateSpeech = () => {
    if (!ttsText.trim()) return;
    setIsGeneratingSpeech(true);
    setGeneratedSpeechUrl("");

    invoke<string>("generate_speech", {
      text: ttsText,
      provider: ttsProvider,
      apiKey: ttsApiKey || null,
      voice: ttsProvider === "openai" ? "alloy" : null,
      baseUrl: null,
    })
      .then((audioUrl) => {
        setGeneratedSpeechUrl(audioUrl);
      })
      .catch((err) => {
        alert("Speech generation failed: " + err);
      })
      .finally(() => {
        setIsGeneratingSpeech(false);
      });
  };

  const handleNormalizeVaultMarkdown = () => {
    if (!notes.length) return;

    Promise.all(
      notes.map((note) => {
        const normalizedContent = normalizeCampaignMarkdown(note.content, "save");
        const normalizedNote: CampaignNote = { ...note, content: normalizedContent };

        if (normalizedContent === note.content) {
          return Promise.resolve();
        }

        return saveNote(normalizedNote);
      }),
    )
      .then(() => loadNotes())
      .then(() => alert("Campaign vault markdown normalized successfully!"))
      .catch((err) => alert("Failed to normalize vault markdown: " + err));
  };

  const handleSelectNoteFromCanvas = (noteId: string) => {
    const targetNote = notes.find((n) => n.id === noteId);
    if (targetNote) {
      setSelectedNoteId(noteId);
      const isCanvas =
        targetNote.frontmatter?.type === "Canvas" || targetNote.path.endsWith(".canvas");
      if (isCanvas) {
        const parts = targetNote.path.split("/");
        parts.pop();
        const folderName = parts.join("/");
        setCurrentCanvasFolder(folderName);
        setActiveView("canvas");
      } else {
        setIsEditingNote(false);
        setActiveView("vault");
      }
    }
  };

  const handleSelectCanvas = (canvasPath: string) => {
    const targetNote = notes.find(
      (n) => n.frontmatter?.canvasPath === canvasPath || n.path === canvasPath,
    );
    if (targetNote) {
      setSelectedNoteId(targetNote.id);
      setActiveView("canvas");
    }
  };

  const handleTrashNote = (notePath: string) => {
    confirm(`Are you sure you want to move "${notePath}" to the trash?`, async () => {
      await trashNote(notePath);
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    confirm("Are you sure you want to delete this rule entry?", async () => {
      await deleteRule(ruleId);
    });
  };

  const handleEmptyTrash = () => {
    confirm("Are you sure you want to permanently delete all items in the trash?", async () => {
      await emptyTrash();
    });
  };

  const handleDeleteTrashedNote = (trashNotePath: string) => {
    confirm("Permanently delete this item from disk? This cannot be undone.", async () => {
      await deleteTrashedNote(trashNotePath);
    });
  };

  const backlinks = useMemo(() => {
    if (!selectedNoteId) return [];
    const currentNoteObj = notes.find((n) => n.id === selectedNoteId);
    if (!currentNoteObj) return [];

    return notes.filter((note) => {
      if (note.id === selectedNoteId) return false;
      const lowerTitle = currentNoteObj.title.toLowerCase();
      return (
        note.content.toLowerCase().includes(`[[${lowerTitle}]]`) ||
        note.content.toLowerCase().includes(`[[${lowerTitle}|`)
      );
    });
  }, [notes, selectedNoteId]);

  const handleRollCharacterSheetCb = () =>
    handleRollCharacterSheet(alert, async (note) => {
      try {
        await saveNote(note);
        setSelectedNoteId(note.id);
        setActiveView("vault");
      } catch (err) {
        alert("Failed to save character: " + err);
      }
    });

  const handleEvaluateEncounterThreatCb = () => handleEvaluateEncounterThreat(alert);

  return (
    <AppShell
      activeView={activeView}
      setActiveView={setActiveView}
      theme={theme}
      setTheme={setTheme}
      vaultPath={vaultPath}
      vaults={vaults}
      onSwitchVault={async (path) => {
        try {
          await switchVault(path);
          await refreshVaultData();
        } catch (err) {
          alert("Failed to switch vault: " + err);
        }
      }}
      onCreateVault={() => setShowNewVaultModal(true)}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      isSearchOpen={isSearchOpen}
      setIsSearchOpen={setIsSearchOpen}
      searchResults={searchResults}
      notes={notes}
      rules={rules}
      onSelectSearchResult={handleSelectSearchResult}
      searchRef={searchRef}
      onLoadTrash={loadTrashNotes}
      rightPanel={
        activeView !== "settings" ? (
          <RightDrawer
            activeView={activeView}
            isOpen={isRightDrawerOpen}
            setIsOpen={setIsRightDrawerOpen}
            tab={rightDrawerTab}
            setTab={setRightDrawerTab}
            scratchpadText={scratchpadText}
            setScratchpadText={setScratchpadText}
            diceNotation={diceNotation}
            setDiceNotation={setDiceNotation}
            diceHistory={diceHistory}
            rollDiceNotation={rollDiceNotation}
            pluginsList={pluginsList}
            handleRollCharacterSheet={handleRollCharacterSheetCb}
            handleEvaluateEncounterThreat={handleEvaluateEncounterThreatCb}
            currentChatMessages={agent.currentChatMessages}
            chatInput={agent.chatInput}
            setChatInput={agent.setChatInput}
            handleSendChatMessage={agent.handleSendChatMessage}
            vaultPath={vaultPath}
            resetCurrentVaultSession={agent.resetCurrentVaultSession}
            exportCurrentVaultSession={() => agent.exportCurrentVaultSession(getVaultLabel)}
            cloneCurrentVaultSession={agent.cloneCurrentVaultSession}
            sessionCloneTargetVaultPath={agent.sessionCloneTargetVaultPath}
            setSessionCloneTargetVaultPath={agent.setSessionCloneTargetVaultPath}
            vaults={vaults}
            imagePrompt={imagePrompt}
            setImagePrompt={setImagePrompt}
            imageStyle={imageStyle}
            setImageStyle={setImageStyle}
            isGeneratingImage={isGeneratingImage}
            generatedImageUrl={generatedImageUrl}
            handleGenerateImage={handleGenerateImage}
            ttsText={ttsText}
            setTtsText={setTtsText}
            ttsProvider={ttsProvider}
            isGeneratingSpeech={isGeneratingSpeech}
            generatedSpeechUrl={generatedSpeechUrl}
            handleGenerateSpeech={handleGenerateSpeech}
            backlinks={backlinks}
            setSelectedNoteId={setSelectedNoteId}
          />
        ) : (
          <SettingsRightPanel tab={settingsTab} setTab={setSettingsTab} />
        )
      }
    >
      {activeView === "dashboard" && (
        <DashboardView
          notes={notes}
          rules={rules}
          setActiveView={setActiveView}
          setSelectedNoteId={setSelectedNoteId}
        />
      )}

      {(activeView === "vault" || activeView === "canvas") && (
        <CampaignVaultView
          activeView={activeView}
          notesByFolder={notesByFolder}
          collapsedFolders={collapsedFolders}
          setCollapsedFolders={setCollapsedFolders}
          selectedNoteId={selectedNoteId}
          setSelectedNoteId={setSelectedNoteId}
          currentNote={currentNote}
          isEditingNote={isEditingNote}
          setIsEditingNote={setIsEditingNote}
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          editFrontmatter={editFrontmatter}
          setEditFrontmatter={setEditFrontmatter}
          editContent={editContent}
          setEditContent={setEditContent}
          setContextMenu={setContextMenu}
          activeFolderDropdown={null}
          setActiveFolderDropdown={() => {}}
          renderFolderDropdown={renderFolderDropdown}
          handleNewNote={() => handleNewNote()}
          handleNewFolder={handleNewFolder}
          handleTrashNote={handleTrashNote}
          renderMarkdown={renderMarkdown}
          currentCanvasFolder={currentCanvasFolder}
          setCurrentCanvasFolder={setCurrentCanvasFolder}
          handleNormalizeVaultMarkdown={handleNormalizeVaultMarkdown}
          triggerImmediateSave={immediateSave}
          notes={notes}
          setActiveView={setActiveView}
          onSelectNoteFromCanvas={handleSelectNoteFromCanvas}
          onSelectCanvas={handleSelectCanvas}
        />
      )}

      {activeView === "rules" && (
        <RulesView
          rulesByFolder={rulesByFolder}
          collapsedFolders={collapsedFolders}
          setCollapsedFolders={setCollapsedFolders}
          setContextMenu={setContextMenu}
          activeFolderDropdown={null}
          setActiveFolderDropdown={() => {}}
          renderFolderDropdown={renderFolderDropdown}
          selectedRuleId={selectedRuleId}
          setSelectedRuleId={setSelectedRuleId}
          isEditingRule={isEditingRule}
          setIsEditingRule={setIsEditingRule}
          handleNewRule={() => setShowNewRuleModal(true)}
          handleNewRuleFolder={handleNewRuleFolder}
          handleInsertRuleImage={handleInsertRuleImage}
          handleDeleteRule={handleDeleteRule}
          editRuleTitle={editRuleTitle}
          setEditRuleTitle={setEditRuleTitle}
          editRulePath={editRulePath}
          setEditRulePath={setEditRulePath}
          editRuleCategory={editRuleCategory}
          setEditRuleCategory={setEditRuleCategory}
          editRuleSource={editRuleSource}
          setEditRuleSource={setEditRuleSource}
          editRuleContent={editRuleContent}
          setEditRuleContent={setEditRuleContent}
          currentRule={currentRule}
          renderMarkdown={renderMarkdown}
        />
      )}

      {activeView === "ai" && (
        <AiView
          currentChatMessages={agent.currentChatMessages}
          chatInput={agent.chatInput}
          setChatInput={agent.setChatInput}
          handleSendChatMessage={agent.handleSendChatMessage}
        />
      )}

      {activeView === "trash" && (
        <TrashView
          trashedNotes={trashedNotes}
          handleEmptyTrash={handleEmptyTrash}
          handleRestoreNote={restoreNote}
          handleDeleteTrashedNote={handleDeleteTrashedNote}
        />
      )}

      {activeView === "settings" && (
        <SettingsView
          register={register}
          handleSubmit={handleSubmit}
          onSubmit={handleSaveSettingsCb}
          errors={errors}
          isDirty={isDirty}
          isValid={isValid}
          theme={theme}
          setTheme={setTheme}
          watch={watch}
          setValue={setValue}
          vaultPath={vaultPath}
          pluginsList={pluginsList}
        />
      )}

      <ContextMenu
        menu={contextMenu}
        onNoteTrash={handleTrashNote}
        onFolderTrash={handleTrashFolder}
        onRuleDelete={handleDeleteRule}
        onClose={() => setContextMenu(null)}
      />

      <NewRuleModal
        open={showNewRuleModal}
        onClose={() => setShowNewRuleModal(false)}
        onSave={(folder, title) => {
          if (title.trim()) {
            const newId = `rule-${Date.now()}`;
            const newRule: RuleEntry = {
              id: newId,
              title: title.trim(),
              path: `${folder}/${title.trim()}.md`,
              category: folder.split("/")[0] || "General",
              source: "Homebrew",
              content: `# ${title.trim()}\n\nWrite your rule details and mechanics here...`,
            };
            setRules((prev: RuleEntry[]) => [...prev, newRule]);
            setSelectedRuleId(newId);
            setIsEditingRule(true);
            setActiveView("rules");
          }
          setShowNewRuleModal(false);
        }}
      />

      <NewVaultModal
        open={showNewVaultModal}
        onClose={() => setShowNewVaultModal(false)}
        currentCanvasFolder={currentCanvasFolder}
      />

      <ConfirmModal
        open={confirmDialog.open}
        message={confirmDialog.message}
        onCancel={() => setConfirmDialog({ open: false, message: "" })}
        onConfirm={() => {
          pendingConfirm?.();
          setPendingConfirm(null);
          setConfirmDialog({ open: false, message: "" });
        }}
      />

      <PromptModal
        open={promptDialog.open}
        message={promptDialog.message}
        defaultValue={promptDialog.defaultValue}
        onCancel={() => {
          promptDialog.resolve(null);
          setPromptDialog({ open: false, message: "", defaultValue: "", resolve: () => {} });
        }}
        onSubmit={(value) => {
          promptDialog.resolve(value);
          setPromptDialog({ open: false, message: "", defaultValue: "", resolve: () => {} });
        }}
      />

      <AlertModal
        open={alertDialog.open}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, message: "" })}
      />

      <IngestModal
        open={ingestDialog.open}
        fileName={ingestDialog.fileName}
        onSelect={(mode) => {
          ingestDialog.onSelect?.(mode);
        }}
        onCancel={() =>
          setIngestDialog({ open: false, fileName: "", onSelect: null })
        }
      />

      <input
        type="file"
        id="srd-file-input"
        style={{ display: "none" }}
        accept=".md,.txt,.pdf"
        onChange={handleIngestSRD}
      />
      <input
        type="file"
        ref={assetFileInputRef}
        style={{ display: "none" }}
        accept={
          pendingAssetTarget?.type === "image"
            ? "image/*"
            : pendingAssetTarget?.type === "audio"
              ? "audio/*"
              : "*/*"
        }
        onChange={handleAssetFileSelected}
      />
    </AppShell>
  );
}

export default App;
